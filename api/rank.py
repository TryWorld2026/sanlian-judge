"""
/api/rank - 离谱指数排行榜

GET /api/rank?type=craziness&page=1&limit=20

返回:
  {
    "code": 0,
    "data": {
      "list": [{uid, name, score, level, avatar, timestamp}, ...],
      "total": 156
    },
    "error": null
  }

数据源:本地文件 data/rank.json(预置示例数据 + analyze 写入的真实数据)
"""

from __future__ import annotations

import json
import os
import time
import traceback
from typing import Any, Dict

from api._rank_store import read_rank


# ---------------------------------------------------------------------------
# 本地 handler 入口
# ---------------------------------------------------------------------------


def _parse_query(request: Any) -> Dict[str, str]:
    query: Dict[str, str] = {}
    for attr in ("query", "queryStringParameters", "query_string", "params"):
        v = getattr(request, attr, None)
        if isinstance(v, dict):
            query.update({str(k): str(v[k]) for k in v.keys()})
    if not query and isinstance(request, dict):
        for key in ("query", "queryStringParameters", "params"):
            v = request.get(key)
            if isinstance(v, dict):
                query.update({str(k): str(val) for k, val in v.items()})
    return query


def handler(request: Any) -> Dict[str, Any]:
    """本地 handler 入口(由 scripts/dev_server.py 适配 Flask request 后调用)。"""
    try:
        query = _parse_query(request)
        try:
            page = int(query.get("page", 1) or 1)
        except Exception:
            page = 1
        try:
            limit = int(query.get("limit", 20) or 20)
        except Exception:
            limit = 20
        rank_type = (query.get("type", "craziness") or "craziness").strip()

        items, total = read_rank(page=page, limit=limit, rank_type=rank_type)
        return {
            "code": 0,
            "data": {
                "list": items,
                "total": total,
                "type": rank_type,
                "page": page,
                "limit": limit,
                "timestamp": int(time.time()),
            },
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.exception("rank handler error")
        return {
            "code": -1,
            "data": None,
            "error": "排行榜读取失败",
        }


# ---------------------------------------------------------------------------
# 本地 CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import sys

    page = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    print(json.dumps(handler({"query": {"page": page, "limit": 20}}), ensure_ascii=False, indent=2))
