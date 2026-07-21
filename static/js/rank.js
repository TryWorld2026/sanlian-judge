/**
 * 三连鉴定 · rank.js
 * 排行榜弹窗 · B 站双品牌色 + Neo-Brutalist 手作风
 */
(function () {
  "use strict";

  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function clamp(n, min, max) {
    var v = parseInt(n, 10) || 0;
    return Math.max(min, Math.min(max, v));
  }
  function proxyAvatar(url) {
    if (!url) return "";
    if (url.indexOf("/api/avatar?") >= 0) return url;
    return "/api/avatar?url=" + encodeURIComponent(url);
  }
  function avatarFallback(seed) {
    // 本地 SVG 占位头(灰色 + 首字母),避免网络头像加载失败破坏布局
    var initial = (seed || "?").charAt(0);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">' +
      '<rect fill="#FFE4ED" width="36" height="36"/>' +
      '<text x="18" y="24" text-anchor="middle" font-size="18" font-weight="900" fill="#FB7299" font-family="sans-serif">' + esc(initial) + '</text>' +
      '</svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  function renderItem(item, idx) {
    var name = esc(item.name || "???");
    var uid = esc(item.uid || "");
    var rawFace = item.avatar || item.face || "";
    var face = rawFace ? esc(proxyAvatar(rawFace)) : "";
    var score = clamp(item.score, 0, 100);
    var pos = idx + 1;
    var posLabel = pos < 10 ? "0" + pos : String(pos);
    var placeholders = { 1: "🥇", 2: "🥈", 3: "🥉" };
    var posEmoji = placeholders[pos] || "";

    return (
      '<div class="rank-item">' +
        '<div class="rank-num">' + posLabel + (posEmoji ? ' ' + posEmoji : '') + '</div>' +
        (face
          ? '<img class="rank-avatar" src="' + face + '" alt="" onerror="this.onerror=null;this.src=\'' + avatarFallback(name) + '\'">'
          : '<img class="rank-avatar" src="' + avatarFallback(name) + '" alt="">') +
        '<div class="rank-info">' +
          '<div class="rank-name">' + name + '</div>' +
          '<div class="rank-uid">UID ' + uid + '</div>' +
        '</div>' +
        '<div class="rank-score">' + score + '<span style="font-size:11px;color:var(--ink-3);margin-left:2px">%</span></div>' +
      '</div>'
    );
  }

  function load(targetId) {
    var list = document.getElementById(targetId || "rank-body");
    if (!list) return;
    list.innerHTML = '<div class="rank-loading">// loading 离谱中 ...</div>';

    // AbortController 加超时,避免网络挂死时一直转圈
    var ctrl = new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 10000);

    fetch("/api/rank?type=craziness&page=1&limit=20", {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: ctrl.signal,
    })
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) {
        if (j.code !== 0 || !j.data) {
          list.innerHTML = '<div class="rank-empty">// 排行榜数据异常</div>';
          return;
        }
        var items = (j.data && j.data.list) || [];
        if (!items.length) {
          list.innerHTML = '<div class="rank-empty">// 暂无数据,等待第一位离谱选手</div>';
          return;
        }
        list.innerHTML = items.map(renderItem).join("");
      })
      .catch(function (err) {
        clearTimeout(timer);
        // err.message 可能 undefined(abort 后是 DOMException.name='AbortError')
        var msg = (err && err.message) || (err && err.name) || "网络异常";
        if (/abort/i.test(msg)) msg = "请求超时,稍后再试";
        else if (/JSON|SyntaxError/i.test(err && err.name || "")) msg = "排行榜数据异常,稍后再试";
        list.innerHTML = '<div class="rank-empty">// ' + esc(msg) + '</div>';
      });
  }

  // 暴露给 brand.js 调用
  window.SanlianRank = { load: load };
  window.CyberJudgeRank = { load: load, open: function () {
    var btn = document.getElementById("btn-rank");
    if (btn) btn.click();
  } };

  // 兼容旧 index.html 的 modal-rank 结构(若存在则自动绑定)
  document.addEventListener("DOMContentLoaded", function () {
    var oldBtn = document.getElementById("rank-btn");
    var oldModal = document.getElementById("modal-rank");
    if (oldBtn && oldModal) {
      oldBtn.addEventListener("click", function () {
        oldModal.classList.remove("hidden");
        load("rank-list");
      });
      var oldClose = oldModal.querySelector("[data-modal-close]");
      if (oldClose) oldClose.addEventListener("click", function () {
        oldModal.classList.add("hidden");
      });
    }
  });
})();
