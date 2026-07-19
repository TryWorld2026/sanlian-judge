// netlify/functions/profile.js
// GET /api/profile?uid={uid}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const uid = q.uid || "";

    if (!uid || !/^\d+$/.test(uid) || uid.length > 18) {
      return json(200, { code: -1, data: null, error: "UID 只能输入数字" });
    }

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://www.bilibili.com/",
    };

    const [info, relation, stat, videosRaw] = await Promise.all([
      fetchJson(`https://api.bilibili.com/x/space/acc/info?mid=${uid}`, headers),
      fetchJson(`https://api.bilibili.com/x/relation?mid=${uid}`, headers),
      fetchJson(`https://api.bilibili.com/x/space/stat?mid=${uid}`, headers),
      fetchJson(`https://api.bilibili.com/x/space/arc/search?mid=${uid}&ps=10&pn=1`, headers),
    ]);

    if (!info || info.code !== 0) {
      const errMap = { "-352": "B站触发风控，请稍后再试", "-404": "用户不存在", "404": "用户不存在" };
      const err = info ? String(info.code) : "unknown";
      return json(200, { code: -1, data: null, error: errMap[err] || "用户不存在" });
    }

    const d = info.data || {};
    const vipInfo = d.vip || {};
    const vipLabel = vipInfo && vipInfo.label ? vipInfo.label.text : null;
    const vipType = vipInfo ? (vipInfo.type != null ? vipInfo.type : vipInfo.vipType) : null;
    const official = d.official || {};
    const regtime = d.jointime || d.regtime || 0;

    const videoList = (videosRaw && videosRaw.data && videosRaw.data.list && videosRaw.data.list.vlist) || [];
    const videos = videoList.slice(0, 10).map((v) => ({
      title: v.title || "", length: fmtLen(v.length), play: v.play || 0,
      created: v.created || 0, bvid: v.bvid || "", aid: v.aid || 0,
    }));

    return json(200, {
      code: 0, data: {
        uid: String(uid), name: d.name, face: d.face, sex: d.sex, sign: d.sign, level: d.level,
        fans: (relation && relation.data && relation.data.follower) || 0,
        following: (relation && relation.data && relation.data.following) || 0,
        vipType, vipLabel,
        official: { role: official.role || 0, title: official.title || "", desc: official.desc || "" },
        regtime, joinDays: computeJoinDays(regtime), videos,
        totalVideos: (stat && stat.data && stat.data.video) || 0, totalPlays: 0,
      }, error: null,
    });
  } catch (e) {
    return json(200, { code: -1, data: null, error: "B站数据获取失败" });
  }
};

async function fetchJson(url, headers = {}) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
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
