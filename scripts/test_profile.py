"""
scripts/test_profile.py - 本地调试脚本

用法:
    python scripts/test_profile.py 546195
    python scripts/test_profile.py 46143887

说明:
    - 直接调用 api/profile.py 的 handler,传入 dict 形式 request
    - 不需要启动 Flask dev server,适合单步调试
    - 结果以 JSON 格式打印到 stdout
"""

from __future__ import annotations

import json
import os
import sys
import time

# 把项目根目录加入 sys.path,保证 `from api.profile import handler` 可用
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from api.profile import handler  # noqa: E402


SAMPLE_UIDS = ["546195", "46143887", "517327498", "946974", "99999999999"]


def run_one(uid: str) -> None:
    print(f"\n=== 正在拉取 UID={uid} ... ===")
    t0 = time.time()
    fake_request = {"query": {"uid": uid}}
    result = handler(fake_request)
    dt = (time.time() - t0) * 1000
    print(f"耗时: {dt:.0f}ms")
    print(json.dumps(result, ensure_ascii=False, indent=2))


def main() -> int:
    if len(sys.argv) > 1:
        uids = sys.argv[1:]
    else:
        uids = SAMPLE_UIDS

    for uid in uids:
        try:
            run_one(uid)
        except Exception as exc:  # noqa: BLE001
            print(f"!! UID={uid} 调用异常: {exc}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
