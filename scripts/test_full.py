#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""端到端 API 测试脚本 - 参赛级验证"""
import requests
import time
import json
import sys

BASE = "http://localhost:5000"
PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"
WARN = "\033[93m⚠ WARN\033[0m"

results = {"pass": 0, "fail": 0, "warn": 0}
_key_map = {PASS: "pass", FAIL: "fail", WARN: "warn"}


def log(ok, msg):
    results[_key_map[ok]] += 1
    print(f"  {ok} {msg}")


def sep(title):
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)


# ========== 1. profile 端点 ==========
sep("[1] /api/profile - B站数据获取")

# 1.1 正常账号
t = time.time()
try:
    r = requests.get(f"{BASE}/api/profile", params={"uid": "517327498"}, timeout=30)
    dt = time.time() - t
    j = r.json()
    if j.get("code") == 0 and j.get("data", {}).get("name"):
        log(PASS, f"罗翔说刑法: {j['data']['name']} | fans={j['data'].get('fans')} | {dt:.2f}s")
    else:
        log(FAIL, f"code={j.get('code')} error={j.get('error')} | {dt:.2f}s")
except Exception as e:
    log(FAIL, f"请求异常: {e}")

# 1.2 不存在的 UID
try:
    r = requests.get(f"{BASE}/api/profile", params={"uid": "999999999999"}, timeout=30)
    j = r.json()
    if j.get("code") == -1 and "不存在" in (j.get("error") or ""):
        log(PASS, "不存在 UID 正确返回 -1")
    else:
        log(WARN, f"不存在 UID 返回 code={j.get('code')} (可能 B 站返回了空数据)")
except Exception as e:
    log(FAIL, f"请求异常: {e}")

# 1.3 空 UID
try:
    r = requests.get(f"{BASE}/api/profile", params={"uid": ""}, timeout=15)
    j = r.json()
    if j.get("code") == -1:
        log(PASS, "空 UID 正确返回错误")
    else:
        log(FAIL, f"空 UID 返回 code={j.get('code')}")
except Exception as e:
    log(FAIL, f"请求异常: {e}")

# 1.4 非法字符
try:
    r = requests.get(f"{BASE}/api/profile", params={"uid": "abc"}, timeout=15)
    j = r.json()
    if j.get("code") == -1:
        log(PASS, "非数字 UID 正确返回错误")
    else:
        log(FAIL, f"非数字 UID 返回 code={j.get('code')}")
except Exception as e:
    log(FAIL, f"请求异常: {e}")


# ========== 2. analyze 端点 ==========
sep("[2] /api/analyze - AI 分析(StepFun)")

# 2.1 正常分析(用小号,避免消耗大号配额)
t = time.time()
try:
    r = requests.post(f"{BASE}/api/analyze", json={"uid": "546195"}, timeout=180)
    dt = time.time() - t
    j = r.json()
    if j.get("code") == 0 and j.get("data"):
        d = j["data"]
        persona = d.get("personaType", {}).get("type", "")
        score = d.get("craziness", {}).get("score", -1)
        level = d.get("craziness", {}).get("level", "")
        modules = list(d.keys())
        if persona and persona != "B站原住民" and score != 50:
            log(PASS, f"老番茄: persona={persona} score={score} level={level} | {dt:.2f}s")
        else:
            log(WARN, f"分析结果疑似默认值: persona={persona} score={score} | {dt:.2f}s")
        print(f"     modules ({len(modules)}): {modules}")
        # 检查所有必需模块
        required = ["personaType", "craziness", "mentalAge", "soulMate", "pastLife", "fortune2026", "danmuStyle", "cyberTag"]
        missing = [m for m in required if m not in d]
        if missing:
            log(FAIL, f"缺失模块: {missing}")
        else:
            log(PASS, f"8 个模块齐全")
    else:
        log(FAIL, f"code={j.get('code')} error={j.get('error')} | {dt:.2f}s")
        print(f"     raw: {r.text[:300]}")
except Exception as e:
    log(FAIL, f"请求异常: {e}")


# ========== 3. rank 端点 ==========
sep("[3] /api/rank - 排行榜")

try:
    t = time.time()
    r = requests.get(f"{BASE}/api/rank", timeout=15)
    dt = time.time() - t
    j = r.json()
    if j.get("code") == 0:
        items = j.get("data", {}).get("items", [])
        log(PASS, f"排行榜获取成功 | {len(items)} 条 | {dt:.2f}s")
        if items:
            first = items[0]
            print(f"     第一名: {first.get('name', '?')} | score={first.get('score')} | uid={first.get('uid')}")
    else:
        log(FAIL, f"code={j.get('code')} error={j.get('error')}")
except Exception as e:
    log(FAIL, f"请求异常: {e}")


# ========== 4. avatar 端点 ==========
sep("[4] /api/avatar - 头像代理")

# 4.1 正常 B 站头像
try:
    t = time.time()
    r = requests.get(
        f"{BASE}/api/avatar",
        params={"url": "https://i0.hdslb.com/bfs/face/member/noface.jpg"},
        timeout=15,
    )
    dt = time.time() - t
    if r.status_code == 200 and "image" in (r.headers.get("Content-Type") or ""):
        log(PASS, f"B站头像代理: {len(r.content)} bytes | {r.headers.get('Content-Type')} | {dt:.2f}s")
    else:
        log(FAIL, f"status={r.status_code} ct={r.headers.get('Content-Type')}")
except Exception as e:
    log(FAIL, f"请求异常: {e}")

# 4.2 SSRF 防护
ssrf_urls = [
    ("http://169.254.169.254/latest/meta-data/?hdslb.com", "AWS 元数据"),
    ("http://localhost:5000/api/analyze?bilibili.com", "内网端点"),
    ("http://evil.com/?x=bilibili.com", "仿冒域名"),
    ("http://hdslb.com.evil.com/", "子域仿冒"),
    ("file:///etc/passwd", "file 协议"),
]
for url, desc in ssrf_urls:
    try:
        r = requests.get(f"{BASE}/api/avatar", params={"url": url}, timeout=10)
        if r.status_code == 400:
            log(PASS, f"SSRF 拦截: {desc}")
        else:
            log(FAIL, f"SSRF 未拦截: {desc} -> status={r.status_code}")
    except Exception as e:
        log(FAIL, f"SSRF 测试异常: {desc} - {e}")


# ========== 5. 首页与静态资源 ==========
sep("[5] 首页与静态资源")

# 5.1 首页
try:
    r = requests.get(f"{BASE}/", timeout=10)
    if r.status_code == 200 and "sanlian-judge" in r.text:
        log(PASS, "首页加载正常")
        if "?ts=" in r.text:
            log(PASS, "cache buster (ts=) 已注入")
        else:
            log(FAIL, "cache buster 未注入")
        if "Cache-Control" in r.headers and "no-store" in r.headers["Cache-Control"]:
            log(PASS, "首页 Cache-Control: no-store")
        else:
            log(WARN, f"首页 Cache-Control: {r.headers.get('Cache-Control')}")
    else:
        log(FAIL, f"首页异常: status={r.status_code}")
except Exception as e:
    log(FAIL, f"请求异常: {e}")

# 5.2 静态资源 Cache-Control
for path in ["static/js/share.js?ts=1", "static/fonts.css?ts=1"]:
    try:
        r = requests.get(f"{BASE}/{path}", timeout=10)
        cc = r.headers.get("Cache-Control", "")
        if "no-store" in cc or "no-cache" in cc:
            log(PASS, f"{path.split('/')[-1]}: {cc}")
        else:
            log(WARN, f"{path.split('/')[-1]}: Cache-Control={cc}")
    except Exception as e:
        log(FAIL, f"{path}: {e}")


# ========== 6. 边界用例 ==========
sep("[6] 边界用例")

# 6.1 超长 UID
try:
    r = requests.get(f"{BASE}/api/profile", params={"uid": "1" * 20}, timeout=15)
    j = r.json()
    if j.get("code") == -1:
        log(PASS, "超长 UID(20位)正确拒绝")
    else:
        log(WARN, f"超长 UID 返回 code={j.get('code')}")
except Exception as e:
    log(FAIL, f"请求异常: {e}")

# 6.2 UID = 0
try:
    r = requests.get(f"{BASE}/api/profile", params={"uid": "0"}, timeout=15)
    j = r.json()
    if j.get("code") == -1:
        log(PASS, "UID=0 正确拒绝")
    else:
        log(WARN, f"UID=0 返回 code={j.get('code')}")
except Exception as e:
    log(FAIL, f"请求异常: {e}")

# 6.3 analyze 无 uid
try:
    r = requests.post(f"{BASE}/api/analyze", json={}, timeout=15)
    j = r.json()
    if j.get("code") == -1:
        log(PASS, "analyze 无 uid 正确拒绝")
    else:
        log(FAIL, f"analyze 无 uid 返回 code={j.get('code')}")
except Exception as e:
    log(FAIL, f"请求异常: {e}")


# ========== 总结 ==========
sep("测试总结")
total = results["pass"] + results["fail"] + results["warn"]
print(f"  通过: {results['pass']}/{total}")
print(f"  失败: {results['fail']}/{total}")
print(f"  警告: {results['warn']}/{total}")
rate = results["pass"] / total * 100 if total else 0
print(f"  通过率: {rate:.1f}%")
print("=" * 60)
sys.exit(0 if results["fail"] == 0 else 1)
