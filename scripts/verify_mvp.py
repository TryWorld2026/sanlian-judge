"""
端到端验证脚本: 验证 sanlian-judge MVP 的所有关键路径

运行: python scripts/verify_mvp.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))


def check(label: str, condition: bool, detail: str = "") -> bool:
    icon = "OK" if condition else "FAIL"
    line = f"  [{icon}] {label}"
    if detail:
        line += f" -- {detail}"
    print(line)
    return condition


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def verify_repo_structure() -> bool:
    section("1. 仓库结构")
    files = [
        "index.html",
        "requirements.txt",
        ".env.example",
        ".gitignore",
        "README.md",
        "CLAUDE.md",
        "api/profile.py",
        "api/analyze.py",
        "api/rank.py",
        "api/_llm.py",
        "api/_rank_store.py",
        "prompts/system.md",
        "prompts/user.md",
        "data/rank.json",
        "static/css/style.css",
        "static/js/brand.js",
        "static/js/report.js",
        "static/js/share.js",
        "static/js/rank.js",
        "static/js/danmu.js",
        "static/js/cache.js",
        "scripts/dev_server.py",
    ]
    all_ok = True
    for f in files:
        p = REPO_ROOT / f
        all_ok &= check(f, p.exists(), f"{p.stat().st_size if p.exists() else 0} bytes" if p.exists() else "missing")
    return all_ok


def verify_config() -> bool:
    section("2. 配置文件")
    ok = True

    reqs = (REPO_ROOT / "requirements.txt").read_text(encoding="utf-8")
    ok &= check("requirements.txt 含 bilibili-api-python", "bilibili-api-python" in reqs)
    ok &= check("requirements.txt 含 requests", "requests" in reqs)
    ok &= check("requirements.txt 含 flask", "flask" in reqs)

    env_ex = (REPO_ROOT / ".env.example").read_text(encoding="utf-8")
    ok &= check(".env.example 含 STEPFUN_API_KEY", "STEPFUN_API_KEY" in env_ex)

    gitignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
    ok &= check(".gitignore 排除 .env", ".env" in gitignore)
    ok &= check(".gitignore 排除 __pycache__", "__pycache__" in gitignore)
    return ok


def verify_html() -> bool:
    section("3. index.html 结构")
    html = (REPO_ROOT / "index.html").read_text(encoding="utf-8")
    checks = [
        ("含 #page-report", 'id="page-report"' in html),
        ("含 #uid-input", 'id="uid-input"' in html),
        ("含 #btn-submit", 'id="btn-submit"' in html),
        ("含 #cert-card", 'id="cert-card"' in html),
        ("CDN 引入 html2canvas", "html2canvas" in html),
        ("引入 fonts.css", "fonts.css" in html),
        ("引入 brand.js", "brand.js" in html),
        ("引入 report.js", "report.js" in html),
        ("引入 share.js", "share.js" in html),
        ("引入 rank.js", "rank.js" in html),
        ("引入 danmu.js", "danmu.js" in html),
        ("主按钮 开始鉴定", "开始鉴定" in html),
    ]
    ok = all(check(label, cond) for label, cond in checks)
    return ok


def verify_js_syntax() -> bool:
    section("4. JS 语法")
    js_files = ["brand.js", "report.js", "share.js", "rank.js", "cache.js", "danmu.js"]
    ok = True
    for fn in js_files:
        path = REPO_ROOT / "static" / "js" / fn
        ok &= check(f"{fn} 文件存在", path.exists())
    return ok


def verify_report_modules() -> bool:
    section("5. 报告页 8 模块渲染函数")
    report_js = (REPO_ROOT / "static" / "js" / "report.js").read_text(encoding="utf-8")
    modules = [
        ("模块1 核心身份卡", "renderProfile"),
        ("模块2 弹幕人格", "renderPersona"),
        ("模块3 赛博前世", "renderPastLife"),
        ("模块4 精神状态", "renderMental"),
        ("模块5 2026运势", "renderFortune"),
        ("模块6 灵魂伴侣", "renderSoulMate"),
        ("模块7 弹幕风格", "renderDanmu"),
        ("模块8 离谱指数", "renderCraziness"),
    ]
    ok = all(check(label, fn in report_js) for label, fn in modules)
    return ok


def verify_rank_data() -> bool:
    section("6. 排行榜预置数据")
    rank = json.loads((REPO_ROOT / "data" / "rank.json").read_text(encoding="utf-8"))
    ok = True
    ok &= check("rank.json 是数组", isinstance(rank, list))
    ok &= check("至少 5 条数据", len(rank) >= 5, f"实际 {len(rank)} 条")
    ok &= check("第 1 条数据有效", len(rank) > 0 and rank[0].get("name") and rank[0].get("score") > 0)
    ok &= check("按 score 降序", all(rank[i]["score"] >= rank[i+1]["score"] for i in range(len(rank)-1)))
    # 检查必备字段
    required = {"uid", "name", "score", "level"}
    for i, item in enumerate(rank):
        if not required.issubset(item.keys()):
            ok &= check(f"  第 {i+1} 条字段完整", False, f"缺少 {required - item.keys()}")
            break
    else:
        ok &= check("  所有条目字段完整", True)
    return ok


def verify_prompts() -> bool:
    section("7. Prompt 模板")
    sys_p = (REPO_ROOT / "prompts" / "system.md").read_text(encoding="utf-8")
    usr_p = (REPO_ROOT / "prompts" / "user.md").read_text(encoding="utf-8")
    ok = True
    ok &= check("system.md 非空", len(sys_p) > 50)
    ok &= check("user.md 非空", len(usr_p) > 500)
    # 检查 7 个模块都在 user.md 中
    modules = ["personaType", "pastLife", "mentalState", "fortune2026", "soulMate", "danmuStyle", "craziness"]
    for m in modules:
        ok &= check(f"user.md 含 {m}", m in usr_p)
    # 检查占位符
    placeholders = ["{name}", "{fans}", "{following}", "{level}", "{sign}"]
    for p in placeholders:
        ok &= check(f"user.md 占位符 {p}", p in usr_p)
    return ok


def verify_python_syntax() -> bool:
    section("8. Python 语法")
    import py_compile
    py_files = [
        "api/profile.py", "api/analyze.py", "api/rank.py",
        "api/_llm.py", "api/_rank_store.py",
    ]
    ok = True
    for f in py_files:
        path = REPO_ROOT / f
        try:
            py_compile.compile(str(path), doraise=True)
            ok &= check(f"{f} 编译通过", True)
        except py_compile.PyCompileError as e:
            ok &= check(f"{f} 编译通过", False, str(e))
    return ok


def verify_rank_endpoint() -> bool:
    section("9. /api/rank 端点（本地文件兜底）")
    try:
        # 未配置 KV 时应走 data/rank.json
        os.environ.pop("KV_REST_API_URL", None)
        os.environ.pop("KV_REST_API_TOKEN", None)
        from api.rank import handler
        result = handler({"query": {"page": "1", "limit": "20"}})
        ok = True
        ok &= check("返回 code:0", result.get("code") == 0)
        ok &= check("data.list 至少 5 条", len(result.get("data", {}).get("list", [])) >= 5,
                    f"实际 {len(result.get('data', {}).get('list', []))} 条")
        ok &= check("data.total > 0", result.get("data", {}).get("total", 0) > 0)
        ok &= check("第 1 条 score 最高", result["data"]["list"][0]["score"] >= result["data"]["list"][-1]["score"])
        return ok
    except Exception as e:
        check("rank handler 抛出异常", False, str(e))
        return False


def verify_analyze_input_validation() -> bool:
    section("10. /api/analyze 入参校验")
    try:
        from api.analyze import handler
        ok = True
        # 无 uid
        r = handler({"body": {}})
        ok &= check("缺少 uid 返回 code:-1", r.get("code") == -1)
        ok &= check("缺少 uid 错误信息含 'uid'", "uid" in r.get("error", "").lower())
        # 非数字 uid
        r = handler({"body": {"uid": "abc"}})
        ok &= check("非数字 uid 返回 code:-1", r.get("code") == -1)
        # 缺 API key
        os.environ.pop("STEPFUN_API_KEY", None)
        os.environ.pop("STEP_API_KEY", None)
        os.environ.pop("STEPFUN_TOKEN", None)
        r = handler({"body": {"uid": "546195", "profile": {"name": "test"}}})
        ok &= check("缺 API Key 返回 code:-1", r.get("code") == -1)
        ok &= check("缺 API Key 错误信息含 'STEPFUN'", "STEPFUN" in r.get("error", "").upper())
        return ok
    except Exception as e:
        check("analyze handler 校验抛出异常", False, str(e))
        return False


def verify_profile_input_validation() -> bool:
    section("11. /api/profile 入参校验")
    try:
        from api.profile import handler
        ok = True
        # 无 uid
        r = handler({"query": {}})
        ok &= check("缺少 uid 返回 code:-1", r.get("code") == -1)
        # 非数字 uid
        r = handler({"query": {"uid": "abc"}})
        ok &= check("非数字 uid 返回 code:-1", r.get("code") == -1)
        ok &= check("错误信息含 '数字'", "数字" in r.get("error", ""))
        # 超长 uid
        r = handler({"query": {"uid": "1" * 20}})
        ok &= check("超长 uid 返回 code:-1", r.get("code") == -1)
        return ok
    except Exception as e:
        check("profile handler 校验抛出异常", False, str(e))
        return False


def main() -> int:
    print("=" * 60)
    print("sanlian-judge MVP 端到端验证")
    print("=" * 60)

    results = []
    results.append(("仓库结构", verify_repo_structure()))
    results.append(("配置文件", verify_config()))
    results.append(("HTML 结构", verify_html()))
    results.append(("JS 语法", verify_js_syntax()))
    results.append(("8 模块渲染", verify_report_modules()))
    results.append(("排行榜数据", verify_rank_data()))
    results.append(("Prompt 模板", verify_prompts()))
    results.append(("Python 语法", verify_python_syntax()))
    results.append(("/api/rank 端点", verify_rank_endpoint()))
    results.append(("/api/analyze 校验", verify_analyze_input_validation()))
    results.append(("/api/profile 校验", verify_profile_input_validation()))

    print("\n" + "=" * 60)
    print("汇总")
    print("=" * 60)
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    for name, ok in results:
        print(f"  {'OK' if ok else 'FAIL'}  {name}")
    print(f"\n通过率: {passed}/{total} ({100*passed/total:.0f}%)")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
