"""
netlify/functions/_adapter.py

将 Netlify event 包装为 Vercel/Flask 风格的 request 对象，
供 api/*.py 的 handler 复用，无需修改业务代码。
"""

from __future__ import annotations

import json
import os
import sys

# 让 Netlify 能找到 api/ 包
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


class NetlifyRequest:
    """
    模拟 Vercel request 对象,核心属性:
      - query / queryStringParameters: dict  (query string)
      - body: 任意 (dict / str / bytes) — handler 内部用 _parse_body 解析
      - headers: dict
    """

    def __init__(self, event: dict) -> None:
        qsp = event.get("queryStringParameters") or {}
        self.query: dict = qsp
        self.queryStringParameters: dict = qsp
        self.query_string: str = ""
        self.headers: dict = event.get("headers") or {}
        self._body = event.get("body") or {}

    @property
    def body(self):
        # handler 内部的 _parse_body() 会 getattr(request, "body", None)
        # 这里直接返回已解析好的 dict
        return self._body


def netlify_handler(handler_fn):
    """
    把 api/*.py 的 handler 包装为 Netlify Function 入口。

    用法 (profile.py):
        from netlify.functions._adapter import netlify_handler
        from api.profile import handler as profile_handler

        def handler(event, context):
            return netlify_handler(profile_handler)(event, context)
    """
    method_map = {
        "GET": "GET",
        "POST": "POST",
    }

    def wrapper(event, context):
        req = NetlifyRequest(event)
        method = (event.get("httpMethod") or "GET").upper()

        # GET: 直接透传 query
        if method == "GET":
            result = handler_fn(req)
        else:
            # POST: body 已经在 __init__ 中解析
            result = handler_fn(req)

        status = 200 if result.get("code") == 0 else 500
        return {
            "statusCode": status,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps(result, ensure_ascii=False),
        }

    return wrapper
