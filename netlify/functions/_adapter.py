"""
netlify/functions/_adapter.py - Vercel ↔ Netlify 请求/响应适配器

Netlify Functions 入口签名: handler(event, context)
  - event 包含: httpMethod, path, headers, queryStringParameters, body, ...
  - 需要返回: {"statusCode": 200, "headers": {...}, "body": json_string}

Vercel 风格 handler 签名: handler(request)
  - request 是对象或 dict, 有 .query / .body 属性
  - 返回: {"code": 0, "data": {...}, "error": None}

本适配器把 Netlify event 包装成 Vercel 风格,调用业务 handler,
再把结果转成 Netlify 响应格式。
"""

from __future__ import annotations

import json
from typing import Any, Callable, Dict


class _NetlifyEventToVercelRequest:
    """把 Netlify event 包装成 api/*.py 的 Vercel handler 能识别的形态。"""

    def __init__(self, event: Dict[str, Any]):
        self._event = event

    @property
    def query(self) -> Dict[str, str]:
        qs = self._event.get("queryStringParameters") or {}
        # Netlify 有时传 None 值,过滤掉
        return {k: str(v) for k, v in qs.items() if v is not None}

    @property
    def queryStringParameters(self) -> Dict[str, str]:
        return self.query

    @property
    def body(self) -> Dict[str, Any]:
        raw = self._event.get("body") or "{}"
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode("utf-8")
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {}
        if isinstance(raw, dict):
            return raw
        return {}

    @property
    def headers(self) -> Dict[str, str]:
        return self._event.get("headers") or {}

    @property
    def httpMethod(self) -> str:
        return self._event.get("httpMethod", "GET")

    def get(self, key: str, default: Any = None) -> Any:
        """兼容 dict 风格访问。"""
        return self._event.get(key, default)


def handle_vercel(
    vercel_handler: Callable[[Any], Dict[str, Any]],
    event: Dict[str, Any],
    context: Any,
) -> Dict[str, Any]:
    """
    通用适配器: 把 Netlify event 转给 Vercel handler,返回 Netlify 响应。

    Args:
        vercel_handler: api/*.py 中的 handler 函数
        event: Netlify Functions 的 event 参数
        context: Netlify Functions 的 context 参数(暂未使用)

    Returns:
        Netlify Functions 响应格式:
        {"statusCode": 200, "headers": {...}, "body": json_string}
    """
    # 包装 request
    req = _NetlifyEventToVercelRequest(event)

    # 调用业务 handler
    result = vercel_handler(req)

    # 转为 Netlify 响应
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store, max-age=0",
        },
        "body": json.dumps(result, ensure_ascii=False),
    }