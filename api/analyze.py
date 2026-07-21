"""
/api/analyze - AI 人格分析

流程:
  1) 接收 POST {uid, profile}
  2) 校验 profile 完整性
  3) 渲染 prompts/system.md + prompts/user.md
  4) 调 Agnes 一次拿到 7 模块 JSON
  5) 容错解析(非 JSON -> 正则提取;字段缺失 -> 兜底默认)
  6) 成功后将 {uid, name, score=craziness.score, level, avatar, timestamp}
     写入排行榜(KV 优先,文件兜底)
  7) 返回 PRD §3.2 响应结构

错误码:
  - code: -1  业务异常(API Key 缺失、LLM 超时、JSON 解析失败等)
  - code:  0  成功
"""

from __future__ import annotations

import copy
import json
import threading
import time
import traceback
from typing import Any, Dict, Optional

from api._llm import call_llm, load_prompt
from api._rank_store import write_rank
from api.profile import _is_valid_uid


# ---------------------------------------------------------------------------
# 兜底默认(每个模块字段缺失时填进去)
# ---------------------------------------------------------------------------

DEFAULTS: Dict[str, Any] = {
    "personaType": {
        "type": "B站普通用户",
        "emoji": "🧑‍💻",
        "description": "这位B站居民尚未被本判官彻底解析,默认归类为神秘观察者。",
        "color": "#4ECDC4",
        "tags": ["神秘", "低调", "待解锁"],
        "dimensions": {
            "毒舌指数": 3,
            "创作热度": 3,
            "鸽子概率": 3,
            "氪金程度": 3,
        },
    },
    "pastLife": {
        "identity": "赛博浪人",
        "era": "互联网纪元",
        "description": "前世的你是一位云游四方的赛博浪人,穿行于各大论坛,以评论为剑,以点赞为盾。",
        "icon": "🌐",
    },
    "mentalState": {
        "level": "😐 焦虑",
        "position": 50,
        "description": "你的精神状态处于薛定谔的叠加态,今天正常明天发疯。",
        "mentalAge": "永远 18 岁",
        "advice": "少刷 B 站,多睡美容觉。",
    },
    "fortune2026": {
        "career": "2026 年你会找到一个让你心甘情愿加班的副业,但工资仍是玄学。",
        "wealth": "意外之财会从不知名角落冒出来——比如一封退款邮件。",
        "love": "桃花会出现在你最不修边幅的那天,准备好纸巾和口红。",
        "abstract": "你会因为一个莫名其妙的理由上热搜,但你本人一无所知。",
        "luckyColor": "赛博粉",
        "luckyNumber": 6,
    },
    "soulMate": {
        "name": "九尾狐",
        "avatarEmoji": "🦊",
        "similarity": 66,
        "reason": "你们都是 B 站的常住居民,精神频率莫名同步。",
    },
    "danmuStyle": {
        "oftenSay": ["好活", "绝了", "下次一定"],
        "neverSay": ["就这?", "一般般"],
        "verdict": "普通弹幕选手 🎯",
        "grade": "B",
    },
    "craziness": {
        "score": 50,
        "ranking": "离谱程度处于全站中位",
        "verdict": "你是一个正常人——这在 B 站已经很难得了。",
        "level": "有点怪",
    },
}


# ---------------------------------------------------------------------------
# Prompt 渲染
# ---------------------------------------------------------------------------


def _render_user_prompt(profile: Dict[str, Any]) -> str:
    """把 profile 字段填入 prompts/user.md 模板。"""
    template = load_prompt("user.md")
    official = profile.get("official") or {}
    return (
        template
        .replace("{uid}", str(profile.get("uid", "")))
        .replace("{name}", str(profile.get("name", "")))
        .replace("{face}", str(profile.get("face", "")))
        .replace("{sex}", str(profile.get("sex", "")))
        .replace("{sign}", str(profile.get("sign", "")))
        .replace("{level}", str(profile.get("level", 0) or 0))
        .replace("{fans}", str(profile.get("fans", 0) or 0))
        .replace("{following}", str(profile.get("following", 0) or 0))
        .replace("{vipType}", str(profile.get("vipType", 0) or 0))
        .replace("{vipLabel}", str(profile.get("vipLabel") or ""))
        .replace("{official_json}", json.dumps(official, ensure_ascii=False))
        .replace("{regtime}", str(profile.get("regtime", 0) or 0))
        .replace("{joinDays}", str(profile.get("joinDays", 0) or 0))
        .replace("{videos_json}", json.dumps(profile.get("videos", []) or [], ensure_ascii=False))
    )


# ---------------------------------------------------------------------------
# 容错合并
# ---------------------------------------------------------------------------


def _deep_merge_defaults(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """用 DEFAULTS 兜底缺失字段。"""
    out: Dict[str, Any] = {}
    for module, default_v in DEFAULTS.items():
        v = parsed.get(module)
        if not isinstance(v, dict):
            out[module] = copy.deepcopy(default_v)
            continue
        merged: Dict[str, Any] = {}
        for k, default_val in default_v.items():
            val = v.get(k, default_val)
            if isinstance(default_val, dict) and isinstance(val, dict):
                # 递归合并二级字段(如 dimensions)
                sub = copy.deepcopy(default_val)
                for dk, dv in val.items():
                    if dv is not None:
                        sub[dk] = dv
                merged[k] = sub
            elif val is None:
                merged[k] = copy.deepcopy(default_val)
            else:
                merged[k] = val
        # 补上 LLM 多给但默认里没有的字段
        for k, val in v.items():
            if k not in merged:
                merged[k] = val
        out[module] = merged
    return out


# ---------------------------------------------------------------------------
# 本地 handler 入口
# ---------------------------------------------------------------------------


def _parse_body(request: Any) -> Dict[str, Any]:
    """从 request 中解析 JSON body。"""
    body = getattr(request, "body", None)
    if body is None and isinstance(request, dict):
        body = request.get("body")
    if body is None:
        body = request.get("data") if isinstance(request, dict) else None
    if body is None:
        return {}
    if isinstance(body, (dict, list)):
        return body if isinstance(body, dict) else {}
    if isinstance(body, (bytes, bytearray)):
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:
            return {}
    if isinstance(body, str):
        try:
            return json.loads(body)
        except Exception:
            return {}
    return {}


def analyze(uid: str, profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    同步入口,供 handler / 测试脚本共用。

    uid   - B 站用户 UID
    profile - /api/profile 返回的 data 字段(可选,缺失时会自行拉取)
    """
    uid = str(uid or "").strip()
    if not _is_valid_uid(uid):
        return {"code": -1, "data": None, "error": "UID 只能输入数字"}

    if not profile:
        # 兜底:自行拉一次 profile
        try:
            from api.profile import get_profile

            profile_resp = get_profile(uid)
            if profile_resp.get("code") != 0:
                return {
                    "code": -1,
                    "data": None,
                    "error": f"无法获取B站数据: {profile_resp.get('error')}",
                }
            profile = profile_resp["data"]
        except Exception as exc:  # noqa: BLE001
            return {"code": -1, "data": None, "error": f"无法获取B站数据: {exc}"}

    # 1) 渲染 prompt
    try:
        system_prompt = load_prompt("system.md")
        user_prompt = _render_user_prompt(profile)
    except Exception as exc:  # noqa: BLE001
        return {"code": -1, "data": None, "error": f"Prompt 加载失败: {exc}"}

    # 2) 调 LLM (Agnes)
    try:
        parsed = call_llm(system_prompt, user_prompt)
    except ValueError as exc:
        # API Key 缺失等
        return {"code": -1, "data": None, "error": str(exc)}
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        # 区分超时
        if "timeout" in msg.lower() or "超时" in msg:
            return {"code": -1, "data": None, "error": "AI判官累了"}
        return {"code": -1, "data": None, "error": f"AI 分析失败: {msg}"}

    if not isinstance(parsed, dict):
        return {"code": -1, "data": None, "error": "AI 返回格式异常"}

    # 3) 容错合并
    data = _deep_merge_defaults(parsed)

    # 4) 触发排行榜写入(异步,不阻塞主返回)
    # write_rank 是文件 IO,异步化以缩短 API 响应时间
    try:
        craziness = data.get("craziness") or {}
        try:
            score = int(craziness.get("score", 0) or 0)
        except (TypeError, ValueError):
            score = 0
        level = craziness.get("level") or "有点怪"
        rank_entry = {
            "uid": uid,
            "name": profile.get("name", ""),
            "score": score,
            "level": level,
            "avatar": profile.get("face", ""),
            "timestamp": int(time.time()),
        }
        # 守护线程:主进程退出时会自动结束,无需 join
        t = threading.Thread(
            target=_safe_write_rank, args=(rank_entry,), daemon=True
        )
        t.start()
    except Exception:
        # 排行榜写入失败不应影响主结果
        pass

    return {"code": 0, "data": data, "error": None}


def _safe_write_rank(entry: Dict[str, Any]) -> None:
    """子线程中执行 write_rank,异常吞掉(排行榜写入失败不应影响主流程)。"""
    try:
        write_rank(entry)
    except Exception:  # noqa: BLE001
        import logging
        logging.exception("rank write failed")


def handler(request: Any) -> Dict[str, Any]:
    """本地 handler 入口(由 scripts/dev_server.py 适配 Flask request 后调用)。"""
    try:
        # 兼容 GET 调试
        if isinstance(request, dict) and request.get("query", {}).get("uid") and not _parse_body(request):
            uid = request["query"]["uid"]
            return analyze(uid, None)

        body = _parse_body(request)
        uid = str(body.get("uid", "") or "").strip()
        profile = body.get("profile") or None
        if not uid:
            return {"code": -1, "data": None, "error": "缺少 uid 参数"}
        return analyze(uid, profile)
    except Exception as exc:  # noqa: BLE001
        # 不泄露内部 traceback 给客户端
        import logging
        logging.exception("analyze handler error")
        return {
            "code": -1,
            "data": None,
            "error": "服务内部错误,请稍后重试",
        }


# ---------------------------------------------------------------------------
# 本地 CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import sys

    arg = sys.argv[1] if len(sys.argv) > 1 else "546195"
    print(json.dumps(handler({"query": {"uid": arg}}), ensure_ascii=False, indent=2))
