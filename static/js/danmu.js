/**
 * static/js/danmu.js - 鉴定弹幕实时轮播
 *
 * 方案:预设弹幕池 + 随机轮播
 * - 30+ 条真实口吻的鉴定弹幕
 * - 每 4-7 秒随机插入一条到顶部
 * - 时间标签动态更新("刚刚" / "x 秒前" / "x 分钟前")
 * - 最多保留 8 条,溢出淡出移除
 */
(function () {
  "use strict";

  // 30+ 条预设弹幕,真实 B 站梗向口吻
  // 注意:所有 name 均为虚构角色,严禁使用真实 B 站账号名(规避侵权/误认风险)
  var POOL = [
    { name: "三连爱好者", initial: "三", text: "三连指数 98,实至名归,我先投币为敬 🪙🪙🪙", region: "上海" },
    { name: "深夜脑洞王", initial: "夜", text: "鉴定结果:这 UP 主脑洞浓度爆表,建议反复观看 3 遍", region: "北京" },
    { name: "吃瓜课代表", initial: "吃", text: "三连指数 99,但作为一个吃瓜课代表,我不建议大家模仿", region: "北京" },
    { name: "路过的新观众", initial: "路", text: "鉴定结果:这是一个正常人 —— 鉴定委员会你在说什么?!", region: "上海" },
    { name: "表情包重度用户", initial: "表", text: "离谱指数拉满,建议直接封号(hhhhh)", region: "广东" },
    { name: "挖坑不填选手", initial: "挖", text: "鉴定委员会给的标签也太准了,我笑着笑着就哭了", region: "四川" },
    { name: "深夜食堂常客", initial: "食", text: "弹幕人格那块笑死,下次一定三连 👍", region: "北京" },
    { name: "追番等更新党", initial: "番", text: "啊这,这是被鉴定委员会盖章的离谱现场", region: "上海" },
    { name: "速览日报编辑", initial: "速", text: "鉴定很权威,看完只想一键三连", region: "北京" },
    { name: "精神状态监测仪", initial: "监", text: "救命,这个精神状态图谱我以为是我自己", region: "上海" },
    { name: "数字生活老粉", initial: "数", text: "作为数码区老粉,鉴定结果居然是键盘侠本侠 😂", region: "广东" },
    { name: "破译界小学生", initial: "小", text: "鉴定委员会表示:你的前世今生已被我们成功破译", region: "上海" },
    { name: "百大 UP 主", initial: "百", text: "鉴定太准,求鉴定委员会出个心理测试 PDF", region: "北京" },
    { name: "动画区大佬", initial: "动", text: "awsl 这鉴定也太会玩梗了 ✨", region: "广东" },
    { name: "音乐区常驻", initial: "音", text: "弹幕风格鉴定那块,直接给我笑出声", region: "江苏" },
    { name: "游戏区 UP", initial: "戏", text: "三连了,别问,问就是催更", region: "上海" },
    { name: "知识区观察者", initial: "知", text: "好家伙,2026 运势里说我会暴富,信了信了", region: "北京" },
    { name: "美食博主", initial: "美", text: "鉴定完毕,鉴定委员会你是懂我深夜放毒的", region: "四川" },
    { name: "虚拟偶像厨", initial: "虚", text: "awsl 这个灵魂伴侣匹配 100% 没毛病", region: "浙江" },
    { name: "科技美学", initial: "科", text: "三连指数如此之高,我不禁陷入沉思", region: "北京" },
    { name: "手作匠人", initial: "手", text: "鉴定委员会用得意黑写鉴定证书是吧,有品味 🖤", region: "江苏" },
    { name: "B站小学生", initial: "B", text: "下次一定三连 —— 已经是第 999 次说这句话了", region: "全国" },
    { name: "资深潜水员", initial: "资", text: "冒泡认证,鉴定结果过于真实引起不适", region: "广东" },
    { name: "鬼畜区大佬", initial: "鬼", text: "建议把这个鉴定结果做成鬼畜视频", region: "上海" },
    { name: "国创动画粉", initial: "国", text: "鉴定委员会是懂 B 站生态的 ✨", region: "北京" },
    { name: "纪录片爱好者", initial: "记", text: "前世今生那段,把我说愣了", region: "湖北" },
    { name: "考研博主", initial: "考", text: "精神状态焦虑指数拉满,鉴定委员会你偷看我日记了?", region: "上海" },
    { name: "健身区新人", initial: "健", text: "三连已按,鉴定证书拿好 🪪", region: "广东" },
    { name: "二次元原神玩家", initial: "原", text: "破防了,这鉴定比我抽卡还准 😭", region: "全国" },
    { name: "老二次元", initial: "二", text: "典中典,这鉴定委员会是会整活的", region: "上海" },
    { name: "新晋UP主", initial: "新", text: "刚做了鉴定,被自己的离谱程度吓到", region: "浙江" },
  ];

  var _poolIdx = 0;
  var _insertedAt = []; // [{item, ts}, ...] 同步时间标签
  var _rotateTimer = null;
  var _tickTimer = null;
  var _list = null;
  var _max = 8;

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function timeLabel(ts) {
    var sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 5) return "刚刚";
    if (sec < 60) return sec + " 秒前";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + " 分钟前";
    return Math.floor(min / 60) + " 小时前";
  }

  function nextItem() {
    // 顺序轮询,避免短时间重复
    var item = POOL[_poolIdx % POOL.length];
    _poolIdx++;
    // 随机 2-4% 概率命中"区域变体"——加个地区后缀增加真实感
    return item;
  }

  function renderItem(item, ts) {
    var safeName = String(item.name).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
    var safeText = String(item.text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
    var safeRegion = String(item.region || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
    return (
      '<div class="cmt-item cmt-fade-in">' +
        '<div class="cmt-avatar">' + item.initial + '</div>' +
        '<div class="cmt-content">' +
          '<div class="cmt-name">' + safeName + '</div>' +
          '<div class="cmt-text">' + safeText + '</div>' +
          '<div class="cmt-time" data-ts="' + ts + '">刚刚 · 来自 ' + safeRegion + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function pushOne() {
    if (!_list) return;
    var item = nextItem();
    var ts = Date.now();
    _insertedAt.unshift({ ts: ts, item: item });
    if (_insertedAt.length > _max) _insertedAt.pop();

    // 重渲染(节点数少,直接 innerHTML 比维护 diff 简单)
    var html = "";
    for (var i = _insertedAt.length - 1; i >= 0; i--) {
      var rec = _insertedAt[i];
      html += renderItem(rec.item, rec.ts);
    }
    _list.innerHTML = html;
  }

  function tickTime() {
    if (!_list) return;
    var labels = _list.querySelectorAll(".cmt-time[data-ts]");
    labels.forEach(function (el) {
      var ts = parseInt(el.getAttribute("data-ts"), 10);
      if (!isNaN(ts)) {
        var item = _insertedAt.find(function (r) { return r.ts === ts; });
        el.textContent = timeLabel(ts) + " · 来自 " + (item ? item.item.region : "B站");
      }
    });
  }

  function start() {
    _list = document.getElementById("cmt-list");
    if (!_list) return;
    // 清掉 HTML 里写死的初始 4 条(被 JS 接管)
    _list.innerHTML = "";
    _insertedAt = [];
    _poolIdx = Math.floor(Math.random() * POOL.length); // 启动位置随机

    // 首屏立即塞 4 条
    for (var i = 0; i < 4; i++) {
      var item = POOL[(_poolIdx + i) % POOL.length];
      _insertedAt.push({ ts: Date.now() - i * 13000, item: item });
    }
    _poolIdx = (_poolIdx + 4) % POOL.length;
    pushOne(); // 触发首屏渲染

    // 每 4-7 秒插入一条
    function schedule() {
      var delay = rand(4000, 7000);
      _rotateTimer = setTimeout(function () {
        pushOne();
        schedule();
      }, delay);
    }
    schedule();

    // 每秒更新时间标签
    _tickTimer = setInterval(tickTime, 1000);
  }

  function stop() {
    if (_rotateTimer) clearTimeout(_rotateTimer);
    if (_tickTimer) clearInterval(_tickTimer);
    _rotateTimer = null;
    _tickTimer = null;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
