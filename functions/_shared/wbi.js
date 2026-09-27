/**
 * functions/_shared/wbi.js
 * B 站 Wbi 签名 + 请求工具(profile 等 Functions 共用,单一实现)
 *
 * 签名算法对齐 bilibili-api-python v17.4.2 的 utils/network.py:_enc_wbi:
 *   1. params 加入 wts(当前 Unix 秒)
 *   2. 按 key 排序后拼接为 query 串
 *   3. w_rid = MD5(query + mixin_key)
 * 注意:wts 必须参与签名。历史上只签业务参数(漏掉 wts)会被 B 站判 -403。
 */

// === MD5 纯 JS 实现(RFC 1321,表驱动) ===
// T 表由 floor(2^32 * |sin(i+1)|) 生成;scripts/verify_mvp.py 第 12 项会用
// Python hashlib 做逐向量回归,改动此处后必须重跑该项。
const MD5_T = [
  -680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426, -1473231341, -45705983,
  1770035416, -1958414417, -42063, -1990404162, 1804603682, -40341101, -1502002290, 1236535329,
  -165796510, -1069501632, 643717713, -373897302, -701558691, 38016083, -660478335, -405537848,
  568446438, -1019803690, -187363961, 1163531501, -1444681467, -51403784, 1735328473, -1926607734,
  -378558, -2022574463, 1839030562, -35309556, -1530992060, 1272893353, -155497632, -1094730640,
  681279174, -358537222, -722521979, 76029189, -640364487, -421815835, 530742520, -995338651,
  -198630844, 1126891415, -1416354905, -57434055, 1700485571, -1894986606, -1051523, -2054922799,
  1873313359, -30611744, -1560198380, 1309151649, -145523070, -1120210379, 718787259, -343485551,
];
const MD5_K = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  1, 6, 11, 0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12,
  5, 8, 11, 14, 1, 4, 7, 10, 13, 0, 3, 6, 9, 12, 15, 2,
  0, 7, 14, 5, 12, 3, 10, 1, 8, 15, 6, 13, 4, 11, 2, 9,
];
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5 = (() => {
  const hex = '0123456789abcdef'.split('');
  const add = (p, q) => (p + q) | 0;
  const rl = (v, s) => (v << s) | (v >>> (32 - s));
  const F = (b, c, d) => (b & c) | (~b & d);
  const G = (b, c, d) => (b & d) | (c & ~d);
  const H = (b, c, d) => b ^ c ^ d;
  const I = (b, c, d) => c ^ (b | ~d);
  const FN = [F, G, H, I];

  function md5cycle(x, k) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    for (let i = 0; i < 64; i++) {
      const q = FN[i >> 4](b, c, d);
      const tmp = add(add(add(a, q), k[MD5_K[i]] | 0), MD5_T[i]);
      const rot = rl(tmp, MD5_S[i]) | 0;
      a = d; d = c; c = b; b = add(rot, b);
    }
    x[0] = add(x[0], a); x[1] = add(x[1], b); x[2] = add(x[2], c); x[3] = add(x[3], d);
  }

  function md5blk(s) {
    // 64 字节(每字符一字节) → 16 个 32-bit 小端字
    const arr = new Array(16);
    for (let i = 0; i < 16; i++) {
      arr[i] = (s.charCodeAt(i * 4) | (s.charCodeAt(i * 4 + 1) << 8) | (s.charCodeAt(i * 4 + 2) << 16) | (s.charCodeAt(i * 4 + 3) << 24)) | 0;
    }
    return arr;
  }

  function hexStr(x) {
    let s = '';
    for (let i = 0; i < 4; i++) s += hex[(x >> (i * 8 + 4)) & 0xF] + hex[(x >> (i * 8)) & 0xF];
    return s;
  }

  function md51(s) {
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    for (let off = 0; off + 64 <= n; off += 64) {
      md5cycle(state, md5blk(s.substring(off, off + 64)));
    }
    let tail = s.substring(n - (n % 64)) + '\x80';
    while (tail.length % 64 !== 56) tail += '\x00';
    const bits = (n * 8) >>> 0;
    for (let i = 0; i < 4; i++) tail += String.fromCharCode((bits >>> (i * 8)) & 0xFF);
    for (let i = 0; i < 4; i++) tail += String.fromCharCode(0);
    for (let off = 0; off < tail.length; off += 64) {
      md5cycle(state, md5blk(tail.substring(off, off + 64)));
    }
    return state;
  }

  // 与 Python 的 s.encode("utf-8") 语义对齐:JS 字符串是 UTF-16,
  // 先转成"每字符一字节"的 UTF-8 字节串再走 MD5。
  function toUtf8(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) {
        out += String.fromCharCode(c);
      } else if (c < 0x800) {
        out += String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        const c2 = s.charCodeAt(i + 1);
        if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
          c = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
          i++;
          out += String.fromCharCode(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
        } else {
          out += String.fromCharCode(0xEF, 0xBF, 0xBD);
        }
      } else if (c >= 0xD800 && c <= 0xDFFF) {
        // 孤立代理项 → U+FFFD
        out += String.fromCharCode(0xEF, 0xBF, 0xBD);
      } else {
        out += String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }

  return function md5(s) {
    const st = md51(toUtf8(String(s)));
    return hexStr(st[0]) + hexStr(st[1]) + hexStr(st[2]) + hexStr(st[3]);
  };
})();

const MIXIN_KEY_ENC_TABLE = [
  46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,37,12,52,56,31,
  7,59,40,5,49,16,17,41,56,54,39,10,33,53,13,59,15,38,42,12,48,6,31,30,11,57,55,20,36,48,3,52,
  16,14,26,47,6,58,52,25,50,27,37,7,20,42,59,30,1,8,41,21,57,51,54,17,38,44,22,55,28,49,43,13,
  45,36,4,40,29,53,1,24,34,56,2,11,39,58,26,9,15,33,30,41,48,14,42,53,24,36,2,49,47,11,23,57,
  31,52,44,35,10,13,27,50,7,59,19,5,38,29,18,55,20,51,16,28,4,34,46,39,54,21,3,45,17,37,6,43,
  40,56,58,41,55,52,47,16,59,50,54,49,1,36,23,15,2,7,12,44,39,9,22,42,53,26,33,46,35,38,57,20,
  5,21,28,17,19,18,32,11,29,10,34,27,43,51,13,45,3,14,30,8,25,48,58,24,31,37,4,41,6,56,59,55,
];

let wbiCache = { img_key: '', sub_key: '', expires: 0 };
const WBI_TTL = 3600000;

// CORS 代理:直连被 B 站风控时按序回退(免费公共服务,仅作兜底)
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?url=',
];

/** 带 10s 超时的 fetch;按 [直连, ...代理] 顺序返回首个 ok 响应,全部失败返回 null。 */
export async function fetchWithProxy(url) {
  for (const proxy of ['', ...CORS_PROXIES]) {
    try {
      const fullUrl = proxy ? proxy + encodeURIComponent(url) : url;
      const resp = await fetch(fullUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) return resp;
      console.warn('proxy failed:', proxy || 'direct', 'status:', resp.status);
    } catch (e) {
      console.warn('proxy error:', proxy || 'direct', e && e.message);
    }
  }
  return null;
}

/** 从 /x/web-interface/nav 取 wbi keys,isolate 内缓存 1 小时。 */
async function getWbiKeys() {
  if (Date.now() < wbiCache.expires && wbiCache.img_key) return wbiCache;
  const resp = await fetchWithProxy('https://api.bilibili.com/x/web-interface/nav');
  if (!resp) throw new Error('Failed to fetch WBI keys');
  const data = await resp.json();
  const nav = data.data || {};
  const imgUrl = (nav.wbi_img || {}).img_url || nav.wbi_img_url || '';
  const subUrl = (nav.wbi_img || {}).sub_url || nav.wbi_sub_url || '';
  const imgKey = imgUrl ? imgUrl.split('/').pop().split('.')[0] : '';
  const subKey = subUrl ? subUrl.split('/').pop().split('.')[0] : '';
  if (!imgKey || !subKey) throw new Error('Failed to get WBI keys');
  wbiCache = { img_key: imgKey, sub_key: subKey, expires: Date.now() + WBI_TTL };
  return wbiCache;
}

function getMixin(imgKey, subKey) {
  const raw = imgKey + subKey;
  let mixin = '';
  for (const idx of MIXIN_KEY_ENC_TABLE) if (idx < raw.length) mixin += raw[idx];
  return mixin.slice(0, 32);
}

/**
 * Wbi 签名:wts 入签(与 bilibili_api.utils.network._enc_wbi 一致)。
 * wts 可显式传入(测试/调试用),默认取当前时间。
 * 返回 { w_rid, wts },调用方需把两者都附进 query。
 */
export function encWbi(params, mixinKey, wts) {
  if (wts == null) wts = Math.floor(Date.now() / 1000);
  const withWts = { ...params, wts: String(wts) };
  const sorted = Object.keys(withWts).sort().map(k => `${k}=${withWts[k]}`).join('&');
  return { w_rid: MD5(sorted + mixinKey), wts: String(wts) };
}

/** 签名后请求 B 站 API;失败返回 null(由调用方分类错误)。 */
export async function fetchBili(url, params = {}) {
  const keys = await getWbiKeys();
  const mixinKey = getMixin(keys.img_key, keys.sub_key);
  const signed = encWbi(params, mixinKey);
  const allParams = { ...params, ...signed };
  const qs = Object.entries(allParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const resp = await fetchWithProxy(`${url}?${qs}`);
  if (!resp) return null;
  return resp.json();
}
