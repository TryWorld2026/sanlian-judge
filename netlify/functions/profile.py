"""
netlify/functions/profile.py - Netlify Function 入口: /api/profile

将 Netlify 请求适配到 Vercel 风格 handler。
"""
from __future__ import annotations

import sys
import os

# 将项目根目录加入 sys.path, 确保 `from api.profile import handler` 可用
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from netlify.functions._adapter import handle_vercel  # noqa: E402
from api.profile import handler as vercel_handler  # noqa: E402


def handler(event, context):
    return handle_vercel(vercel_handler, event, context)