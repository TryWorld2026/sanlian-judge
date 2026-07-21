/**
 * functions/api/avatar.js
 * Cloudflare Pages Function — 头像代理 (绕过 CORS / ORB)
 *
 * GET /api/avatar?url=https://i0.hdslb.com/bfs/face/xxx.jpg
 * 返回: 图片二进制 + CORS 头
 */

const ALLOWED_HOSTS = ['i0.hdslb.com','i1.hdslb.com','i2.hdslb.com','i0.hdslb.cn','i1.hdslb.cn','i2.hdslb.cn','s1.hdslb.com','s2.hdslb.com','static.hdslb.com','bilivideo.com','bilivideo.cn'];

function isAllowedUrl(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch { return false; }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = url.searchParams.get('url') || '';
  if (!isAllowedUrl(target)) return new Response('invalid url', { status: 400 });

  try {
    const resp = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return new Response('proxy error', { status: 502 });
    const ct = resp.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return new Response('invalid content type', { status: 400 });
    const len = parseInt(resp.headers.get('content-length') || '0', 10);
    if (len > 2 * 1024 * 1024) return new Response('file too large', { status: 400 });
    return new Response(await resp.arrayBuffer(), {
      headers: { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' },
    });
  } catch { return new Response('proxy error', { status: 502 }); }
}