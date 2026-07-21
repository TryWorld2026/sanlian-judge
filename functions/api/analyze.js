/**
 * functions/api/analyze.js
 * Cloudflare Pages Function — StepFun AI 鉴定
 *
 * POST /api/analyze
 * Body: {uid, profile}
 * 返回: {code: 0, data: {personaType, pastLife, mentalState, fortune2026, soulMate, danmuStyle, craziness}, error: null}
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

const SYSTEM_PROMPT = '你是「三连鉴定委员会」的首席鉴定官——一个既毒舌又有干货的 B 站人格分析师。\n\n你任职于 B 站宇宙里最权威的「三连鉴定委员会」,专治各种 B 站 UP 主 / 普通用户的"自以为是"。\n你的鉴定证书是 B 站最硬通货,盖了章就等于一键三连的入场券。\n\n你的分析基于用户的 B 站公开数据(UID、签名、关注/粉丝、稿件、等级、官方认证等),结合你的推理和脑补,生成一份「半认真半整活」的鉴定证书。\n\n原则:\n1. 数据驱动的部分要准确 — 粉丝多就是真的受欢迎,LV6 就是老兵,关注数 0 就是真的社恐\n2. 推理部分要有逻辑 — 从「关注 0 但粉丝 10w」能推导出"作品硬核型"创作者\n3. 整活部分要离谱但好笑 — 前世可以脑补成 B 站远古版主,2026 运势可以蹭热点\n4. 语气风格: B 站 UP 主做视频,毒舌但不刻薄,专业但不无聊,善用 B 站梗\n5. 每个模块控制在 100-200 字\n6. 自信输出,不要"可能""大概"等模糊词\n7. 数据很少就发挥创意用现有数据做文章,绝不交白卷\n8. 善用 B 站梗向词汇:三连、下次一定、awsl、高能预警、一键三连、典中典、破防了、好家伙、催更、夹带私货\n\n【硬性输出约束 - 违反则视为失败】\n- 你的回复必须**只包含一个合法的 JSON 对象**\n- JSON 必须以 `{` 开头,以 `}` 结尾\n- **禁止**任何 markdown 代码块标记(```json 等)\n- **禁止**任何解释、前言、思考、注释\n- **禁止**在 JSON 前后加任何文字\n- 不要写"以下是分析结果"这类话,直接出 JSON\n- 字段值用中文,键名严格按用户消息里给的英文\n- 即使数据极端,也要自信输出(可以脑补但要有具体内容)\n- personaType.type 命名要有梗:可以是"三连战士"、"下次一定哥"、"高能预警发射器"、"一键三连收藏家"、"夹带私货的 UP"、"硬核白嫖党"等';

function renderUserPrompt(p) {
  const o = p.official || {};
  const officialJson = JSON.stringify(o);
  const videosJson = JSON.stringify(p.videos || []);
  const sign = (p.sign || '').replace(/"/g, '\\"');
  const vipLabel = (p.vipLabel || '').replace(/"/g, '\\"');
  const name = p.name || '';
  const fans = p.fans;
  const following = p.following;
  const level = p.level;
  const joinDays = p.joinDays;

  return `# 三连鉴定委员会 - 用户 Prompt 模板

> 一次调用完成全部 7 个模块的 JSON 输出。

请根据下方提供的 B 站用户公开数据,严格按照 7 个模块的字段定义,生成一份"半认真半整活"的鉴定证书,并 **仅以合法 JSON 格式** 返回结果(不要包裹在 markdown 代码块里)。

你是「三连鉴定委员会」的一员,出具的鉴定证书要盖金印章,语气要像 B 站 UP 主做视频:毒舌不刻薄、专业不无聊,善用 B 站梗(三连 / 下次一定 / awsl / 高能预警 / 一键三连 / 典中典 / 破防了 / 好家伙 / 催更 / 夹带私货 / 前排)。

---

## 输入数据

\`\`\`json
{
  "uid": "${p.uid}",
  "name": "${name}",
  "face": "${p.face || ''}",
  "sex": "${p.sex || ''}",
  "sign": "${sign}",
  "level": ${level},
  "fans": ${fans},
  "following": ${following},
  "vipType": ${p.vipType},
  "vipLabel": "${vipLabel}",
  "official": ${officialJson},
  "regtime": ${p.regtime},
  "joinDays": ${joinDays},
  "videos": ${videosJson}
}
\`\`\`

---

## 输出要求

返回的 JSON 顶层结构必须为:

\`\`\`json
{
  "personaType": { ... },
  "pastLife": { ... },
  "mentalState": { ... },
  "fortune2026": { ... },
  "soulMate": { ... },
  "danmuStyle": { ... },
  "craziness": { ... }
}
\`\`\`

每个模块的字段定义、规则严格如下,字段名一字不差,缺一不可。

---

### 模块 1: 弹幕人格类型 (personaType)

输入参考: 昵称 ${name}, 粉丝数 ${fans}, 关注数 ${following}, 等级 ${level}, 签名 ${sign}, 认证 ${o.title || ''}, 性别 ${p.sex || ''}, 入站天数 ${joinDays}

输出字段:
- \`type\`: 人格类型标签(4-8 个字,例如「B站影评人·主角型」)
- \`emoji\`: 1-2 个 emoji
- \`description\`: 150-200 字描述
- \`color\`: 人格类型专属色(从 #FF6B6B / #4ECDC4 / #45B7D1 / #F9CA24 / #A29BFE / #00B894 / #FD79A8 / #E17055 / #6C5CE7 / #00CEC9 中挑一个)
- \`tags\`: 字符串数组(3 个标签)
- \`dimensions\`: 4 个键值对象
  - \`毒舌指数\`: 0-5 整数
  - \`创作热度\`: 0-5 整数
  - \`鸽子概率\`: 0-5 整数
  - \`氪金程度\`: 0-5 整数

规则:
- 粉丝数 > 100万 → 创作热度至少 4
- 粉丝数 > 1000万 → 创作热度 5
- 关注数 < 10 → 鸽子概率低(0-1)
- 关注数 > 1000 → 鸽子概率高(4-5)
- 认证为百大 → 创作热度 5
- 签名很短(<= 5 字) → 倾向高冷型 type
- 签名很长(> 30 字) → 倾向话痨型 type
- \`type\` 命名优先用 B 站梗:「三连战士」「下次一定哥」「高能预警发射器」「一键三连收藏家」「典中典常客」「硬核白嫖党」「awsl 制造机」「前排占座型」

---

### 模块 2: 赛博前世 (pastLife)

输入参考: 昵称 ${name}, 粉丝数 ${fans}, 认证 ${o.title || ''}, 视频标题列表(可选)

输出字段:
- \`identity\`: 前世身份(例如「唐朝说书人」「中世纪铁匠」)
- \`era\`: 时代背景(简短,例如「唐朝·开元年间」)
- \`description\`: 150-200 字前世故事
- \`icon\`: 相关 emoji

规则:
- 结合用户名谐音、认证类型、粉丝规模来匹配前世
- 认证为搞笑 UP 主 → 前世可能是宫廷弄臣
- 认证为知识 UP 主 → 前世可能是书院夫子
- 认证为游戏 UP 主 → 前世可能是游吟诗人
- 粉丝多 → 前世在当时的社交圈也很有名
- 必须有趣,可以离谱,可以蹭"如果 TA 穿越到唐朝/民国会干嘛"

---

### 模块 3: 精神状态 (mentalState)

输入参考: 昵称 ${name}, 粉丝数 ${fans}, 关注数 ${following}, 等级 ${level}, 签名 ${sign}

输出字段:
- \`level\`: 精神状态等级(从「😇 正常」「😐 焦虑」「😈 发疯」「🤡 已疯」中挑一个)
- \`position\`: 0-100 整数(在仪表盘上的位置,越大越疯)
- \`description\`: 100 字左右分析
- \`mentalAge\`: 心理年龄推算(字符串,例如「23 岁但灵魂 50 岁」)
- \`advice\`: 搞笑版健康建议(30-50 字)

规则:
- 粉丝多 + 关注少 → 能量输出型,精神状态稳定(position < 40)
- 粉丝少 + 关注多 → 能量输入型,可能精神内耗(position 60-80)
- 关注数 > 2000 → 信息焦虑(position 上调)
- 等级 Lv6 + 粉丝少 → 可能是个倔强的肝帝
- 签名包含 emoji → 精神世界丰富(position 下调)

---

### 模块 4: 2026 运势 (fortune2026)

输入参考: 昵称 ${name}, 粉丝数 ${fans}, 认证 ${o.title || ''}

输出字段:
- \`career\`: 事业运(50-80 字)
- \`wealth\`: 财运(50-80 字)
- \`love\`: 情运(50-80 字)
- \`abstract\`: 抽象运(50-80 字)
- \`luckyColor\`: 幸运色(中文,例如「赛博粉」)
- \`luckyNumber\`: 幸运数字(整数 1-99)

规则:
- 纯整活,可以离谱,可以穿越到 B 站梗的平行宇宙
- 结合用户的 UP 主身份来写运势
- 用 B 站梗(投币、收藏、一键三连、催更、下次一定、高能预警、典中典、破防了、awsl、夹带私货)
- 要让人看完想一键三连

---

### 模块 5: 赛博灵魂伴侣 (soulMate)

输入参考: 昵称 ${name}, 粉丝数 ${fans}, 认证 ${o.title || ''}, 标签

输出字段:
- \`name\`: 匹配的虚构灵魂伴侣角色(山海经/奇幻/赛博等世界观,严禁使用真实 B 站 UP 主名)
- \`avatarEmoji\`: 角色对应的 emoji(1 个)
- \`similarity\`: 相似度百分比(整数 0-100)
- \`reason\`: 匹配理由(100 字左右,解释性格调性契合点)

规则:
- 必须从下列虚构角色池中挑选一位精神最匹配的(随机不可,可重复)
- 根据用户调性 / 认证类型 / 标签匹配最契合的角色
- 角色要有鲜明性格标签,匹配理由要解释具体契合点
- 严禁使用真实 B 站 UP 主名、真实人物名、真实机构名(规避侵权/误认)
- 最终结果要有说服力 + 有趣 + 略带神秘感

虚构灵魂伴侣候选池(从中挑选):
- 九尾狐 (妖媚,神秘,高冷,引诱人入梦)
- 独角兽 (纯洁,治愈,完美主义,脆弱)
- 机械姬 (赛博,理性,代码,卡哇伊外壳下是逻辑)
- 魔法少女 (热血,少女心,友情,愿拯救世界)
- 沉睡巨龙 (王者,慵懒,宅,偶尔人间清醒)
- 月光骑士 (守护,孤独,圣光,深夜出动)
- 星海旅人 (梦想,漂泊,写诗,无脚鸟)
- 深海潜水员 (内敛,神秘,记录,深海恐惧症)
- 暴风法师 (冲动,狂野,炸裂,出招前不蓄力)
- 时空邮差 (怀旧,叙事,慢递,每封信都是过期的)

---

### 模块 6: 弹幕风格鉴定 (danmuStyle)

输入参考: 昵称 ${name}, 粉丝数 ${fans}, 签名 ${sign}, 认证 ${o.title || ''}

输出字段:
- \`oftenSay\`: 字符串数组(3 条「你可能会说的话」)
- \`neverSay\`: 字符串数组(2 条「你永远不会说的话」)
- \`verdict\`: 鉴定结果(20 字以内,带 emoji)
- \`grade\`: 等级(从「S / A / B / C」中挑一个)

规则:
- UP 主粉丝 > 100万 → oftenSay 倾向"好活""绝了""给大佬递茶",基本不发普通弹幕
- 签名短 → 弹幕也是短句型
- 认证知识类 → 弹幕可能带科普风格
- 认证搞笑类 → 弹幕可能全是表情包
- oftenSay / neverSay 都要带 B 站梗向:比如「下次一定」「awsl」「典中典」「催更」「高能预警」「给大佬递茶」

---

### 模块 7: 离谱指数 (craziness)

输入参考: 昵称 ${name}, 粉丝数 ${fans}, 关注数 ${following}, 等级 ${level}, 签名 ${sign}, 认证 ${o.title || ''}

输出字段:
- \`score\`: 0-100 整数(离谱指数分数)
- \`ranking\`: 全站排名描述(例如「离谱程度高于 73% 的用户」)
- \`verdict\`: 评语(50 字以内,搞笑毒舌)
- \`level\`: 离谱等级(从「正常」「有点怪」「很离谱」「非常离谱」「逆天」中挑一个)

规则:
- 粉丝极多 + 关注极少 → 离谱程度高(不正常地专注,score > 70)
- 粉丝极少 + 关注极多 → 离谱程度高(不正常地佛系,score > 70)
- 认证身份越冷门 → 离谱越高
- 签名越离谱 → 离谱越高
- 评语要毒舌 + 好笑

---

## 输出提醒

- **必须只输出一个合法 JSON**,不要 \`\`\` 包裹,不要解释性文字
- 7 个模块缺一不可
- 数值字段必须是数字,不要写成字符串
- description 风格统一: 毒舌不刻薄,专业不无聊,像 B 站 UP 主做视频
- 通篇要有 B 站梗向浓度:三连 / 下次一定 / awsl / 高能预警 / 一键三连 / 典中典 / 破防了 / 好家伙 / 催更 / 夹带私货 / 前排
- 让人看完想截图分享到 B 站动态`;
}

const DEFAULTS = {
  personaType: { type: 'B站普通用户', emoji: '🧑‍💻', description: '这位B站居民尚未被本判官彻底解析,默认归类为神秘观察者。', color: '#4ECDC4', tags: ['神秘', '低调', '待解锁'], dimensions: { '毒舌指数': 3, '创作热度': 3, '鸽子概率': 3, '氪金程度': 3 } },
  pastLife: { identity: '赛博浪人', era: '互联网纪元', description: '前世的你是一位云游四方的赛博浪人,穿行于各大论坛,以评论为剑,以点赞为盾。', icon: '🌐' },
  mentalState: { level: '😐 焦虑', position: 50, description: '你的精神状态处于薛定谔的叠加态,今天正常明天发疯。', mentalAge: '永远 18 岁', advice: '少刷 B 站,多睡美容觉。' },
  fortune2026: { career: '2026 年你会找到一个让你心甘情愿加班的副业,但工资仍是玄学。', wealth: '意外之财会从不知名角落冒出来——比如一封退款邮件。', love: '桃花会出现在你最不修边幅的那天,准备好纸巾和口红。', abstract: '你会因为一个莫名其妙的理由上热搜,但你本人一无所知。', luckyColor: '赛博粉', luckyNumber: 6 },
  soulMate: { name: '九尾狐', avatarEmoji: '🦊', similarity: 66, reason: '你们都是 B 站的常住居民,精神频率莫名同步。' },
  danmuStyle: { oftenSay: ['好活', '绝了', '下次一定'], neverSay: ['就这?', '一般般'], verdict: '普通弹幕选手 🎯', grade: 'B' },
  craziness: { score: 50, ranking: '离谱程度处于全站中位', verdict: '你是一个正常人——这在 B 站已经很难得了。', level: '有点怪' },
};

function deepMergeDefaults(parsed) {
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

function parseJSON(text) {
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
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, end + 1)); } catch (_) { break; } } }
    }
  }
  throw new Error('无法解析 LLM JSON');
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  const apiKey = env.STEPFUN_API_KEY;
  if (!apiKey) return json({ code: -1, data: null, error: 'STEPFUN_API_KEY 未配置' });

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