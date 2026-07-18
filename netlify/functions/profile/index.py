"""netlify/functions/profile/index.py - GET /api/profile"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".."))
from netlify.functions._adapter import netlify_handler
from api.profile import handler as profile_handler
def handler(event, context):
    return netlify_handler(profile_handler)(event, context)
