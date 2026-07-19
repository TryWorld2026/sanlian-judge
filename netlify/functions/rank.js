// netlify/functions/rank.js
// GET /api/rank?type=craziness&page=1&limit=20

// 预置排行榜数据 (内嵌,因为 Netlify 函数沙箱无法读取项目根目录文件)
const DEFAULT_RANK_DATA = [
  { uid: "546195", name: "老番茄", score: 92, level: "非常离谱", avatar: "http://i0.hdslb.com/bfs/face/bc5ca101313d4db223c395d64779e76eb3482d60.jpg", timestamp: 1784374629 },
  { uid: "632887", name: "伢伢gagako", score: 85, level: "非常离谱", avatar: "https://i1.hdslb.com/bfs/face/38d85946c9cd0cf159e4d646be63fad36c2486c1.jpg", timestamp: 1784359580 },
  { uid: "946974", name: "影视飓风", score: 85, level: "很离谱", avatar: "https://i0.hdslb.com/bfs/face/c1733474892caa45952b2c09a89323157df7129a.jpg", timestamp: 1784360978 },
  { uid: "385670211", name: "秋芝2046", score: 85, level: "很离谱", avatar: "https://i0.hdslb.com/bfs/face/9caeeb8cbf5b2f29e5304d0909390ba5d91331c9.jpg", timestamp: 1784388572 },
  { uid: "5028996", name: "莓可-w-", score: 78, level: "很离谱", avatar: "https://i0.hdslb.com/bfs/face/73ba788edac49b2c94b85d0eddc64863f2c49c54.jpg", timestamp: 1784359965 },
  { uid: "34579852", name: "徐珺大哥", score: 78, level: "很离谱", avatar: "https://i1.hdslb.com/bfs/face/18d8fc2d0ce4ab25bc7d51574ac89e18c694340a.jpg", timestamp: 1784361455 },
  { uid: "8047632", name: "哔哩哔哩弹幕网", score: 78, level: "很离谱", avatar: "https://i0.hdslb.com/bfs/face/0c84b9f4ad546d3f20324809d45fc439a2a8ddab.jpg", timestamp: 1784361574 },
  { uid: "313468110", name: "数字生命卡兹克", score: 45, level: "有点怪", avatar: "https://i0.hdslb.com/bfs/face/a989a9ef7c6903b0330e26cbb400d47b4b5a0d94.jpg", timestamp: 1784387507 },
];

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const page = parseInt(q.page || "1", 10);
    const limit = parseInt(q.limit || "20", 10);
    const type = (q.type || "craziness").trim();

    let items = [...DEFAULT_RANK_DATA];
    items = items.filter((it) => it && it.uid && typeof it.score === "number");
    items.sort((a, b) => b.score - a.score);
    const total = items.length;

    const start = (page - 1) * limit;
    const list = items.slice(start, start + limit);

    return json(200, { code: 0, data: { list, total, type, page, limit, timestamp: Math.floor(Date.now() / 1000) }, error: null });
  } catch (e) {
    return json(200, { code: -1, data: null, error: "排行榜读取失败" });
  }
};

function json(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) };
}
