// netlify/functions/analyze.js
// POST /api/analyze
// Body: {uid, profile?}
// 等效于 api/analyze.py handler - AI 人格分析

const https = require("https");
const fs = require("fs");
const path = require("path");

const PROMPTS_DIR = path.join(__dirname, "..", "..", "prompts");
const STEPFUN_ENDPOINT = "https://api.stepfun.com/step_plan/v1/chat/completions";
const MODEL = "step-3.7-flash";
const TIMEOUT = 45000;
const MAX_RETRIES = 3;

const DEFAULTS = {
  personaType: { type: "B站普通用户", emoji: "🧑‍💻", description: "这位B站居民尚未被本判官彻底解析,默认归类为神秘观察者。", color: "#4ECDC4", tags: ["神秘", "低调", "待解锁"], dimensions: { "毒舌指数": 3, "创作热度": 3, "鸽子概率": 3, "氪金程度": 3 } },
  pastLife: { identity: "赛博浪人", era: "互联网纪元", description: "前世的你是一位云游四方的赛博浪人,穿行于各大论坛,以评论为剑,以点赞为盾。", icon: "🌐" },
  mentalState: { level: "😐 焦虑", position: 50, description: "你的精神状态处于薛定谔的叠加态,今天正常明天发疯。", mentalAge: "永远 18 岁", advice: "少刷 B 站,多睡美容觉。" },
  fortune2026: { career: "2026 年你会找到一个让你心甘情愿加班的副业,但工资仍是玄学。", wealth: "意外之财会从不知名角落冒出来——比如一封退款邮件。", love: "桃花会出现在你最不修边幅的那天,准备好纸巾和口红。", abstract: "你会因为一个莫名其妙的理由上热搜,但你本人一无所知。", luckyColor: "赛博粉", luckyNumber: 6 },
  soulMate: { name: "老番茄", mid: "546195", similarity: 66, reason: "你们都是 B 站的常住居民,精神频率莫名同步。" },
  danmuStyle: { oftenSay: ["好活", "绝了", "下次一定"], neverSay: ["就这?", "一般般"], verdict: "普通弹幕选手 🎯", grade: "B" },
  craziness: { score: 50, ranking: "离谱程度处于全站中位", verdict: "你是一个正常人——这在 B 站已经很难得了。", level: "有点怪" },
};

function loadPrompt(filename) {
  const filePath = path.join(PROMPTS_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error(`Prompt not found: ${filename}`);
  return fs.readFileSync(filePath, "utf-8");
}

function renderUserPrompt(profile) {
  const template = loadPrompt("user.md");
  const official = profile.official || {};
  return template
    .replace(/\{uid\}/g, profile.uid)
    .replace(/\{name\}/g, profile.name)
    .replace(/\{face\}/g, profile.face)
    .replace(/\{sex\}/g, profile.sex || "")
    .replace(/\{sign\}/g, profile.sign || "")
    .replace(/\{level\}/g, profile.level)
    .replace(/\{fans\}/g, profile.fans)
    .replace(/\{following\}/g, profile.following)
    .replace(/\{vipType\}/g, profile.vipType)
    .replace(/\{vipLabel\}/g, profile.vipLabel || "")
    .replace(/\{official_json\}/g, JSON.stringify(official))
    .replace(/\{regtime\}/g, profile.regtime)
    .replace(/\{joinDays\}/g, profile.joinDays)
    .replace(/\{videos_json\}/g, JSON.stringify(profile.videos || []));
}

function deepMergeDefaults(parsed) {
  const out = {};
  for (const [mod, dv] of Object.entries(DEFAULTS)) {
    const v = parsed[mod];
    if (!v || typeof v !== "object") { out[mod] = JSON.parse(JSON.stringify(dv)); continue; }
    const merged = {};
    for (const [k, val] of Object.entries(dv)) {
      const got = v[k];
      if (val && typeof val === "object" && !Array.isArray(val) && got && typeof got === "object" && !Array.isArray(got)) {
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

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers },
      timeout: TIMEOUT,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        try { const json = JSON.parse(Buffer.concat(chunks).toString()); if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`)); else resolve(json); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(data);
    req.end();
  });
}

async function callLLM(systemPrompt, userPrompt) {
  const apiKey = process.env.STEPFUN_API_KEY || process.env.STEP_API_KEY || "";
  if (!apiKey) throw new Error("STEPFUN_API_KEY 未配置");

  const ret = await retry(async () => {
    const resp = await httpPost(STEPFUN_ENDPOINT, {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7, max_tokens: 6000,
      response_format: { type: "json_object" },
    }, { Authorization: `Bearer ${apiKey}` });

    const choices = resp.choices || [];
    if (!choices.length) throw new Error("StepFun 返回空 choices");
    const content = (choices[0]?.message?.content || "").trim();
    if (!content) throw new Error("StepFun 返回空 content");

    let jsonText = content;
    const fence = content.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
    if (fence) jsonText = fence[1]; else jsonText = content.replace(/^```(?:json)?\s*|\s*```$/g, "");

    try { return JSON.parse(jsonText); } catch (_) {}
    return extractJsonBlock(jsonText);
  }, MAX_RETRIES);
  return ret;
}

function extractJsonBlock(text) {
  const start = text.indexOf("{");
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let end = start; end < text.length; end++) {
      const ch = text[end];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, end + 1)); } catch (_) { break; } } }
    }
  }
  throw new Error("无法解析 LLM JSON");
}

async function retry(fn, max) {
  let lastErr;
  for (let i = 1; i <= max; i++) {
    try { return await fn(); } catch (e) { lastErr = e; if (i < max) await sleep(Math.pow(2, i - 1) * 1000 + Math.random() * 500); }
  }
  throw lastErr;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// B站 API 调用 (用于 fetch profile fallback)
async function biliGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/" }, timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

async function fetchProfile(uid) {
  const [info, relation, stat, videosResp] = await Promise.all([
    biliGet(`https://api.bilibili.com/x/space/acc/info?mid=${uid}`),
    biliGet(`https://api.bilibili.com/x/relation?mid=${uid}`),
    biliGet(`https://api.bilibili.com/x/space/stat?mid=${uid}`),
    biliGet(`https://api.bilibili.com/x/space/arc/search?mid=${uid}&ps=10&pn=1`),
  ]);
  if (info.code !== 0) throw new Error(info.code === -352 ? "B站触发风控，请稍后再试" : "用户不存在");
  const d = info.data || {};
  const vipInfo = d.vip || {};
  const official = d.official || {};
  const regtime = d.jointime || d.regtime || 0;
  const videoList = (videosResp.data && videosResp.data.list && videosResp.data.list.vlist) || [];
  return {
    uid, name: d.name, face: d.face, sex: d.sex, sign: d.sign, level: d.level,
    fans: (relation.data && relation.data.follower) || 0,
    following: (relation.data && relation.data.following) || 0,
    vipType: vipInfo ? (vipInfo.type != null ? vipInfo.type : vipInfo.vipType) : null,
    vipLabel: vipInfo && vipInfo.label ? vipInfo.label.text : null,
    official: { role: official.role || 0, title: official.title || "", desc: official.desc || "" },
    regtime, joinDays: computeJoinDays(regtime),
    videos: videoList.slice(0, 10).map((v) => ({ title: v.title, length: fmtLen(v.length), play: v.play || 0, created: v.created || 0, bvid: v.bvid, aid: v.aid })),
    totalVideos: (stat.data && stat.data.video) || 0, totalPlays: 0,
  };
}

function computeJoinDays(rt) {
  if (!rt || rt <= 0) return 0;
  const delta = Math.floor(Date.now() / 1000) - rt;
  return delta > 0 ? Math.floor(delta / 86400) : 0;
}

function fmtLen(s) {
  if (!s) return "00:00";
  if (typeof s === "string") return s;
  const sec = parseInt(s, 10);
  if (isNaN(sec) || sec < 0) return "00:00";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), r = sec % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

function pad(n) { return String(n).padStart(2, "0"); }

function json(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) };
}

// 主 handler
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    let uid = String(body.uid || "").trim();
    let profile = body.profile || null;

    if (!uid || !/^\d+$/.test(uid) || uid.length > 18) {
      return json(200, { code: -1, data: null, error: "UID 只能输入数字" });
    }

    if (!profile) {
      try { profile = await fetchProfile(uid); }
      catch (e) {
        return json(200, { code: -1, data: null, error: "无法获取B站数据: " + e.message });
      }
    }

    let parsed;
    try {
      parsed = await callLLM(loadPrompt("system.md"), renderUserPrompt(profile));
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("timeout") || msg.includes("超时") || msg.includes("API Key")) return json(200, { code: -1, data: null, error: msg });
      return json(200, { code: -1, data: null, error: "AI 分析失败" });
    }

    if (!parsed || typeof parsed !== "object") return json(200, { code: -1, data: null, error: "AI 返回格式异常" });

    const data = deepMergeDefaults(parsed);
    return json(200, { code: 0, data, error: null });
  } catch (e) {
    return json(200, { code: -1, data: null, error: "服务内部错误" });
  }
};
