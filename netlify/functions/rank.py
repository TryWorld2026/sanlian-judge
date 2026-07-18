"""
netlify/functions/rank.py - Netlify Function 入口: /api/rank
"""
from __future__ import annotations

import sys
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from netlify.functions._adapter import handle_vercel
from api.rank import handler as vercel_handler


def handler(event, context):
    return handle_vercel(vercel_handler, event, context)