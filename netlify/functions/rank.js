// netlify/functions/rank.js
// GET /api/rank?type=craziness&page=1&limit=20

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "rank.json");
const KV_KEY = "cyber-judge:rank:list";

exports.handler = async (event) => {
  try {
    const query = event.queryStringParameters || {};
    const page = parseInt(query.page || "1", 10);
    const limit = parseInt(query.limit || "20", 10);
    const type = (query.type || "craziness").trim();

    let items = readDataFile();
    items = items.filter((it) => it && it.uid && typeof it.score === "number");
    items.sort((a, b) => b.score - a.score);
    const total = items.length;

    const start = (page - 1) * limit;
    const list = items.slice(start, start + limit);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        code: 0,
        data: { list, total, type, page, limit, timestamp: Math.floor(Date.now() / 1000) },
        error: null,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: -1, data: null, error: "排行榜读取失败" }),
    };
  }
};

function readDataFile() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}
