/**
 * functions/api/profile.js
 * Cloudflare Pages Function - 代理 B 站 API 获取用户信息 (Wbi 签名)
 *
 * GET /api/profile?uid={uid}
 * 返回: {code: 0, data: {...}, error: null}
 */

// ====== MD5 纯 JS 实现 (兼容 Cloudflare Workers 无 node:crypto 环境) ======
const MD5 = (() => {
  const hex_chr = '0123456789abcdef'.split('');
  function md5cycle(x, k) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    c = ii(c, d, a, b, k[4], 15, -145523070); b = ii(b, c, d, a, k[11], 21, -1120210379);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function cmn(q, a, b, x, s, t) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function md51(s) {
    const n = s.length, state = [1732584193, -271733879, -1732584194, 271733878];
    let i, len = n * 2;
    for (i = 64; i <= len; i += 64) md5cycle(state, md5blk(s.substring(i / 2 - 32, i / 2)));
    const tail = s.substring(i / 2 - 32);
    const count = [0, 0], bits = [n * 8, 0];
    if (i / 2 - 32 < n) {
      const blk = md5blk(tail + '\x80' + '\x00'.repeat(63 - (tail.length + 8) % 64) + String.fromCharCode(...[bits[0] & 0xFF, (bits[0] >>> 8) & 0xFF, (bits[0] >>> 16) & 0xFF, (bits[0] >>> 24) & 0xFF, bits[1] & 0xFF, (bits[1] >>> 8) & 0xFF, (bits[1] >>> 16) & 0xFF, (bits[1] >>> 24) & 0xFF].slice(0, 8)));
      md5cycle(state, blk);
    }
    return state;
  }
  function md5blk(s) {
    const arr = new Array(16);
    for (let i = 0; i < 16; i++) arr[i] = s.charCodeAt(i * 2) + (s.charCodeAt(i * 2 + 1) << 16);
    return arr;
  }
  function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
  function hex(x) {
    let s = '';
    for (let i = 0; i < 4; i++) { s += hex_chr[(x >> (i * 8 + 4)) & 0x0F] + hex_chr[(x >> (i * 8)) & 0x0F]; }
    return s;
  }
  return function md5(s) {
    const state = md51(s);
    return hex(state[0]) + hex(state[1]) + hex(state[2]) + hex(state[3]);
  };
})();

// ====== Wbi 签名 ======
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

let wbiKeysCache = { img_key: '', sub_key: '', expires: 0 };
const WBI_TTL = 3600000;

async function getWbiKeys() {
  if (Date.now() < wbiKeysCache.expires && wbiKeysCache.img_key) return wbiKeysCache;
  const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' },
  });
  const data = await resp.json();
  const nav = data.data || {};
  const wbiImg = nav.wbi_img || {};
  const imgUrl = wbiImg.img_url || (nav.wbi_img_url || '');
  const subUrl = wbiImg.sub_url || (nav.wbi_sub_url || '');
  const imgKey = imgUrl ? imgUrl.split('/').pop().split('.')[0] : '';
  const subKey = subUrl ? subUrl.split('/').pop().split('.')[0] : '';
  if (!imgKey || !subKey) throw new Error('Failed to get WBI keys');
  wbiKeysCache = { img_key: imgKey, sub_key: subKey, expires: Date.now() + WBI_TTL };
  return wbiKeysCache;
}

function getMixinKey(imgKey, subKey) {
  const raw = imgKey + subKey;
  let mixin = '';
  for (const idx of MIXIN_KEY_ENC_TABLE) {
    if (idx < raw.length) mixin += raw[idx];
  }
  return mixin.slice(0, 32);
}

function encWbi(params, mixinKey) {
  const keys = Object.keys(params).sort();
  const sorted = keys.map(k => `${k}=${params[k]}`).join('&');
  const signStr = sorted + mixinKey;
  const wts = Math.floor(Date.now() / 1000);
  const wRid = MD5(signStr);
  return { w_rid: wRid, wts: String(wts) };
}

async function fetchBili(url, params = {}) {
  const keys = await getWbiKeys();
  const mixinKey = getMixinKey(keys.img_key, keys.sub_key);
  const signed = encWbi(params, mixinKey);
  const allParams = { ...params, ...signed };
  const qs = Object.entries(allParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const fullUrl = `${url}?${qs}`;
  const resp = await fetch(fullUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return null;
  return resp.json();
}

function computeJoinDays(rt) {
  if (!rt || rt <= 0) return 0;
  const delta = Math.floor(Date.now() / 1000) - rt;
  return delta > 0 ? Math.floor(delta / 86400) : 0;
}

function fmtLen(s) {
  if (!s) return '00:00';
  if (typeof s === 'string') return s;
  const sec = parseInt(s, 10);
  if (isNaN(sec) || sec < 0) return '00:00';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), r = sec % 60;
  return h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const uid = url.searchParams.get('uid') || '';

    if (!uid || !/^\d+$/.test(uid) || uid.length > 18) {
      return json({ code: -1, data: null, error: 'UID 只能输入数字' });
    }

    const [info, relation, stat, videosRaw] = await Promise.all([
      fetchBili('https://api.bilibili.com/x/space/acc/info', { mid: uid }),
      fetchBili('https://api.bilibili.com/x/space/relation', { mid: uid }),
      fetchBili('https://api.bilibili.com/x/space/stat', { mid: uid }),
      fetchBili('https://api.bilibili.com/x/space/arc/search', { mid: uid, ps: '10', pn: '1' }),
    ]);

    if (!info || info.code !== 0) {
      const errMap = { '-352': 'B站触发风控，请稍后再试', '-404': '用户不存在', '404': '用户不存在', '-401': 'B站认证失败，请稍后再试' };
      const errCode = info ? String(info.code) : 'unknown';
      return json({ code: -1, data: null, error: errMap[errCode] || '用户不存在' });
    }

    const d = info.data || {};
    const vipInfo = d.vip || {};
    const vipLabel = vipInfo && vipInfo.label ? vipInfo.label.text : null;
    const vipType = vipInfo ? (vipInfo.type != null ? vipInfo.type : vipInfo.vipType) : null;
    const official = d.official || {};
    const regtime = d.jointime || d.regtime || 0;
    const videoList = (videosRaw && videosRaw.data && videosRaw.data.list && videosRaw.data.list.vlist) || [];

    return json({
      code: 0, data: {
        uid: String(uid), name: d.name, face: d.face, sex: d.sex, sign: d.sign, level: d.level,
        fans: (relation && relation.data && relation.data.follower) || 0,
        following: (relation && relation.data && relation.data.following) || 0,
        vipType, vipLabel,
        official: { role: official.role || 0, title: official.title || '', desc: official.desc || '' },
        regtime, joinDays: computeJoinDays(regtime),
        videos: videoList.slice(0, 10).map(v => ({
          title: v.title || '', length: v.length || '00:00', play: v.play || 0,
          created: v.created || 0, bvid: v.bvid || '', aid: v.aid || 0,
        })),
        totalVideos: (stat && stat.data && stat.data.video) || 0, totalPlays: 0,
      }, error: null,
    });
  } catch (e) {
    return json({ code: -1, data: null, error: 'B站数据获取失败' });
  }
}