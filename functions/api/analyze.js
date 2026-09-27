/**
 * functions/api/analyze.js
 * Cloudflare Pages Function — StepFun AI 鉴定
 *
 * POST /api/analyze
 * Body: {uid, profile}
 * 返回: {code: 0, data: {personaType, pastLife, mentalState, fortune2026, soulMate, danmuStyle, craziness}, error: null}
 */

import { SYSTEM_PROMPT, renderUserPrompt } from '../_shared/prompts.js';
import { DEFAULTS, deepMergeDefaults, parseJSON } from '../_shared/llm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ---------------------------------------------------------------------------
// 简单限流(尽力而为):按客户端 IP 计窗口,默认 20 次/分钟。
// 说明:Workers isolate 无共享状态,多实例下是各算各的;要硬限流请在
// Cloudflare 后台配置 Rate Liming 规则(域名 → /api/analyze)。
// ---------------------------------------------------------------------------
const RATE_LIMIT = { windowMs: 60000, max: 20 };
const _hits = new Map(); // ip -> {count, resetAt}

function isRateLimited(ip) {
  const now = Date.now();
  let rec = _hits.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + RATE_LIMIT.windowMs };
    _hits.set(ip, rec);
  }
  rec.count += 1;
  if (_hits.size > 1000) {
    for (const [k, v] of _hits) if (now > v.resetAt) _hits.delete(k);
  }
  return rec.count > RATE_LIMIT.max;
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  const apiKey = env.STEPFUN_API_KEY;
  if (!apiKey) return json({ code: -1, data: null, error: 'STEPFUN_API_KEY 未配置' });

  const clientIp = request.headers.get('CF-Connecting-IP') || 'anonymous';
  if (isRateLimited(clientIp)) {
    return json({ code: -1, data: null, error: '鉴定太火爆,请 1 分钟后再试' }, 429);
  }

  let body;
  try { body = await request.json(); } catch (_) { return json({ code: -1, data: null, error: '请求体必须是 JSON' }); }

  const uid = String(body.uid || '').trim();
  const profile = body.profile || null;
  if (!uid || !/^\d+$/.test(uid) || uid.length > 18) return json({ code: -1, data: null, error: 'UID 只能输入数字' });
  if (!profile) return json({ code: -1, data: null, error: '缺少 profile 数据' });

  let parsed;
  try {
    const userPrompt = renderUserPrompt(profile);
    let lastErr;
    for (let i = 1; i <= 3; i++) {
      try {
        const resp = await fetch('https://api.stepfun.com/step_plan/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'step-3.7-flash',
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
            temperature: 0.7, max_tokens: 6000, response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (!resp.ok) throw new Error(`StepFun HTTP ${resp.status}`);
        const data = await resp.json();
        const content = ((data.choices || [])[0]?.message?.content || '').trim();
        if (!content) throw new Error('空 content');
        parsed = parseJSON(content);
        break;
      } catch (e) { lastErr = e; if (i < 3) await new Promise(r => setTimeout(r, Math.pow(2, i - 1) * 1000 + Math.random() * 500)); }
    }
    if (!parsed) throw lastErr;
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('timeout') || msg.includes('API Key')) return json({ code: -1, data: null, error: msg });
    return json({ code: -1, data: null, error: 'AI 分析失败' });
  }

  return json({ code: 0, data: deepMergeDefaults(parsed), error: null });
}
