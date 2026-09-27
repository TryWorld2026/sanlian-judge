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
        "static/fonts.css",
        "static/js/brand.js",
        "static/js/report.js",
        "static/js/share.js",
        "static/js/rank.js",
        "static/js/danmu.js",
        "static/js/cache.js",
        "functions/api/profile.js",
        "functions/api/analyze.js",
        "functions/api/rank.js",
        "functions/api/avatar.js",
        "functions/_shared/wbi.js",
        "functions/_shared/prompts.js",
        "functions/_shared/llm.js",
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
    share_js = (REPO_ROOT / "static" / "js" / "share.js").read_text(encoding="utf-8")
    checks = [
        ("含 #page-report", 'id="page-report"' in html),
        ("含 #uid-input", 'id="uid-input"' in html),
        ("含 #btn-submit", 'id="btn-submit"' in html),
        ("含 #cert-card", 'id="cert-card"' in html),
        ("share.js 动态加载 html2canvas(多 CDN 回退)", "html2canvas" in share_js and "cdn.bootcdn.com" in share_js),
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
    section("4. JS 语法(node --check,ESM 模式)")
    import shutil, subprocess, tempfile

    node = shutil.which("node")
    if not node:
        check("node 可用", False, "未找到 node,跳过语法检查(请安装 Node.js)")
        return False

    js_files = [
        "static/js/brand.js", "static/js/report.js", "static/js/share.js",
        "static/js/rank.js", "static/js/cache.js", "static/js/danmu.js",
        "functions/api/profile.js", "functions/api/analyze.js",
        "functions/api/rank.js", "functions/api/avatar.js",
        "functions/_shared/wbi.js", "functions/_shared/prompts.js",
        "functions/_shared/llm.js",
    ]
    ok = True
    for f in js_files:
        path = REPO_ROOT / f
        if not path.exists():
            ok &= check(f"{f} 文件存在", False)
            continue
        # 拷贝为 .mjs 强制按 ES Module 解析,与 Cloudflare Workers 运行时一致
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td) / "syntax_check.mjs"
            tmp.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
            try:
                subprocess.run([node, "--check", str(tmp)], capture_output=True, text=True, timeout=30)
                ok &= check(f"{f} 语法正确", True)
            except subprocess.TimeoutExpired:
                ok &= check(f"{f} 语法正确", False, "node --check 超时")
            except subprocess.CalledProcessError as e:
                detail = (e.stderr or e.stdout or "").strip().splitlines()
                ok &= check(f"{f} 语法正确", False, detail[0] if detail else "parse error")
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


def verify_wbi_signature() -> bool:
    section("12. Wbi 签名回归(wts 必须入签)")
    import hashlib, shutil, subprocess, tempfile, urllib.parse
    from pathlib import Path as _Path

    node = shutil.which("node")
    if not node:
        check("node 可用", False, "未找到 node,跳过签名回归")
        return False

    # 固定输入,保证可重复
    params = {"mid": "546195"}
    wts = 1780000000
    mixin = "0123456789abcdef0123456789abcdef"

    # 参考算法:与 bilibili_api.utils.network._enc_wbi 一致
    signed = dict(params)
    signed["wts"] = wts
    query = urllib.parse.urlencode(sorted(signed.items()))
    expected = hashlib.md5((query + mixin).encode("utf-8")).hexdigest()

    wbi_uri = (REPO_ROOT / "functions" / "_shared" / "wbi.js").as_uri()
    runner = (
        "import { encWbi } from " + repr(wbi_uri) + ";\n"
        "const r = encWbi(" + repr(params) + ", " + repr(mixin) + ", " + str(wts) + ");\n"
        "console.log(JSON.stringify(r));\n"
    )
    try:
        with tempfile.TemporaryDirectory() as td:
            tmp = _Path(td) / "wbi_check.mjs"
            tmp.write_text(runner, encoding="utf-8")
            proc = subprocess.run([node, str(tmp)], capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            check("JS encWbi 可执行", False, (proc.stderr or "").strip()[:200])
            return False
        actual = json.loads(proc.stdout.strip())
        ok = True
        ok &= check("JS encWbi 可执行", True)
        ok &= check("w_rid 与参考算法一致", actual.get("w_rid") == expected,
                    f"expected={expected[:16]}... actual={str(actual.get('w_rid'))[:16]}...")
        ok &= check("wts 原样返回", actual.get("wts") == str(wts), f"actual={actual.get('wts')}")
        return ok
    except Exception as e:
        check("Wbi 签名回归", False, str(e))
        return False


def verify_md5_vectors() -> bool:
    section("13. MD5 向量回归(RFC 1321 + 填充边界)")
    import hashlib, shutil, subprocess, tempfile

    node = shutil.which("node")
    if not node:
        check("node 可用", False, "未找到 node,跳过 MD5 回归")
        return False

    cases = [
        "", "a", "abc", "message digest",
        "abcdefghijklmnopqrstuvwxyz",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        "1234567890123456789012345678901234567890123456789012345678901234567890",
        "中文测试", "a中b文c",
        "mid=546195&wts=1780000000" + "0123456789abcdef0123456789abcdef",
    ]
    # 填充边界:55/56/57/63/64/65/119/120/127/128 附近必须全覆盖
    for n in (1, 2, 3, 4, 5, 31, 32, 33, 55, 56, 57, 63, 64, 65, 66, 119, 120, 127, 128, 129, 200, 1000):
        cases.append("x" * n)

    src = (REPO_ROOT / "functions" / "_shared" / "wbi.js").read_text(encoding="utf-8")
    start = src.find("const MD5_T = [")
    end = src.find("})();", start) + len("})();")
    if start < 0 or end <= start:
        check("wbi.js 中定位 MD5 实现", False, "未找到 MD5_T 表")
        return False

    runner = (
        "const chunk = " + repr(src[start:end]) + ";\n"
        "const MD5 = (0, eval)(chunk + '\\nMD5');\n"
        "const cases = " + repr(cases) + ";\n"
        "console.log(cases.map(s => MD5(s)).join('\\n'));\n"
    )
    try:
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td) / "md5_vectors.mjs"
            tmp.write_text(runner, encoding="utf-8")
            proc = subprocess.run([node, str(tmp)], capture_output=True, text=True, timeout=60)
        if proc.returncode != 0:
            check("JS MD5 可执行", False, (proc.stderr or "").strip()[:200])
            return False
        actual = proc.stdout.strip().split("\n")
        ok = check("JS MD5 可执行", True)
        fails = 0
        for s, got in zip(cases, actual):
            want = hashlib.md5(s.encode("utf-8")).hexdigest()
            if got != want:
                fails += 1
                if fails <= 3:
                    print(f"      [FAIL] len={len(s)} want={want} got={got}")
        ok &= check(f"{len(cases)} 个向量与 hashlib 一致", fails == 0, f"{fails} 个不一致")
        return ok
    except Exception as e:
        check("MD5 向量回归", False, str(e))
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
    results.append(("Wbi 签名回归", verify_wbi_signature()))
    results.append(("MD5 向量回归", verify_md5_vectors()))

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
