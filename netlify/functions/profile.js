// netlify/functions/profile.js
// GET /api/profile?uid={uid}
// 使用 B站 Wbi 签名认证 (bilibili-api 库内部实现)

const crypto = require("crypto");

// 缓存 Wbi 密钥 (每小时刷新)
let wbiKeys = { img_key: "", sub_key: "", expires: 0 };
const WBI_TTL = 3600000; // 1h

const MIXIN_KEY_ENC_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 37, 12, 52, 56, 31,
  7, 59, 40, 5, 49, 16, 17, 41, 56, 54, 39, 10, 33, 53, 13, 59,
  15, 38, 42, 12, 48, 6, 31, 30, 11, 57, 55, 20, 36, 48, 3, 52,
  16, 14, 26, 47, 6, 58, 52, 25, 50, 27, 37, 7, 20, 42, 59, 30,
  1, 8, 41, 21, 57, 51, 54, 17, 38, 44, 22, 55, 28, 49, 43, 13,
  45, 36, 4, 40, 29, 53, 1, 24, 34, 56, 2, 11, 39, 58, 26, 9,
  15, 33, 30, 41, 48, 14, 42, 53, 24, 36, 2, 49, 47, 11, 23, 57,
  31, 52, 44, 35, 10, 13, 27, 50, 7, 59, 19, 5, 38, 29, 18, 55,
  20, 51, 16, 28, 4, 34, 46, 39, 54, 21, 3, 45, 17, 37, 6, 43,
  40, 56, 58, 41, 55, 52, 47, 16, 59, 50, 54, 49, 1, 36, 23, 15,
  2, 7, 12, 44, 39, 9, 22, 42, 53, 26, 33, 46, 35, 38, 57, 20,
  5, 21, 28, 17, 19, 18, 32, 11, 29, 10, 34, 27, 43, 51, 13, 45,
  3, 14, 30, 8, 25, 48, 58, 24, 31, 37, 4, 41, 6, 56, 59, 55,
];

async function getWbiKeys() {
  if (Date.now() < wbiKeys.expires && wbiKeys.img_key) return wbiKeys;
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/" },
  });
  const data = await res.json();
  const nav = data.data || {};
  const wbiImg = nav.wbi_img || {};
  const imgUrl = wbiImg.img_url || (nav.wbi_img_url || "");
  const subUrl = wbiImg.sub_url || (nav.wbi_sub_url || "");
  const imgKey = imgUrl ? imgUrl.split("/").pop().split(".")[0] : "";
  const subKey = subUrl ? subUrl.split("/").pop().split(".")[0] : "";
  if (!imgKey || !subKey) throw new Error("Failed to get WBI keys");
  wbiKeys = { img_key: imgKey, sub_key: subKey, expires: Date.now() + WBI_TTL };
  return wbiKeys;
}

function getMixinKey(imgKey, subKey) {
  let mixin = "";
  const raw = imgKey + subKey;
  for (const idx of MIXIN_KEY_ENC_TABLE) {
    if (idx < raw.length) mixin += raw[idx];
  }
  return mixin.slice(0, 32);
}

function encWbi(params, mixinKey) {
  const keys = Object.keys(params).sort();
  const sorted = keys.map((k) => `${k}=${params[k]}`).join("&");
  const signStr = sorted + mixinKey;
  const wts = Math.floor(Date.now() / 1000);
  const wRid = crypto.createHash("md5").update(signStr).digest("hex");
  return { w_rid: wRid, wts: String(wts) };
}

async function fetchBili(url, params = {}) {
  const keys = await getWbiKeys();
  const mixinKey = getMixinKey(keys.img_key, keys.sub_key);
  const signed = encWbi(params, mixinKey);
  const allParams = { ...params, ...signed };
  const qs = Object.entries(allParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const fullUrl = `${url}?${qs}`;
  const res = await fetch(fullUrl, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  return res.json();
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const uid = q.uid || "";

    if (!uid || !/^\d+$/.test(uid) || uid.length > 18) {
      return json(200, { code: -1, data: null, error: "UID 只能输入数字" });
    }

    const [info, relation, stat, videosRaw] = await Promise.all([
      fetchBili("https://api.bilibili.com/x/space/acc/info", { mid: uid }),
      fetchBili("https://api.bilibili.com/x/space/relation", { mid: uid }),
      fetchBili("https://api.bilibili.com/x/space/stat", { mid: uid }),
      fetchBili("https://api.bilibili.com/x/space/arc/search", { mid: uid, ps: "10", pn: "1" }),
    ]);

    if (!info || info.code !== 0) {
      const errMap = { "-352": "B站触发风控，请稍后再试", "-404": "用户不存在", "404": "用户不存在", "-401": "B站认证失败，请稍后再试" };
      const errCode = info ? String(info.code) : "unknown";
      return json(200, { code: -1, data: null, error: errMap[errCode] || "用户不存在" });
    }

    const d = info.data || {};
    const vipInfo = d.vip || {};
    const vipLabel = vipInfo && vipInfo.label ? vipInfo.label.text : null;
    const vipType = vipInfo ? (vipInfo.type != null ? vipInfo.type : vipInfo.vipType) : null;
    const official = d.official || {};
    const regtime = d.jointime || d.regtime || 0;
    const videoList = (videosRaw && videosRaw.data && videosRaw.data.list && videosRaw.data.list.vlist) || [];

    return json(200, {
      code: 0, data: {
        uid: String(uid), name: d.name, face: d.face, sex: d.sex, sign: d.sign, level: d.level,
        fans: (relation && relation.data && relation.data.follower) || 0,
        following: (relation && relation.data && relation.data.following) || 0,
        vipType, vipLabel,
        official: { role: official.role || 0, title: official.title || "", desc: official.desc || "" },
        regtime, joinDays: computeJoinDays(regtime),
        videos: videoList.slice(0, 10).map((v) => ({
          title: v.title || "", length: v.length || "00:00", play: v.play || 0,
          created: v.created || 0, bvid: v.bvid || "", aid: v.aid || 0,
        })),
        totalVideos: (stat && stat.data && stat.data.video) || 0, totalPlays: 0,
      }, error: null,
    });
  } catch (e) {
    return json(200, { code: -1, data: null, error: "B站数据获取失败" });
  }
};

function computeJoinDays(rt) {
  if (!rt || rt <= 0) return 0;
  const delta = Math.floor(Date.now() / 1000) - rt;
  return delta > 0 ? Math.floor(delta / 86400) : 0;
}

function json(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) };
}