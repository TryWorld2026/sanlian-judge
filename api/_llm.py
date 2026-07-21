"""
api/_llm.py - StepFun(阶跃星辰)调用工具 (OpenAI 兼容协议)

提供:
  - call_llm(system_prompt, user_prompt) -> dict
  - 3 次重试 + 指数退避
  - response_format=json_object
  - 缺失 API Key 抛 ValueError("STEPFUN_API_KEY 未配置")
  - 兼容旧名 call_deepseek / call_agnes 以便上层 analyze.py 无需改动
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Dict, Optional

import requests


# ---------------------------------------------------------------------------
# StepFun(阶跃星辰)配置
# ---------------------------------------------------------------------------
# 文档:https://platform.stepfun.com/  (OpenAI 兼容)
# 模型:step-3.7-flash(最新版,中文友好,支持 json_object,质量更高)
STEPFUN_ENDPOINT = "https://api.stepfun.com/step_plan/v1/chat/completions"
STEPFUN_MODEL = "step-3.7-flash"

# 单次 HTTP 超时:45s。重试 2 次(共 3 次调用),最坏耗时 = 45×3 + 退避 = 138s
# 前端 fetchAnalyze 超时为 180s,留足空间避免前端先超时
TIMEOUT_SECONDS = 45
MAX_RETRIES = 3


# ---------------------------------------------------------------------------
# API Key
# ---------------------------------------------------------------------------

def _get_api_key() -> str:
    """从环境变量中读取 StepFun API Key,缺失时抛 ValueError。
    支持的环境变量名:STEPFUN_API_KEY / STEP_API_KEY / STEPFUN_TOKEN
    """
    for var in ("STEPFUN_API_KEY", "STEP_API_KEY", "STEPFUN_TOKEN"):
        key = (os.environ.get(var) or "").strip()
        if key:
            return key
    raise ValueError("STEPFUN_API_KEY 未配置")


# ---------------------------------------------------------------------------
# JSON 提取容错
# ---------------------------------------------------------------------------

def _extract_json_block(text: str) -> Optional[str]:
    """从 LLM 文本中提取首个 JSON 对象 {...} 块。三次回退:"""
    if not text:
        return None
    cleaned = text.strip()
    # 先尝试剥任意位置的 ```json ... ``` 围栏(不限于首尾)
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1)
    else:
        # 只剥首尾围栏
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)

    # 1) 直接 parse
    try:
        json.loads(cleaned)
        return cleaned
    except Exception:
        pass

    # 2) 找首个平衡 { ... } 块
    start = cleaned.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escape = False
        for end in range(start, len(cleaned)):
            ch = cleaned[end]
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = cleaned[start : end + 1]
                    try:
                        json.loads(candidate)
                        return candidate
                    except Exception:
                        break
        start = cleaned.find("{", start + 1)
    return None


# ---------------------------------------------------------------------------
# 核心调用
# ---------------------------------------------------------------------------

def call_llm(
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.7,
    max_tokens: int = 6000,
    timeout: int = TIMEOUT_SECONDS,
    max_retries: int = MAX_RETRIES,
) -> Dict[str, Any]:
    """
    调 StepFun ChatCompletion,失败自动重试(指数退避)。

    成功返回解析后的 dict;解析失败抛 ValueError。
    """
    api_key = _get_api_key()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": STEPFUN_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    last_error: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.post(
                STEPFUN_ENDPOINT,
                headers=headers,
                json=payload,
                timeout=timeout,
            )
            # 5xx / 429 → 可重试的瞬时错误
            if resp.status_code >= 500 or resp.status_code == 429:
                raise RuntimeError(
                    f"StepFun transient error status={resp.status_code} body={resp.text[:200]}"
                )
            # 其它 4xx(401/403/400)→ 不可重试,直接抛 HTTPError
            if resp.status_code >= 400:
                raise requests.HTTPError(
                    f"StepFun {resp.status_code}: {resp.text[:200]}"
                )
            data = resp.json()
            choices = data.get("choices") or []
            if not choices:
                # 内容审核 / 限流会返回空 choices,可重试
                raise RuntimeError(
                    f"StepFun 返回空 choices (usage={data.get('usage')})"
                )
            choice = choices[0]
            message = choice.get("message", {})

            # StepFun 是常规 chat 模型,直接取 content 即可
            content = (message.get("content") or "").strip()
            finish_reason = choice.get("finish_reason", "")

            if not content:
                # content 空(模型抽风/限流),可重试
                raise RuntimeError(
                    f"StepFun 返回 content 为空 "
                    f"(finish_reason={finish_reason}, usage={data.get('usage')})"
                )

            json_text = _extract_json_block(content)
            if not json_text:
                # 调试信息:打印头尾各 300 字符,看 markdown 围栏/控制字符
                head = content[:300] if content else ""
                tail = content[-300:] if content else ""
                raise RuntimeError(
                    f"无法从 StepFun 返回中解析 JSON(len={len(content)}): "
                    f"HEAD={head!r} TAIL={tail!r}"
                )
            try:
                return json.loads(json_text)
            except json.JSONDecodeError as exc:
                # 控制字符/编码边界问题,可重试
                raise RuntimeError(
                    f"StepFun JSON 解析失败: {exc}"
                ) from exc
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_error = exc
        except requests.HTTPError as exc:
            # 4xx 不重试
            raise
        except RuntimeError as exc:
            # 瞬时错误(5xx/429/空choices/空content/JSON解析失败)→ 重试
            last_error = exc

        # 指数退避 + jitter:1s, 2s, 4s + 随机抖动
        if attempt < max_retries:
            import random
            sleep_s = (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            time.sleep(sleep_s)

    raise RuntimeError(
        f"StepFun 调用失败(已重试 {max_retries} 次): {last_error}"
    )


# 向后兼容:旧代码用 call_deepseek / call_agnes,这里别名
def call_deepseek(*args, **kwargs) -> Dict[str, Any]:
    """向后兼容:内部实际调 StepFun。"""
    return call_llm(*args, **kwargs)

def call_agnes(*args, **kwargs) -> Dict[str, Any]:
    """向后兼容:内部实际调 StepFun。"""
    return call_llm(*args, **kwargs)


# ---------------------------------------------------------------------------
# Prompt 加载
# ---------------------------------------------------------------------------

import functools


def _find_prompts_dir() -> str:
    """
    返回项目根目录下的 prompts/ 目录。
    """
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "prompts")


@functools.lru_cache(maxsize=8)
def load_prompt(filename: str) -> str:
    """从 prompts/ 目录读取 markdown 文本(带缓存,避免每次读盘)。"""
    prompts_dir = _find_prompts_dir()
    path = os.path.join(prompts_dir, filename)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()
