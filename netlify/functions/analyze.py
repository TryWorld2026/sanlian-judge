"""
netlify/functions/analyze.py
POST /api/analyze

Body: {uid, profile?}
直接调用 api/analyze.py handler,无需业务代码改动。
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from netlify.functions._adapter import netlify_handler
from api.analyze import handler as analyze_handler

def handler(event, context):
    return netlify_handler(analyze_handler)(event, context)
