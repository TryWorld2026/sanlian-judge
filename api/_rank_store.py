"""
api/_rank_store.py - 排行榜读写存储(纯本地文件)

读 / 写接口:
  - write_rank(item)         写入一条记录
  - read_rank(page, limit)   读取并按 score 降序分页返回

榜单 item 字段:
  {
    "uid": str,
    "name": str,
    "score": int,
    "level": str,
    "avatar": str,
    "timestamp": int   # Unix 秒
  }

存储:data/rank.json(原子写入,全局锁防止并发丢数据)
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

# 排行榜最多保留多少条(可通过环境变量调整)
MAX_RANK_ENTRIES = int(os.environ.get("MAX_RANK_ENTRIES", "50"))
DEFAULT_DATA_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "rank.json",
)

# 全局锁:序列化 write_rank,防止并发读-改-写丢数据
_rank_write_lock = threading.Lock()


def _safe_score(item: Dict[str, Any]) -> int:
    """安全提取 score,非数字返回 0。"""
    try:
        return int(item.get("score", 0) or 0)
    except (TypeError, ValueError):
        return 0


def _ensure_data_dir(path: str) -> None:
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d, exist_ok=True)


def _file_read_list(path: str) -> List[Dict[str, Any]]:
    if not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        # 文件损坏,备份后返回空,避免后续写入覆盖原数据
        try:
            shutil.copy(path, path + f".corrupt.{int(time.time())}")
        except Exception:
            pass
        return []
    except Exception:
        return []
    return []


def _file_write_list(path: str, items: List[Dict[str, Any]]) -> bool:
    """原子写入:先写临时文件,再 os.replace 替换(防止崩溃留半截 JSON)。"""
    try:
        _ensure_data_dir(path)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)  # 原子替换
        return True
    except Exception:
        return False


def _merge_and_trim(
    existing: List[Dict[str, Any]], new_item: Dict[str, Any], limit: int = MAX_RANK_ENTRIES
) -> List[Dict[str, Any]]:
    """按 uid 去重,加入 new_item 后按 score 降序裁剪到 limit。"""
    uid = str(new_item.get("uid", "")).strip()
    if not uid:
        return existing
    merged = [it for it in existing if str(it.get("uid", "")) != uid]
    merged.append(new_item)
    merged.sort(key=_safe_score, reverse=True)
    return merged[:limit]


def write_rank(item: Dict[str, Any]) -> bool:
    """写入一条排行榜记录。加全局锁序列化,防止并发读-改-写丢数据。"""
    if not item.get("uid"):
        return False
    item.setdefault("timestamp", int(time.time()))

    with _rank_write_lock:
        items = _file_read_list(DEFAULT_DATA_FILE)
        merged = _merge_and_trim(items, item)
        return _file_write_list(DEFAULT_DATA_FILE, merged)


def read_rank(
    page: int = 1, limit: int = 20, rank_type: str = "craziness"
) -> Tuple[List[Dict[str, Any]], int]:
    """读取排行榜,按 score 降序,返回 (list, total)。

    rank_type 当前仅支持 craziness,保留字段便于以后扩展。
    """
    items = _file_read_list(DEFAULT_DATA_FILE)

    # 过滤非法条目
    cleaned: List[Dict[str, Any]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        if "uid" not in it or "score" not in it:
            continue
        cleaned.append(it)

    cleaned.sort(key=_safe_score, reverse=True)
    total = len(cleaned)

    # 分页
    try:
        page = max(1, int(page))
        limit = max(1, min(100, int(limit)))
    except Exception:
        page, limit = 1, 20

    start = (page - 1) * limit
    end = start + limit
    return cleaned[start:end], total
