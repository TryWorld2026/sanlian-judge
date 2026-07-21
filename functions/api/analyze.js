/**
 * functions/api/analyze.js
 * Cloudflare Pages Function - StepFun AI 鉴定分析
 *
 * POST /api/analyze
 * Body: {uid, profile?}
 * 返回: {code: 0, data: {personaType, pastLife, mentalState, fortune2026, soulMate, danmuStyle, craziness}, error: null}
 */

import { SYSTEM_PROMPT, renderUserPrompt } from '../_utils/prompts.js';

const STEPFUN_ENDPOINT = 'https://api.stepfun.com/step_plan/v1/chat/completions';
const MODEL = 'step-3.7-flash';
const STEPFUN_TIMEOUT = 45000;
const MAX_RETRIES = 3;

const DEFAULTS = {
  personaType: { type: 'B站普通用户', emoji: '🧑‍💻', description: '这位B站居民尚未被本判官彻底解析,默认归类为神秘观察者。', color: '#4ECDC4', tags: ['神秘', '低调', '待解锁'], dimensions: { '毒舌指数': 3, '创作热度': 3, '鸽子概率': 3, '氪金程度': 3 } },
  pastLife: { identity: '赛博浪人', era: '互联网纪元', description: '前世的你是一位云游四方的赛博浪人,穿行于各大论坛,以评论为剑,以点赞为盾。', icon: '🌐' },
  mentalState: { level: '😐 焦虑', position: 50, description: '你的精神状态处于薛定谔的叠加态,今天正常明天发疯。', mentalAge: '永远 18 岁', advice: '少刷 B 站,多睡美容觉。' },
  fortune2026: { career: '2026 年你会找到一个让你心甘情愿加班的副业,但工资仍是玄学。', wealth: '意外之财会从不知名角落冒出来——比如一封退款邮件。', love: '桃花会出现在你最不修边幅的那天,准备好纸巾和口红。', abstract: '你会因为一个莫名其妙的理由上热搜,但你本人一无所知。', luckyColor: '赛博粉', luckyNumber: 6 },
  soulMate: { name: '老番茄', mid: '546195', similarity: 66, reason: '你们都是 B 站的常住居民,精神频率莫名同步。' },
  danmuStyle: { oftenSay: ['好活', '绝了', '下次一定'], neverSay: ['就这?', '一般般'], verdict: '普通弹幕选手 🎯', grade: 'B' },
  craziness: { score: 50, ranking: '离谱程度处于全站中位', verdict: '你是一个正常人——这在 B 站已经很难得了。', level: '有点怪' },
};

function deepMergeDefaults(parsed) {
  const out = {};
  for (const [mod, dv] of Object.entries(DEFAULTS)) {
    const v = parsed[mod];
    if (!v || typeof v !== 'object') { out[mod] = JSON.parse(JSON.stringify(dv)); continue; }
    const merged = {};
    for (const [k, val] of Object.entries(dv)) {
      const got = v[k];
      if (val && typeof val === 'object' && !Array.isArray(val) && got && typeof got === 'object' && !Array.isArray(got)) {
        const sub = JSON.parse(JSON.stringify(val));
        for (const [dk, gv] of Object.entries(got)) { if (gv != null) sub[dk] = gv; }
        merged[k] = sub;
      } else if (got == null) {
        merged[k] = JSON.parse(JSON.stringify(val));
      } else {
        merged[k] = got;
      }
    }
    for (const [k, val] of Object.entries(v)) { if (!(k in merged)) merged[k] = val; }
    out[mod] = merged;
  }
  return out;
}

async function callLLM(apiKey, systemPrompt, userPrompt) {
  let lastErr;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      const resp = await fetch(STEPFUN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 6000,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(STEPFUN_TIMEOUT),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`StepFun HTTP ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      const choices = data.choices || [];
      if (!choices.length) throw new Error('StepFun 返回空 choices');
      const content = (choices[0]?.message?.content || '').trim();
      if (!content) throw new Error('StepFun 返回空 content');

      // 三级 JSON 容错
      return parseJSON(content);
    } catch (e) {
      lastErr = e;
      if (i < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, Math.pow(2, i - 1) * 1000 + Math.random() * 500));
      }
    }
  }
  throw lastErr;
}

function parseJSON(text) {
  // 1) 直接解析
  try { return JSON.parse(text); } catch (_) {}

  // 2) 剥离 markdown 围栏
  const fence = text.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_) {} }

  // 3) 找首个平衡 {} 块
  const start = text.indexOf('{');
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let end = start; end < text.length; end++) {
      const ch = text[end];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, end + 1)); } catch (_) { break; } } }
    }
  }
  throw new Error('无法解析 LLM JSON');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    const apiKey = env.STEPFUN_API_KEY || '';
    if (!apiKey) {
      return json({ code: -1, data: null, error: 'STEPFUN_API_KEY 未配置' });
    }

    let body;
    try { body = await request.json(); } catch (_) {
      return json({ code: -1, data: null, error: '请求体必须是 JSON' });
    }

    let uid = String(body.uid || '').trim();
    let profile = body.profile || null;

    if (!uid || !/^\d+$/.test(uid) || uid.length > 18) {
      return json({ code: -1, data: null, error: 'UID 只能输入数字' });
    }

    if (!profile) {
      return json({ code: -1, data: null, error: '缺少 profile 数据，请先获取用户信息' });
    }

    let parsed;
    try {
      parsed = await callLLM(apiKey, SYSTEM_PROMPT, renderUserPrompt(profile));
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('timeout') || msg.includes('API Key')) {
        return json({ code: -1, data: null, error: msg });
      }
      return json({ code: -1, data: null, error: 'AI 分析失败' });
    }

    if (!parsed || typeof parsed !== 'object') {
      return json({ code: -1, data: null, error: 'AI 返回格式异常' });
    }

    const data = deepMergeDefaults(parsed);
    return json({ code: 0, data, error: null });
  } catch (e) {
    return json({ code: -1, data: null, error: '服务内部错误' });
  }
}