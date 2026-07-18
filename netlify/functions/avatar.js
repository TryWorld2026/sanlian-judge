// netlify/functions/avatar.js
// GET /api/avatar?url=<encoded_bilibili_avatar_url>
// 头像代理:绕过 Chrome ORB (Opaque Response Blocking)
// SSRF 防护:只允许 hdslb.com / hdslb.cn / bilivideo.com 域名

const https = require("https");
const http = require("http");
const { URL } = require("url");

const ALLOWED_HOSTS = new Set([
  "i0.hdslb.com", "i1.hdslb.com", "i2.hdslb.com",
  "i0.hdslb.cn", "i1.hdslb.cn", "i2.hdslb.cn",
  "s1.hdslb.com", "s2.hdslb.com",
  "bilivideo.com", "bilivideo.cn",
]);

function isAllowedUrl(url) {
  if (!url || !url.startsWith("http://") && !url.startsWith("https://")) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host) return false;
    return ALLOWED_HOSTS.has(host) || [...ALLOWED_HOSTS].some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.bilibili.com/",
        },
        timeout: 8000,
      },
      (res) => {
        const chunks = [];
        let downloaded = 0;
        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (downloaded > 2 * 1024 * 1024) {
            req.destroy();
            reject(new Error("file too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const contentType = res.headers["content-type"] || "image/jpeg";
          resolve({ contentType, content: Buffer.concat(chunks), status: res.statusCode });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  let url = (query.url || "").trim();

  if (!isAllowedUrl(url)) {
    return { statusCode: 400, headers: { "Content-Type": "text/plain" }, body: "invalid url" };
  }

  try {
    const res = await fetchUrl(url);
    const contentType = res.contentType;
    if (!contentType.startsWith("image/")) {
      return { statusCode: 400, headers: { "Content-Type": "text/plain" }, body: "invalid content type" };
    }

    const b64 = res.content.toString("base64");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
      },
      body: b64,
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 502, headers: { "Content-Type": "text/plain" }, body: "proxy error" };
  }
};
