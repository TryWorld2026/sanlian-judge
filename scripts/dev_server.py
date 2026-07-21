"""
scripts/dev_server.py - sanlian-judge 本地一体化开发服务器

提供:
  - 静态文件服务 (index.html, static/*)
  - /api/profile   - B 站用户数据
  - /api/analyze   - StepFun AI 人格分析
  - /api/rank      - 排行榜
  - /api/avatar    - B 站头像代理(绕过 Chrome ORB)

启动:
  $env:STEPFUN_API_KEY = "sk-xxx"
  python scripts/dev_server.py

浏览器访问:http://localhost:5000
"""
from __future__ import annotations

import os
import sys

# 关键:开发环境下经常被 Windows 系统级代理污染(导致 B 站 API 失败)
# 启动前清空所有代理环境变量,让 requests 直连
for _k in list(os.environ.keys()):
    if _k.upper() in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
                       "http_proxy", "https_proxy", "all_proxy", "no_proxy"):
        del os.environ[_k]

import requests as _requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# 第三方依赖 (Flask)
try:
    import flask
    from flask import Flask, request, jsonify, send_from_directory
except ImportError:
    print("!! 缺少 Flask,请先执行: pip install flask")
    sys.exit(1)

# 项目后端 handler
from api.profile import handler as profile_handler  # noqa: E402
from api.analyze import handler as analyze_handler  # noqa: E402
from api.rank import handler as rank_handler  # noqa: E402


app = Flask(
    __name__,
    static_folder=os.path.join(ROOT, "static"),
    static_url_path="/static",
)


# ---------------------------------------------------------------------------
# 静态文件
# ---------------------------------------------------------------------------

import time

# index.html 模块级缓存(避免每次请求读盘)
_INDEX_HTML_CACHE: dict = {"mtime": 0, "html": ""}


def _get_index_html() -> str:
    """读取 index.html,基于 mtime 缓存。"""
    path = os.path.join(ROOT, "index.html")
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = 0
    if mtime != _INDEX_HTML_CACHE["mtime"]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                _INDEX_HTML_CACHE["html"] = f.read()
            _INDEX_HTML_CACHE["mtime"] = mtime
        except OSError:
            pass
    return _INDEX_HTML_CACHE["html"]


def _asset_ts() -> str:
    """基于 JS 文件 mtime 生成时间戳,确保文件修改后浏览器重新加载。"""
    try:
        js_dir = os.path.join(ROOT, "static", "js")
        max_mtime = 0
        for fn in os.listdir(js_dir):
            if fn.endswith(".js"):
                m = os.path.getmtime(os.path.join(js_dir, fn))
                if m > max_mtime:
                    max_mtime = m
        return str(int(max_mtime))
    except OSError:
        return str(int(time.time()))


@app.route("/")
def index():
    """首页 SPA 入口;用 str.replace 注入时间戳,避免 Jinja2 误解析 JS 模板。"""
    html = _get_index_html()
    rendered = html.replace("{{ ASSET_TS }}", _asset_ts())
    resp = flask.Response(rendered, mimetype="text/html")
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


@app.route("/favicon.ico")
def favicon():
    return ("", 204)


# ---------------------------------------------------------------------------
# 静态资源:HTML/JS/CSS 全部禁用缓存(开发期)
# ---------------------------------------------------------------------------

@app.route("/static/<path:filepath>")
def static_files(filepath):
    """静态资源不走浏览器缓存,保证改动立刻生效。"""
    resp = send_from_directory(os.path.join(ROOT, "static"), filepath)
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


# ---------------------------------------------------------------------------
# API 适配:把 Flask request 包装成 api/*.py handler 能识别的统一形态
# ---------------------------------------------------------------------------

class _LocalRequestAdapter:
    """把 Flask request 包装成 api/*.py 能识别的统一形态(query / body / headers)。"""

    def __init__(self, flask_request):
        self._r = flask_request

    @property
    def query(self):
        return {k: v for k, v in self._r.args.items()}

    @property
    def queryStringParameters(self):
        return self.query

    @property
    def query_string(self):
        return self._r.query_string.decode("utf-8") if isinstance(self._r.query_string, bytes) else str(self._r.query_string)

    @property
    def body(self):
        """返回 dict 形式 body。"""
        return self._r.get_json(silent=True) or {}


def _to_dict_response(payload):
    """把 handler 的 dict 返回值标准化为 Flask jsonify。"""
    if not isinstance(payload, dict):
        return jsonify({"code": -1, "data": None, "error": f"Handler 返回非 dict: {type(payload).__name__}"})
    return jsonify(payload)


# ---------------------------------------------------------------------------
# 三个 API 端点
# ---------------------------------------------------------------------------

@app.route("/api/profile", methods=["GET"])
def api_profile():
    req = _LocalRequestAdapter(request)
    return _to_dict_response(profile_handler(req))


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    # 严格校验 Content-Type,避免 Flask get_json(silent=True) 静默返回 None 导致错误提示不明
    ctype = (request.headers.get("Content-Type") or "").lower()
    if "application/json" not in ctype:
        return jsonify({
            "code": -1,
            "data": None,
            "error": "Content-Type 必须为 application/json",
        }), 415
    req = _LocalRequestAdapter(request)
    return _to_dict_response(analyze_handler(req))


@app.route("/api/rank", methods=["GET"])
def api_rank():
    req = _LocalRequestAdapter(request)
    return _to_dict_response(rank_handler(req))


# ---------------------------------------------------------------------------
# 头像代理:绕过 Chrome ORB (Opaque Response Blocking)
# B 站图片服务器不返回 CORS 头,html2canvas 截屏时会失败。
# 这里用我们自己的 origin 转发图片字节,加 CORS 头。
# ---------------------------------------------------------------------------

_ALLOWED_AVATAR_HOSTS = (
    "i0.hdslb.com",
    "i1.hdslb.com",
    "i2.hdslb.com",
    "i0.hdslb.cn",
    "i1.hdslb.cn",
    "i2.hdslb.cn",
    "s1.hdslb.com",
    "s2.hdslb.com",
    "bilivideo.com",
    "bilivideo.cn",
)


def _is_allowed_avatar_url(url: str) -> bool:
    """严格校验 hostname,防止 SSRF。
    用 urlparse 解析 hostname,做后缀匹配,避免子串绕过。
    """
    if not url or not url.startswith(("http://", "https://")):
        return False
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if not host:
            return False
        return any(host == h or host.endswith("." + h) for h in _ALLOWED_AVATAR_HOSTS)
    except Exception:
        return False


@app.route("/api/avatar", methods=["GET"])
def api_avatar():
    url = (request.args.get("url") or "").strip()
    if not _is_allowed_avatar_url(url):
        return ("invalid url", 400)
    try:
        # 每次请求新建 session,避免 cookie 跨用户泄漏
        r = _requests.get(
            url,
            timeout=8,
            stream=True,  # 流式下载,边下边检大小
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://www.bilibili.com/",
            },
        )
        r.raise_for_status()
        content_type = r.headers.get("Content-Type", "image/jpeg")
        if not content_type.startswith("image/"):
            r.close()
            return ("invalid content type", 400)
        # 边下边检大小,防止大文件消耗带宽(最大 2MB)
        downloaded = 0
        chunks = []
        for chunk in r.iter_content(8192):
            downloaded += len(chunk)
            if downloaded > 2 * 1024 * 1024:
                r.close()
                return ("file too large", 413)
            chunks.append(chunk)
        content = b"".join(chunks)
        return (
            content,
            200,
            {
                "Content-Type": content_type,
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=86400",
            },
        )
    except Exception as exc:
        import logging
        logging.warning("avatar proxy error url=%s exc=%s", url, exc)
        return ("proxy error", 502)


# ---------------------------------------------------------------------------
# 启动
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    print("=" * 60)
    print("sanlian-judge 本地服务器")
    print("=" * 60)
    print(f"  浏览器访问:http://localhost:{port}")
    print(f"  静态目录  :{os.path.join(ROOT, 'static')}")
    print(f"  API 路由  :/api/profile | /api/analyze | /api/rank")
    # 与 api/_llm.py 的 _get_api_key() 保持一致,只检测这三个变量
    has_key = any(os.environ.get(v) for v in ("STEPFUN_API_KEY", "STEP_API_KEY", "STEPFUN_TOKEN"))
    print(f"  LLM Key  :{'✓ 已配置' if has_key else '✗ 未配置(LLM 分析将返回 code:-1)'}")
    print("=" * 60)
    # 默认仅监听 127.0.0.1 避免暴露公网;如需局域网访问显式设置 HOST=0.0.0.0
    host = os.environ.get("HOST", "127.0.0.1")
    app.run(host=host, port=port, debug=False, threaded=True)
