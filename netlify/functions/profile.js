// netlify/functions/profile.js
// GET /api/profile?uid={uid}
// 等效于 api/profile.py handler

const https = require("https");

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  const uid = query.uid || "";

  // UID 校验
  if (!uid || !/^\d+$/.test(uid) || uid.length > 18) {
    return json(200, { code: -1, data: null, error: "UID 只能输入数字" });
  }

  try {
    // 4 个 B 站接口并行
    const [info, relation, stat, videosRaw] = await Promise.all([
      biliGet(`https://api.bilibili.com/x/space/acc/info?mid=${uid}`),
      biliGet(`https://api.bilibili.com/x/relation?mid=${uid}`),
      biliGet(`https://api.bilibili.com/x/space/stat?mid=${uid}`),
      biliGet(`https://api.bilibili.com/x/space/arc/search?mid=${uid}&ps=10&pn=1`),
    ]);

    if (info.code !== 0) {
      const errMap = { "-352": "B站触发风控，请稍后再试", "-404": "用户不存在", "404": "用户不存在" };
      return json(200, { code: -1, data: null, error: errMap[String(info.code)] || "用户不存在" });
    }

    const d = info.data || {};
    const vipInfo = d.vip || {};
    const vipLabel = vipInfo && vipInfo.label ? vipInfo.label.text : null;
    const vipType = vipInfo ? (vipInfo.type != null ? vipInfo.type : vipInfo.vipType) : null;
    const official = d.official || {};
    const regtime = d.jointime || d.regtime || 0;

    const fans = (relation.data && relation.data.follower) || 0;
    const following = (relation.data && relation.data.following) || 0;
    const totalVideos = (stat.data && stat.data.video) || 0;

    const videoList = (videosRaw.data && videosRaw.data.list && videosRaw.data.list.vlist) || [];
    const videos = videoList.slice(0, 10).map((v) => ({
      title: v.title || "",
      length: fmtLen(v.length),
      play: v.play || 0,
      created: v.created || 0,
      bvid: v.bvid || "",
      aid: v.aid || 0,
    }));

    return json(200, {
      code: 0,
      data: {
        uid: String(uid), name: d.name, face: d.face, sex: d.sex, sign: d.sign, level: d.level,
        fans, following, vipType, vipLabel,
        official: { role: official.role || 0, title: official.title || "", desc: official.desc || "" },
        regtime, joinDays: computeJoinDays(regtime), videos, totalVideos, totalPlays: 0,
      },
      error: null,
    });
  } catch (e) {
    return json(200, { code: -1, data: null, error: "B站数据获取失败" });
  }
};

function biliGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Referer: "https://www.bilibili.com/" },
      timeout: 10000,
    }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

function computeJoinDays(regtime) {
  if (!regtime || regtime <= 0) return 0;
  const delta = Math.floor(Date.now() / 1000) - regtime;
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
