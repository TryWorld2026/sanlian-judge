/**
 * 三连鉴定 · report.js
 * 报告页 8 模块渲染 · B 站双品牌色 + Neo-Brutalist 手作风
 * (含:三连按钮 + 弹幕评论流)
 */
(function () {
  "use strict";

  /* ============================================================
     工具
     ============================================================ */
  function escape(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 头像代理:统一走 /api/avatar,绕开 B 站图片服务器的 CORS / ORB 限制
  function proxyAvatar(url) {
    if (!url) return "";
    if (url.indexOf("/api/avatar?") >= 0) return url;  // 已经代理过
    if (url.indexOf("data:") === 0) return url;  // 本地 data URI 不代理
    return "/api/avatar?url=" + encodeURIComponent(url);
  }

  function safeGet(obj, path, fallback) {
    if (!obj) return fallback;
    var keys = path.split(".");
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur == null) return fallback;
      cur = cur[keys[i]];
    }
    return cur == null ? fallback : cur;
  }

  function clampNumber(n, min, max, fallback) {
    var v = parseInt(n, 10);
    if (isNaN(v)) v = fallback;
    if (v < min) v = min;
    if (v > max) v = max;
    return v;
  }

  // 安全颜色校验:只允许 #RRGGBB 格式,防止 CSS 注入
  var HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  function safeColor(c, fallback) {
    return HEX_COLOR_RE.test(c) ? c : (fallback || "#FB7299");
  }

  function formatNum(n) {
    n = parseInt(n, 10) || 0;
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "w";
    return String(n);
  }

  function joinDaysText(days) {
    if (!days || days <= 0) return "元老级";
    if (days < 30) return days + " 天";
    if (days < 365) return Math.floor(days / 30) + " 个月";
    var y = Math.floor(days / 365);
    var m = Math.floor((days % 365) / 30);
    return y + " 年" + (m > 0 ? " " + m + " 月" : "");
  }

  /* ============================================================
     模块 head 构造
     ============================================================ */
  function moduleHead(num, title, subtitle) {
    return (
      '<div class="module-head">' +
        '<div class="module-title-wrap">' +
          '<div class="module-title">' + escape(title) + '</div>' +
          (subtitle ? '<div class="module-subtitle">' + escape(subtitle) + '</div>' : '') +
        '</div>' +
        '<div class="module-num">' + escape(num) + '</div>' +
      '</div>'
    );
  }

  function moduleWrap(cls, num, title, subtitle, content) {
    return (
      '<section class="module ' + escape(cls) + '">' +
        moduleHead(num, title, subtitle) +
        content +
      '</section>'
    );
  }

  /* ============================================================
     模块 1:核心身份卡
     ============================================================ */
  function renderProfile(p) {
    if (!p) return "";
    var name = escape(p.name || "未知用户");
    var uid = escape(p.uid || "");
    var face = escape(proxyAvatar(p.face || ""));
    var sex = p.sex || "";
    var sexText = sex === "男" ? "♂" : sex === "女" ? "♀" : "·";
    var level = clampNumber(p.level, 0, 7, 0);
    var sign = p.sign || "";
    var vipLabel = safeGet(p, "vipLabel", "");
    var vipType = parseInt(p.vipType, 10) || 0;
    var official = safeGet(p, "official.title", "");
    var fans = parseInt(p.fans, 10) || 0;
    var following = parseInt(p.following, 10) || 0;
    var joinDays = parseInt(p.joinDays, 10) || 0;

    var tags = [];
    if (vipType > 0 && vipLabel) tags.push('<span class="profile-tag tag-vip">★ ' + escape(vipLabel) + '</span>');
    if (official) tags.push('<span class="profile-tag tag-official">✓ ' + escape(official) + '</span>');
    if (level >= 6) tags.push('<span class="profile-tag tag-info">LV' + level + ' 老兵</span>');
    else if (level >= 4) tags.push('<span class="profile-tag tag-info">LV' + level + ' 活跃</span>');
    else if (level > 0) tags.push('<span class="profile-tag tag-info">LV' + level + '</span>');

    return moduleWrap(
      "mod-profile",
      "01 / 08",
      "核心身份卡",
      "IDENTITY",
      '<div class="profile-top">' +
        '<div class="profile-avatar-wrap">' +
          (face ? '<img class="profile-avatar" src="' + face + '" alt="' + name + '" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22%3E%3Crect fill=%22%231c1c2a%22 width=%221%22 height=%221%22/%3E%3C/svg%3E\'">' : '<div class="profile-avatar"></div>') +
        '</div>' +
        '<div class="profile-info">' +
          '<div class="profile-name">' +
            '<span class="profile-name-text">' + name + '</span>' +
            '<span class="profile-lv">LV' + level + '</span>' +
            '<span class="profile-gender">' + sexText + '</span>' +
          '</div>' +
          (tags.length ? '<div class="profile-tags">' + tags.join("") + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="profile-stats">' +
        '<div class="profile-stat"><div class="profile-stat-num">' + formatNum(fans) + '</div><div class="profile-stat-label">粉丝</div></div>' +
        '<div class="profile-stat"><div class="profile-stat-num">' + formatNum(following) + '</div><div class="profile-stat-label">关注</div></div>' +
        '<div class="profile-stat"><div class="profile-stat-num">' + (joinDays > 0 ? Math.floor(joinDays / 365) + "y" : "∞") + '</div><div class="profile-stat-label">入站</div></div>' +
      '</div>' +
      '<div class="profile-sign">' + escape(sign || "") + '</div>' +
      '<div class="profile-join">// UID <b>' + uid + '</b> · 入站 <b>' + escape(joinDaysText(joinDays)) + '</b></div>'
    );
  }

  /* ============================================================
     模块 2:弹幕人格
     ============================================================ */
  function renderPersona(d) {
    if (!d) return "";
    var type = escape(d.type || "B站普通用户");
    var emoji = escape(d.emoji || "😶");
    var desc = escape(d.description || "");
    var color = safeColor(d.color, "#ff2d7e");
    var tags = Array.isArray(d.tags) ? d.tags : [];
    var dims = d.dimensions || {};
    var dimMap = [
      { k: "毒舌指数", v: clampNumber(dims["毒舌指数"], 0, 100, 50) },
      { k: "创作热度", v: clampNumber(dims["创作热度"], 0, 100, 50) },
      { k: "鸽子概率", v: clampNumber(dims["鸽子概率"], 0, 100, 50) },
      { k: "氪金程度", v: clampNumber(dims["氪金程度"], 0, 100, 50) },
    ];

    var dimHtml = dimMap.map(function (dim) {
      return (
        '<div class="persona-dim">' +
          '<div class="persona-dim-label">' + dim.k + '</div>' +
          '<div class="persona-dim-bar"><div class="persona-dim-fill" data-width="' + dim.v + '%"></div></div>' +
          '<div class="persona-dim-val">' + dim.v + '</div>' +
        '</div>'
      );
    }).join("");

    var tagHtml = tags.slice(0, 3).map(function (t) {
      return '<span class="persona-tag">' + escape(t) + '</span>';
    }).join("");

    return moduleWrap(
      "mod-persona",
      "02 / 08",
      "弹幕人格",
      "DANMU PERSONA",
      '<div class="persona-type" style="--persona-color:' + escape(color) + '">' +
        '<div class="persona-emoji">' + emoji + '</div>' +
        '<div class="persona-info">' +
          '<div class="persona-name">' + type + '</div>' +
          '<div class="persona-desc">' + desc + '</div>' +
        '</div>' +
      '</div>' +
      (tagHtml ? '<div class="persona-tags">' + tagHtml + '</div>' : '') +
      '<div class="persona-dims">' + dimHtml + '</div>'
    );
  }

  /* ============================================================
     模块 3:赛博前世
     ============================================================ */
  function renderPastLife(d) {
    if (!d) return "";
    var identity = escape(d.identity || "神秘人");
    var era = escape(d.era || "未知时代");
    var icon = escape(d.icon || "🔮");
    var desc = escape(d.description || "");

    return moduleWrap(
      "mod-pastlife",
      "03 / 08",
      "赛博前世",
      "PAST LIFE",
      '<div class="pastlife-emblem">' +
        '<span class="pastlife-icon">' + icon + '</span>' +
      '</div>' +
      '<div class="pastlife-identity">' + identity + '</div>' +
      '<div class="pastlife-meta">' +
        '<span>时代 <b>' + era + '</b></span>' +
      '</div>' +
      '<div class="pastlife-desc">' + desc + '</div>'
    );
  }

  /* ============================================================
     模块 4:精神状态
     ============================================================ */
  function renderMental(d) {
    if (!d) return "";
    var level = escape(d.level || "正常");
    var position = clampNumber(d.position, 0, 100, 50);
    var mentalAge = escape(d.mentalAge || "未鉴定");
    var desc = escape(d.description || "");
    var advice = escape(d.advice || "建议早睡早起");

    var anchors = [
      { i: "😇", l: "佛系" },
      { i: "😐", l: "稳定" },
      { i: "😈", l: "逆天" },
      { i: "🤡", l: "癫狂" },
      { i: "😵", l: "超脱" },
    ];
    var activeIdx = Math.min(4, Math.floor(position / 25));

    var gaugeHtml =
      '<div class="mental-gauge">' +
        '<div class="mental-anchor-line"></div>' +
        anchors.map(function (a, i) {
          return (
            '<div class="mental-anchor ' + (i === activeIdx ? "active" : "") + '">' +
              '<div class="mental-anchor-icon">' + a.i + '</div>' +
              '<div class="mental-anchor-label">' + a.l + '</div>' +
            '</div>'
          );
        }).join("") +
      '</div>';

    return moduleWrap(
      "mod-mental",
      "04 / 08",
      "精神状态",
      "MENTAL STATE",
      gaugeHtml +
      '<div class="mental-result">' +
        '<div class="mental-level">' + level + '</div>' +
        '<div class="mental-age">心理年龄 <b>' + mentalAge + '</b></div>' +
        '<div class="mental-desc">' + desc + '</div>' +
      '</div>' +
      '<div class="mental-advice">' + advice + '</div>'
    );
  }

  /* ============================================================
     模块 5:2026 运势
     ============================================================ */
  function renderFortune(d) {
    if (!d) return "";
    var luckyColor = safeColor(d.luckyColor, "#ff2d7e");
    var luckyNumber = clampNumber(d.luckyNumber, 0, 99, 6);
    var cells = [
      { k: "事业", emoji: "💼", v: d.career || "维持现状" },
      { k: "财富", emoji: "💰", v: d.wealth || "小有结余" },
      { k: "桃花", emoji: "🌸", v: d.love || "平淡是真" },
      { k: "抽象", emoji: "🌀", v: d.abstract || "想到啥做啥" },
    ];
    var cellHtml = cells.map(function (c) {
      return (
        '<div class="fortune-cell">' +
          '<div class="fortune-cell-head">' +
            '<span class="fortune-cell-emoji">' + c.emoji + '</span>' +
            '<span>' + c.k + '</span>' +
            '<span class="fortune-cell-stars">★★★</span>' +
          '</div>' +
          '<div class="fortune-cell-text">' + escape(c.v) + '</div>' +
        '</div>'
      );
    }).join("");

    return moduleWrap(
      "mod-fortune",
      "05 / 08",
      "2026 运势",
      "FORTUNE 2026",
      '<div class="fortune-grid">' + cellHtml + '</div>' +
      '<div class="fortune-lucky">' +
        '<span class="fortune-lucky-label">幸运色</span>' +
        '<span class="fortune-lucky-val" style="color:' + luckyColor + '">● ' + luckyColor.toUpperCase() + '</span>' +
        '<span class="fortune-lucky-label">幸运数</span>' +
        '<span class="fortune-lucky-val">' + luckyNumber + '</span>' +
      '</div>'
    );
  }

  /* ============================================================
     本地 SVG 头像生成器(替代 dicebear)
     - 基于 seed hash 生成稳定的几何头像
     - 零网络依赖,同账号永远同一形状
     ============================================================ */
  function generateLocalAvatar(seed, overlay) {
    var s = String(seed || "anonymous");
    // 简单但稳定的 hash
    var h1 = 0, h2 = 0, h3 = 0, h4 = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = (h1 * 31 + c) >>> 0;
      h2 = (h2 * 17 + c) >>> 0;
      h3 = (h3 * 13 + c) >>> 0;
      h4 = (h4 * 7 + c) >>> 0;
    }
    var bg = "#" + (h1 % 0xffffff).toString(16).padStart(6, "0");
    var fg = "#" + (h2 % 0xffffff).toString(16).padStart(6, "0");
    // 9 宫格 identicon(类似 GitHub)
    var cells = [];
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 3; c++) {
        var bit = (h3 >> (r * 3 + c)) & 1;
        if (bit) {
          var x = 20 + c * 25;
          var y = 20 + r * 25;
          cells.push('<rect x="' + x + '" y="' + y + '" width="25" height="25" fill="' + fg + '"/>');
        }
      }
    }
    // 镜像右边
    var mirrored = cells.map(function (rect) {
      return rect.replace(/x="(\d+)"/, function (_, x) {
        return 'x="' + (140 - parseInt(x) - 25) + '"';
      });
    });
    // overlay 为 emoji 时,优先画 emoji(更大更醒目);否则画首字母
    var center = overlay
      ? '<text x="80" y="110" font-size="96" text-anchor="middle" dominant-baseline="middle">' + escape(overlay) + '</text>'
      : '<text x="80" y="90" font-family="JetBrains Mono, monospace" font-size="48" font-weight="900" fill="white" text-anchor="middle" opacity="0.85">' + escape(s.charAt(0).toUpperCase()) + '</text>';
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">' +
        '<rect width="160" height="160" fill="' + bg + '"/>' +
        cells.join("") + mirrored.join("") +
        center +
      '</svg>';
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  /* ============================================================
     模块 5:赛博灵魂伴侣
     ============================================================ */
  function renderSoulMate(d, profile) {
    if (!d) return "";
    var myName = escape(safeGet(profile, "name", "你"));
    var myFace = escape(proxyAvatar(safeGet(profile, "face", "")));
    var mateName = escape(d.name || "???");
    var mateEmoji = escape(d.avatarEmoji || "");
    var sim = clampNumber(d.similarity, 0, 100, 50);
    var reason = escape(d.reason || "量子纠缠命中注定");
    // 灵魂伴侣视觉:用 emoji 当头像,名字当 seed 生成配色
    var seedKey = mateName + "|" + mateEmoji;
    var mateFace = generateLocalAvatar(seedKey, mateEmoji);

    return moduleWrap(
      "mod-soulmate",
      "06 / 08",
      "赛博灵魂伴侣",
      "SOULMATE",
      '<div class="soulmate-row">' +
        '<div class="soulmate-person">' +
          (myFace ? '<img class="soulmate-avatar" src="' + myFace + '" alt="" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22%3E%3Crect fill=%22%231c1c2a%22 width=%221%22 height=%221%22/%3E%3C/svg%3E\'">' : '<div class="soulmate-avatar"></div>') +
          '<div class="soulmate-name">' + myName + '</div>' +
        '</div>' +
        '<div class="soulmate-link">' +
          '<div class="soulmate-heart">♥</div>' +
          '<div class="soulmate-sim">' + sim + '<span style="font-size:14px;opacity:0.6">%</span></div>' +
          '<div class="soulmate-sim-label">MATCH</div>' +
        '</div>' +
        '<div class="soulmate-person">' +
          '<img class="soulmate-avatar" src="' + mateFace + '" alt="" onerror="this.style.background=\'#1c1c2a\'">' +
          '<div class="soulmate-name">' + mateName + (mateEmoji ? ' <span style="font-size:18px">' + mateEmoji + '</span>' : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="soulmate-reason">' + reason + '</div>'
    );
  }

  /* ============================================================
     模块 7:弹幕风格
     ============================================================ */
  function renderDanmu(d) {
    if (!d) return "";
    var often = Array.isArray(d.oftenSay) ? d.oftenSay : [];
    var never = Array.isArray(d.neverSay) ? d.neverSay : [];
    var verdict = escape(d.verdict || "平平无奇");
    var grade = escape(d.grade || "B");

    function renderTags(arr) {
      if (!arr.length) return '<span style="color:var(--text-3);font-size:11px">// 暂无数据</span>';
      return arr.map(function (t) { return '<span class="danmu-tag">' + escape(t) + '</span>'; }).join("");
    }

    return moduleWrap(
      "mod-danmu",
      "07 / 08",
      "弹幕风格",
      "DANMU STYLE",
      '<div class="danmu-block say">' +
        '<div class="danmu-block-head say">SAY  常用</div>' +
        '<div class="danmu-tags">' + renderTags(often) + '</div>' +
      '</div>' +
      '<div class="danmu-block not">' +
        '<div class="danmu-block-head not">NEVER  从不</div>' +
        '<div class="danmu-tags">' + renderTags(never) + '</div>' +
      '</div>' +
      '<div class="danmu-verdict">' +
        '<div class="danmu-grade">' + grade + '</div>' +
        '<div class="danmu-verdict-text">' + verdict + '</div>' +
      '</div>'
    );
  }

  /* ============================================================
     模块 8:离谱指数
     ============================================================ */
  function renderCraziness(d) {
    if (!d) return "";
    var score = clampNumber(d.score, 0, 100, 50);
    var ranking = escape(d.ranking || "全站前 50%");
    var verdict = escape(d.verdict || "正常人类");
    var level = escape(d.level || "有点怪");

    return moduleWrap(
      "mod-craziness",
      "08 / 08",
      "离谱指数",
      "CRAZINESS INDEX",
      '<div class="craziness-head">' +
        '<div class="craziness-percent">' + score + '<sup>%</sup></div>' +
        '<div class="craziness-level">' + level + '</div>' +
      '</div>' +
      '<div class="craziness-bar"><div class="craziness-bar-fill" data-width="' + score + '%"></div></div>' +
      '<div class="craziness-marks">' +
        '<span>0 正常</span><span>25 怪</span><span>50 离谱</span><span>75 逆天</span><span>100 鬼</span>' +
      '</div>' +
      '<div class="craziness-verdict">' + verdict + '</div>' +
      '<div class="craziness-ranking">// 全站排名 <b>' + ranking + '</b></div>'
    );
  }

  /* ============================================================
     三连按钮 + 弹幕评论流
     - 客户端拼装梗向评论(无后端依赖)
     ============================================================ */
  function renderSanlianBar() {
    return (
      '<section class="module mod-sanlian">' +
        '<div class="module-head">' +
          '<div class="module-title-wrap">' +
            '<div class="module-title">三连鉴定委员会公示</div>' +
            '<div class="module-subtitle">VERDICT</div>' +
          '</div>' +
          '<div class="module-num">09 / 09</div>' +
        '</div>' +
        '<div class="sanlian-bar">' +
          '<button class="sanlian-btn sanlian-zan" type="button" data-tip="点赞">' +
            '<span class="sanlian-icon">👍</span>' +
            '<span class="sanlian-text">点赞</span>' +
          '</button>' +
          '<button class="sanlian-btn sanlian-coin" type="button" data-tip="投币">' +
            '<span class="sanlian-icon">🪙</span>' +
            '<span class="sanlian-text">投币</span>' +
          '</button>' +
          '<button class="sanlian-btn sanlian-fav" type="button" data-tip="收藏">' +
            '<span class="sanlian-icon">⭐</span>' +
            '<span class="sanlian-text">收藏</span>' +
          '</button>' +
          '<button class="sanlian-btn sanlian-tril" type="button" data-tip="一键三连">' +
            '<span class="sanlian-icon">⚡</span>' +
            '<span class="sanlian-text">一键三连</span>' +
          '</button>' +
        '</div>' +
        '<div class="sanlian-hint">↑ 鉴定通过,赏个三连吧 ↑</div>' +
      '</section>'
    );
  }

  function renderDanmuStream(report) {
    // 根据报告数据生成几条 B 站梗向的固定弹幕
    var persona = (report && report.personaType && report.personaType.type) || "B站普通用户";
    var craziness = (report && report.craziness && report.craziness.score) || 50;
    var mateName = (report && report.soulMate && report.soulMate.name) || "???";
    var comments = [
      { user: "旧日旧人", text: "前排!鉴定一下我的 UID 算不算值得三连" },
      { user: "今天也在白嫖", text: "三连鉴定委员会,出!" },
      { user: "深夜emo小将", text: "鉴定结果太准了呜呜呜" },
      { user: "三连战士", text: "确实,我早就觉得这个 UP 值得关注" },
      { user: "下次一定哥", text: "下次一定三连(经典复刻)" },
      { user: "高能预警", text: "前方高能,建议配合弹幕护眼食用" },
      { user: "一键三连", text: "一键三连,鉴定不亏" },
      { user: "好家伙", text: "好家伙,离谱指数 " + craziness + "%,我觉得还能更高" },
      { user: "典中典", text: "鉴定为:典中典之" + escape(persona) },
      { user: "awsl", text: "灵魂伴侣是 " + escape(mateName) + "?awsl" },
      { user: "破防了", text: "三连鉴定委员会,你是懂戳心窝子的" },
      { user: "再来一次", text: "鉴定太准了,催更下一份" },
    ];
    var items = comments.map(function (c) {
      return (
        '<li class="report-danmu-item">' +
          '<span class="report-danmu-user">' + escape(c.user) + ':</span>' +
          '<span class="report-danmu-text">' + escape(c.text) + '</span>' +
        '</li>'
      );
    }).join("");
    return (
      '<section class="report-danmu-section">' +
        '<div class="report-danmu-head">' +
          '<span class="bracket">[</span>' +
          '<span>弹幕评论</span>' +
          '<span class="bracket">]</span>' +
          '<span class="report-danmu-sub">DANMU</span>' +
        '</div>' +
        '<ul class="report-danmu">' + items + '</ul>' +
      '</section>'
    );
  }

  /* ============================================================
     渲染总入口
     - IntersectionObserver 单例:每次 render 前先 disconnect 旧实例
       防止内存泄漏(旧 DOM 节点已被 innerHTML 清空,但 IO 仍持有引用)
     ============================================================ */
  var _moduleObserver = null;

  function render(profile, report, uid, fromCache) {
    var content = document.getElementById("report-content");
    var navUid = document.getElementById("nav-uid");
    var banner = document.getElementById("cache-banner");
    if (!content) return;

    if (navUid) navUid.textContent = "#" + (uid || "000000");
    // 缓存横幅用 [hidden] 属性(与 index.html 一致),不要用 .hidden class
    if (banner) banner.hidden = !fromCache;

    // null 防御:report 缺失时给空对象,避免后续读取 .personaType 抛 TypeError
    report = report || {};

    var html = "";
    html += renderProfile(profile);
    html += renderPersona(report.personaType);
    html += renderPastLife(report.pastLife);
    html += renderMental(report.mentalState);
    html += renderFortune(report.fortune2026);
    html += renderSoulMate(report.soulMate, profile);
    html += renderDanmu(report.danmuStyle);
    html += renderCraziness(report.craziness);
    // 三连按钮(第 9 个模块,收尾呼吁行动)
    html += renderSanlianBar();
    // 弹幕评论流(页面底部,B 站梗向氛围)
    html += renderDanmuStream(report);

    content.innerHTML = html;

    // 释放旧的 IO 实例(防止累积内存泄漏)
    if (_moduleObserver) {
      try { _moduleObserver.disconnect(); } catch (_) {}
      _moduleObserver = null;
    }

    // 入场动画 IntersectionObserver
    requestAnimationFrame(function () {
      var modules = content.querySelectorAll(".module");
      _moduleObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            // 维度条动画
            var fills = e.target.querySelectorAll("[data-width]");
            fills.forEach(function (f) {
              setTimeout(function () { f.style.width = f.getAttribute("data-width"); }, 100);
            });
            _moduleObserver.unobserve(e.target);
          }
        });
      }, { threshold: 0.15 });
      modules.forEach(function (m) { _moduleObserver.observe(m); });
    });

    // 三连按钮交互:点击后变"已三连"状态,toast 反馈
    var sanlianBtns = content.querySelectorAll(".sanlian-btn");
    sanlianBtns.forEach(function (btn) {
      // 防止 rebindSanlian 重复绑定
      if (btn.__sanlian_bound) return;
      btn.__sanlian_bound = true;
      btn.addEventListener("click", function () {
        if (btn.classList.contains("done")) return;
        btn.classList.add("done");
        var tip = btn.getAttribute("data-tip") || "三连";
        // 统一走 window.Sanlian.toast(brand.js 暴露)
        if (window.Sanlian && window.Sanlian.toast) {
          window.Sanlian.toast("已 " + tip + " · 三连鉴定委员会向你致谢", "success");
        }
      });
    });
  }

  /* ============================================================
     暴露
     ============================================================ */
  window.SanlianReport = {
    render: render,
    /** 报告页显示/隐藏 */
    show: function () {
      var p = document.getElementById("page-report");
      if (p) { p.hidden = false; p.scrollTop = 0; try { window.scrollTo(0, 0); } catch (_) {} }
    },
    hide: function () {
      var p = document.getElementById("page-report");
      if (p) p.hidden = true;
    },
    /** 显示缓存横幅 */
    showCacheBanner: function (show) {
      var b = document.getElementById("cache-banner");
      if (b) b.hidden = !show;
    },
    /** 兼容旧 brand.js 的三连按钮事件重绑 */
    rebindSanlian: function () {
      var content = document.getElementById("report-content");
      if (!content) return;
      var btns = content.querySelectorAll(".sanlian-btn");
      btns.forEach(function (btn) {
        // 防止重复绑定
        if (btn.__sanlian_bound) return;
        btn.__sanlian_bound = true;
        btn.addEventListener("click", function () {
          if (btn.classList.contains("done")) return;
          btn.classList.add("done");
          var tip = btn.getAttribute("data-tip") || "三连";
          if (window.Sanlian && window.Sanlian.toast) {
            window.Sanlian.toast("已 " + tip + " · 三连鉴定委员会向你致谢", "success");
          }
        });
      });
    },
  };
})();
