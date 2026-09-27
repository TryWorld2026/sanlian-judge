/**
 * functions/api/profile.js
 * Cloudflare Pages Function — B 站用户数据获取 (Wbi 签名,实现见 _shared/wbi.js)
 *
 * GET /api/profile?uid={uid}
 * 返回: {code: 0, data: {...}, error: null}
 */

import { fetchBili } from '../_shared/wbi.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function computeJoinDays(rt) {
  if (!rt || rt <= 0) return 0;
  const delta = Math.floor(Date.now() / 1000) - rt;
  return delta > 0 ? Math.floor(delta / 86400) : 0;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const uid = url.searchParams.get('uid') || '';
  if (!uid || !/^\d+$/.test(uid) || uid.length > 18) {
    return json({ code: -1, data: null, error: 'UID 只能输入数字' });
  }

  try {
    const [info, relation, stat, videosRaw] = await Promise.all([
      fetchBili('https://api.bilibili.com/x/space/acc/info', { mid: uid }),
      fetchBili('https://api.bilibili.com/x/space/relation', { mid: uid }),
      fetchBili('https://api.bilibili.com/x/space/stat', { mid: uid }),
      fetchBili('https://api.bilibili.com/x/space/arc/search', { mid: uid, ps: '10', pn: '1' }),
    ]);

    if (!info || info.code !== 0) {
      const errCode = info ? String(info.code) : 'unknown';
      console.error('bili api error:', 'uid=' + uid, 'code=' + errCode, 'msg=' + ((info && info.message) || ''));
      const errMap = { '-352': 'B站触发风控，请稍后再试', '-799': 'B站触发风控，请稍后再试', '-404': '用户不存在', '404': '用户不存在', '-401': 'B站认证失败' };
      return json({ code: -1, data: null, error: errMap[errCode] || ('B站API错误: ' + errCode) });
    }

    const d = info.data || {};
    const vipInfo = d.vip || {};
    const official = d.official || {};
    const regtime = d.jointime || d.regtime || 0;
    const videoList = (videosRaw && videosRaw.data && videosRaw.data.list && videosRaw.data.list.vlist) || [];

    return json({
      code: 0, data: {
        uid: String(uid), name: d.name, face: d.face, sex: d.sex, sign: d.sign, level: d.level,
        fans: (relation && relation.data && relation.data.follower) || 0,
        following: (relation && relation.data && relation.data.following) || 0,
        vipType: vipInfo ? (vipInfo.type != null ? vipInfo.type : vipInfo.vipType) : null,
        vipLabel: vipInfo && vipInfo.label ? vipInfo.label.text : null,
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
    console.error('profile error:', e.message || e);
    return json({ code: -1, data: null, error: 'B站数据获取失败: ' + (e.message || '') });
  }
}
