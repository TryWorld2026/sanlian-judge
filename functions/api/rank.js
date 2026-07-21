/**
 * functions/api/rank.js
 * Cloudflare Pages Function — 离谱排行榜
 *
 * GET /api/rank?type=craziness&page=1&limit=20
 * 返回: {code: 0, data: {list: [...], total, type, page, limit, timestamp}, error: null}
 */

const RANK_DATA = [
  { uid: '88001', name: '影像碎片制造机', score: 92, level: '非常离谱', avatar: 'https://static.hdslb.com/images/member/noface.gif', timestamp: 1784359580 },
  { uid: '88002', name: '弹幕社交天花板', score: 88, level: '非常离谱', avatar: 'https://static.hdslb.com/images/member/noface.gif', timestamp: 1784360978 },
  { uid: '88003', name: '二次元老饕客', score: 85, level: '非常离谱', avatar: 'https://static.hdslb.com/images/member/noface.gif', timestamp: 1784388572 },
  { uid: '88004', name: '深夜灵魂画手', score: 78, level: '很离谱', avatar: 'https://static.hdslb.com/images/member/noface.gif', timestamp: 1784359965 },
  { uid: '88005', name: '赛博冲浪选手', score: 75, level: '很离谱', avatar: 'https://static.hdslb.com/images/member/noface.gif', timestamp: 1784361455 },
  { uid: '88006', name: '吃瓜一姐', score: 72, level: '很离谱', avatar: 'https://static.hdslb.com/images/member/noface.gif', timestamp: 1784361574 },
  { uid: '88007', name: '三连社死患者', score: 70, level: '很离谱', avatar: 'https://static.hdslb.com/images/member/noface.gif', timestamp: 1784542697 },
  { uid: '88008', name: '摸鱼观察日记', score: 45, level: '有点怪', avatar: 'https://static.hdslb.com/images/member/noface.gif', timestamp: 1784542697 },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const items = RANK_DATA.filter(it => it && it.uid && typeof it.score === 'number').sort((a, b) => b.score - a.score);
  const start = (page - 1) * limit;
  return json({ code: 0, data: { list: items.slice(start, start + limit), total: items.length, type: 'craziness', page, limit, timestamp: Math.floor(Date.now() / 1000) }, error: null });
}