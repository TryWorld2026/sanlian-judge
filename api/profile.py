"""
/api/profile - 获取 B 站用户公开数据

调用 bilibili-api-python 的 get_user_info / get_relation_info /
get_overview_stat / get_videos 四个能力,组合为 PRD §3.1 定义的响应结构。

异常分类:
  - B 站接口超时    -> code: -1, error: "B站接口开小差了"
  - 用户不存在      -> code: -1, error: "用户不存在"
  - B 站风控(-352) -> code: -1, error: "B站触发风控，请稍后再试"
  - 参数非法        -> code: -1, error: "UID 只能输入数字"
  - 其它未知错误    -> code: -1, error: "B站数据获取失败"
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Dict, List, Optional, Tuple

# 注意:代理环境变量清理移到 _fetch_user_full 函数内部,
# 避免模块级 import 副作用影响整个进程(如 StepFun 调用可能需要代理)

try:
    # 官方推荐写法:v17.x 系列
    from bilibili_api import user, sync
    from bilibili_api.exceptions import ResponseCodeException, NetworkException
except Exception:  # pragma: no cover - 依赖未安装时仍能 import 文件本身
    user = None  # type: ignore
    sync = None  # type: ignore
    ResponseCodeException = Exception  # type: ignore

    class NetworkException(Exception):  # type: ignore
        """bilibili_api 未安装时的哨兵基类(避免兜底为 Exception 吞掉所有异常)。"""
        pass


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

TIMEOUT_SECONDS = 10  # 单次 B 站接口超时阈值


def _ok(data: Dict[str, Any]) -> Dict[str, Any]:
    """统一成功响应结构。"""
    return {"code": 0, "data": data, "error": None}


def _err(code: int, error: str) -> Dict[str, Any]:
    """统一失败响应结构。"""
    return {"code": code, "data": None, "error": error}


def _parse_query(request: Any) -> Dict[str, str]:
    """从 request 中提取 query 参数,容忍多种入口形态。"""
    query: Dict[str, str] = {}

    # 1) 直接属性
    direct = getattr(request, "query", None)
    if isinstance(direct, dict):
        query.update({str(k): str(v) for k, v in direct.items()})

    # 2) 兼容多种 query 字段名 (Flask / 旧 Serverless 约定)
    for attr in ("queryStringParameters", "query_string", "params"):
        v = getattr(request, attr, None)
        if isinstance(v, dict):
            query.update({str(k): str(v[k]) for k in v.keys()})

    # 3) 兜底: dict 形态
    if not query and isinstance(request, dict):
        for key in ("query", "queryStringParameters", "params"):
            v = request.get(key)
            if isinstance(v, dict):
                query.update({str(k): str(val) for k, val in v.items()})

    return query


def _is_valid_uid(uid: str) -> bool:
    """UID 仅允许 1-18 位 ASCII 纯数字(B站 2023 年升级后最长 18 位)。
    拒绝 Unicode 数字(如阿拉伯数字 ١٢٣)和前导 0。
    """
    if not uid:
        return False
    if not uid.isascii() or not uid.isdigit():
        return False
    if len(uid) > 1 and uid.startswith("0"):
        return False
    return 1 <= len(uid) <= 18


def _compute_join_days(regtime: Optional[int]) -> int:
    """根据 regtime (Unix 秒) 计算入站天数,至少为 0。"""
    if not regtime or int(regtime) <= 0:
        return 0
    now = int(time.time())
    delta = now - int(regtime)
    if delta <= 0:
        return 0
    return delta // 86400


def _format_video_length(length: Any) -> str:
    """
    把视频时长格式化为 mm:ss 或 hh:mm:ss。

    B 站 v17 接口已经返回格式化好的字符串(如 "03:34"),
    如果传入的是秒数(int)则现场转换。
    """
    if length is None or length == "":
        return "00:00"
    if isinstance(length, str):
        return length
    try:
        seconds = int(length)
    except (TypeError, ValueError):
        return "00:00"
    if seconds < 0:
        return "00:00"
    h, rem = divmod(seconds, 3600)
    m, sec = divmod(rem, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{sec:02d}"
    return f"{m:02d}:{sec:02d}"


def _normalize_videos(raw_videos: Dict[str, Any], limit: int = 10) -> List[Dict[str, Any]]:
    """从 get_videos() 返回结构中提取最近 N 条精简信息。"""
    items = raw_videos.get("list", {}).get("vlist", []) if isinstance(raw_videos, dict) else []
    out: List[Dict[str, Any]] = []
    for v in items[:limit]:
        if not isinstance(v, dict):
            continue
        out.append(
            {
                "title": v.get("title", ""),
                "length": _format_video_length(v.get("length")),
                "play": int(v.get("play", 0) or 0),
                "created": int(v.get("created", 0) or 0),
                "bvid": v.get("bvid", ""),
                "aid": v.get("aid", 0),
            }
        )
    return out


# ---------------------------------------------------------------------------
# 核心数据获取
# ---------------------------------------------------------------------------


def _fetch_user_full(uid: str) -> Dict[str, Any]:
    """
    真实调用 B 站接口获取用户信息与视频列表。

    返回的 dict 已经是 PRD §3.1 `data` 字段的内容(不含外层 code/error 包装)。

    实现策略:4 个 B 站接口并行调用(get_user_info / get_relation_info /
    get_overview_stat / get_videos),把串行 ~40s 降到并行 ~10s。
    """
    if user is None or sync is None:
        raise RuntimeError("bilibili_api 未安装,请先 pip install -r requirements.txt")

    # 函数内清理代理环境变量,用完恢复(避免影响整个进程的 StepFun 调用)
    _saved_proxy = {}
    for _k in list(os.environ.keys()):
        if _k.upper() in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"):
            _saved_proxy[_k] = os.environ[_k]
            del os.environ[_k]

    u = user.User(uid=int(uid))

    info: Dict[str, Any] = {}
    relation: Dict[str, Any] = {}
    stat: Dict[str, Any] = {}
    videos_raw: Dict[str, Any] = {"list": {"vlist": []}}

    pool = ThreadPoolExecutor(max_workers=4)
    try:
        fut_info = pool.submit(_safe_sync, u.get_user_info)
        fut_relation = pool.submit(_safe_sync, u.get_relation_info)
        fut_stat = pool.submit(_safe_sync, u.get_overview_stat)
        fut_videos = pool.submit(_safe_sync, u.get_videos)

        # 主接口:get_user_info 必须成功,失败抛出
        info = fut_info.result(timeout=TIMEOUT_SECONDS)

        # 副接口:失败容错返回 {}
        try:
            relation = fut_relation.result(timeout=TIMEOUT_SECONDS) or {}
        except Exception:
            relation = {}
        try:
            stat = fut_stat.result(timeout=TIMEOUT_SECONDS) or {}
        except Exception:
            stat = {}
        try:
            videos_raw = fut_videos.result(timeout=TIMEOUT_SECONDS) or {"list": {"vlist": []}}
        except Exception:
            videos_raw = {"list": {"vlist": []}}
    finally:
        # 取消未完成的 future,避免 with 退出时 shutdown(wait=True) 永久阻塞
        pool.shutdown(wait=False, cancel_futures=True)
        # 恢复代理环境变量
        for _k, _v in _saved_proxy.items():
            os.environ[_k] = _v

    fans = int(relation.get("follower", 0) or 0) if isinstance(relation, dict) else 0
    following = int(relation.get("following", 0) or 0) if isinstance(relation, dict) else 0
    total_videos = int(stat.get("video", 0) or 0) if isinstance(stat, dict) else 0

    # 5) 整理字段
    vip_info = info.get("vip") or {}
    vip_label = (
        (vip_info.get("label") or {}).get("text")
        if isinstance(vip_info.get("label"), dict)
        else None
    )
    vip_type = vip_info.get("type") if isinstance(vip_info, dict) else None
    # 兼容老库字段名 vipType
    if vip_type is None:
        vip_type = vip_info.get("vipType") if isinstance(vip_info, dict) else None

    official = info.get("official") or {}
    # regtime 优先取 jointime,旧库字段名兜底
    regtime = int(info.get("jointime", 0) or 0)
    if regtime == 0:
        regtime = int(info.get("regtime", 0) or 0)

    # level: 新库扁平 int;老库为 level_info.current_level
    level_val = info.get("level")
    if level_val is None:
        level_info = info.get("level_info") or {}
        level_val = level_info.get("current_level") if isinstance(level_info, dict) else None

    return {
        "uid": str(uid),
        "name": info.get("name", ""),
        "face": info.get("face", ""),
        "sex": info.get("sex", ""),
        "sign": info.get("sign", ""),
        "level": level_val,
        "fans": fans,
        "following": following,
        "vipType": vip_type,
        "vipLabel": vip_label,
        "official": {
            "role": official.get("role", 0) if isinstance(official, dict) else 0,
            "title": official.get("title", "") if isinstance(official, dict) else "",
            "desc": official.get("desc", "") if isinstance(official, dict) else "",
        },
        "regtime": regtime,
        "joinDays": _compute_join_days(regtime),
        "videos": _normalize_videos(videos_raw, limit=10),
        "totalVideos": total_videos,
        "totalPlays": 0,  # v17 库无该字段,保持 0 占位
    }


def _safe_sync(coro_factory: Any) -> Any:
    """
    在子线程中执行 bilibili-api 的同步调用。

    bilibili-api-python 的 sync() 依赖 asyncio.get_event_loop(),
    而子线程默认没有 event loop,会抛 "An asyncio.Future, a coroutine
    or an awaitable is required"。

    解决方案:每个子线程创建独立的 event loop,跑完即关。
    coro_factory 必须是一个无参 callable,在子线程内现场创建 coroutine
    (避免跨线程传递已绑定的 coroutine)。

    内部加 asyncio.wait_for 超时,避免 coro 内部 hang 导致 loop 永不退出。
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        coro = coro_factory()  # 在子线程内创建 coroutine
        return loop.run_until_complete(
            asyncio.wait_for(coro, timeout=TIMEOUT_SECONDS)
        )
    finally:
        try:
            loop.run_until_complete(loop.shutdown_asyncgens())
        except Exception:
            pass
        # 不设 asyncio.set_event_loop(None)，避免线程池复用线程时后续
        # asyncio 操作因无 event loop 而失败
        loop.close()


def get_profile(uid: str) -> Dict[str, Any]:
    """供测试脚本与 handler 共用的同步入口,自带异常分类。"""
    uid = str(uid or "").strip()
    if not _is_valid_uid(uid):
        return _err(-1, "UID 只能输入数字")

    if user is None or sync is None:
        return _err(-1, "bilibili_api 未安装,无法获取B站数据")

    try:
        data = _fetch_user_full(uid)
        # 空昵风 / fans 全部为 0 且无视频 -> 极可能是用户不存在
        if (
            not data.get("name")
            and data.get("fans", 0) == 0
            and data.get("following", 0) == 0
            and not data.get("videos")
        ):
            return _err(-1, "用户不存在")
        return _ok(data)
    except (TimeoutError, FuturesTimeoutError) as exc:
        # Python 3.11+ FuturesTimeoutError 是 TimeoutError 子类
        # Python 3.10 及以下不是,需要显式捕获
        return _err(-1, "B站接口开小差了")
    except asyncio.TimeoutError:
        return _err(-1, "B站接口开小差了")
    except ResponseCodeException as exc:  # type: ignore[misc]
        # 已知 code: -352 风控 / -404 不存在
        try:
            code = int(getattr(exc, "code", 0) or 0)
        except Exception:
            code = 0
        if code == -352:
            return _err(-1, "B站触发风控，请稍后再试")
        if code == -404 or code == 404:
            return _err(-1, "用户不存在")
        return _err(-1, f"B站接口异常(code={code})")
    except NetworkException as exc:  # type: ignore[misc]
        return _err(-1, f"网络异常: {exc}")
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.exception("profile get_profile error uid=%s", uid)
        return _err(-1, f"B站数据获取失败: {exc}")


# ---------------------------------------------------------------------------
# 本地 handler 入口
# ---------------------------------------------------------------------------


def handler(request: Any) -> Dict[str, Any]:
    """
    本地 handler 入口(由 scripts/dev_server.py 适配 Flask request 后调用)。

    支持 GET /api/profile?uid=546195
    也支持本地用 dict 形式调试:
        handler({"query": {"uid": "546195"}})
    """
    try:
        query = _parse_query(request)
        uid = query.get("uid", "")
        return get_profile(uid)
    except Exception as exc:  # noqa: BLE001
        # 极端兜底,避免 500;不泄露内部 traceback 给客户端
        import logging
        logging.exception("profile handler error")
        return {
            "code": -1,
            "data": None,
            "error": "服务内部错误,请稍后重试",
        }


# ---------------------------------------------------------------------------
# 本地 CLI:python api/profile.py <uid>
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import sys

    arg = sys.argv[1] if len(sys.argv) > 1 else "546195"
    print(json.dumps(handler({"query": {"uid": arg}}), ensure_ascii=False, indent=2))
