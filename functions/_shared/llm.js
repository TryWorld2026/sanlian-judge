/**
 * functions/_shared/llm.js
 * StepFun 返回的 JSON 容错解析 + 兜底默认值(单一实现,与 api/analyze.py 的 DEFAULTS 对齐)
 */

export const DEFAULTS = {
  personaType: { type: 'B站普通用户', emoji: '🧑‍💻', description: '这位B站居民尚未被本判官彻底解析,默认归类为神秘观察者。', color: '#4ECDC4', tags: ['神秘', '低调', '待解锁'], dimensions: { '毒舌指数': 3, '创作热度': 3, '鸽子概率': 3, '氪金程度': 3 } },
  pastLife: { identity: '赛博浪人', era: '互联网纪元', description: '前世的你是一位云游四方的赛博浪人,穿行于各大论坛,以评论为剑,以点赞为盾。', icon: '🌐' },
  mentalState: { level: '😐 焦虑', position: 50, description: '你的精神状态处于薛定谔的叠加态,今天正常明天发疯。', mentalAge: '永远 18 岁', advice: '少刷 B 站,多睡美容觉。' },
  fortune2026: { career: '2026 年你会找到一个让你心甘情愿加班的副业,但工资仍是玄学。', wealth: '意外之财会从不知名角落冒出来——比如一封退款邮件。', love: '桃花会出现在你最不修边幅的那天,准备好纸巾和口红。', abstract: '你会因为一个莫名其妙的理由上热搜,但你本人一无所知。', luckyColor: '赛博粉', luckyNumber: 6 },
  soulMate: { name: '九尾狐', avatarEmoji: '🦊', similarity: 66, reason: '你们都是 B 站的常住居民,精神频率莫名同步。' },
  danmuStyle: { oftenSay: ['好活', '绝了', '下次一定'], neverSay: ['就这?', '一般般'], verdict: '普通弹幕选手 🎯', grade: 'B' },
  craziness: { score: 50, ranking: '离谱程度处于全站中位', verdict: '你是一个正常人——这在 B 站已经很难得了。', level: '有点怪' },
};

/** 用 DEFAULTS 逐字段兜底,保留 LLM 多给的字段。 */
export function deepMergeDefaults(parsed) {
  const out = {};
  for (const [mod, dv] of Object.entries(DEFAULTS)) {
    const v = parsed[mod];
    if (!v || typeof v !== 'object') { out[mod] = JSON.parse(JSON.stringify(dv)); continue; }
    const merged = { ...v };
    for (const [k, val] of Object.entries(dv)) {
      if (merged[k] == null) merged[k] = JSON.parse(JSON.stringify(val));
    }
    out[mod] = merged;
  }
  return out;
}

/** 三级容错:直接 parse → 剥 markdown 围栏 → 提取首个平衡 {...} 块;全部失败抛错。 */
export function parseJSON(text) {
  try { return JSON.parse(text); } catch (_) {}
  const fence = text.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_) {} }
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
      else if (ch === '}') depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, end + 1)); } catch (_) { break; } }
    }
  }
  throw new Error('无法解析 LLM JSON');
}
