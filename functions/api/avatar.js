/**
 * functions/api/avatar.js
 * Cloudflare Pages Function - 头像代理
 *
 * GET /api/avatar?url=<encoded_bilibili_avatar_url>
 * 绕过 Chrome ORB (Opaque Response Blocking)
 * SSRF 防护:只允许 hdslb.com / bilivideo.com 域名
 */

const ALLOWED_HOSTS = [
  'i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com',
  'i0.hdslb.cn', 'i1.hdslb.cn', 'i2.hdslb.cn',
  's1.hdslb.com', 's2.hdslb.com',
  'static.hdslb.com',
  'bilivideo.com', 'bilivideo.cn',
];

function isAllowedUrl(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch { return false; }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url') || '';

  if (!isAllowedUrl(targetUrl)) {
    return new Response('invalid url', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://www.bilibili.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      return new Response('proxy error', { status: 502, headers: { 'Content-Type': 'text/plain' } });
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return new Response('invalid content type', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }

    // 大小限制 2MB
    const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);
    if (contentLength > 2 * 1024 * 1024) {
      return new Response('file too large', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }

    const buffer = await resp.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return new Response('proxy error', { status: 502, headers: { 'Content-Type': 'text/plain' } });
  }
}