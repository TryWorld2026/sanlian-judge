/**
 * 三连鉴定 · share.js
 * 分享鉴定证书:截屏主页 cert-card 元素 → 下载 PNG
 * 设计:保持 _brand_v2.html 的 cert-card 视觉(暖白 + 粉边 + 烫金印章)
 */
(function () {
  "use strict";

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function clamp(n, lo, hi, def) {
    n = parseInt(n, 10);
    if (isNaN(n)) return def || 0;
    return Math.max(lo, Math.min(hi, n));
  }
  function safeColor(c, def) {
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : (def || "#FB7299");
  }
  function formatFans(n) {
    n = parseInt(n, 10) || 0;
    if (n >= 10000) return (n / 10000).toFixed(1) + "w";
    return String(n);
  }
  function proxyAvatar(url) {
    if (!url) return "";
    if (url.indexOf("/api/avatar?") >= 0) return url;
    return "/api/avatar?url=" + encodeURIComponent(url);
  }
  function toast(msg, type) {
    var c = document.getElementById("toast-container");
    if (!c) return;
    var t = document.createElement("div");
    t.className = "toast" + (type ? " " + type : "");
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .3s, transform .3s";
      t.style.opacity = "0";
      t.style.transform = "translateY(-8px)";
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, 2400);
  }

  // ========== 鉴证卡片 HTML 生成(1080 分享卡) ==========
  function buildShareCardHTML(profile, report, uid) {
    var p = profile || {};
    var r = report || {};
    var name = escapeHtml(p.name || "???");
    var face = p.face ? escapeHtml(proxyAvatar(p.face)) : "";
    var level = clamp(p.level, 0, 7, 0);
    var fanText = formatFans(p.fans);
    var persona = r.personaType || {};
    var personaName = escapeHtml(persona.type || "B站原住民");
    var personaEmoji = escapeHtml(persona.emoji || "😶");
    var personaColor = safeColor(persona.color, "#FB7299");
    var cz = r.craziness || {};
    var crazyScore = clamp(cz.score, 0, 100, 50);
    var crazyLevel = escapeHtml(cz.level || "有点怪");
    var crazyVerdict = escapeHtml(cz.verdict || "此人的精神世界值得被研究");
    var soulMateName = escapeHtml((r.soulMate && r.soulMate.name) || "???");

    // 鉴定日期
    var now = new Date();
    var dateStr = now.getFullYear() + "." +
      String(now.getMonth() + 1).padStart(2, "0") + "." +
      String(now.getDate()).padStart(2, "0");

    return (
      '<div class="share-card" style="background:#FFF5F0;color:#1A1A1F;font-family:\'Smiley Sans\',\'Noto Sans SC\',sans-serif;padding:48px 56px;width:1080px;border:10px solid #1A1A1F;box-shadow:14px 14px 0 #FB7299;position:relative;box-sizing:border-box">' +
        // 顶部 brand
        '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #1A1A1F;padding-bottom:18px;margin-bottom:24px">' +
          '<div style="display:flex;align-items:center;gap:14px">' +
            // 小电视 logo
            '<div style="width:54px;height:44px;background:#FB7299;border:3px solid #1A1A1F;position:relative">' +
              '<div style="position:absolute;top:-12px;left:8px;width:3px;height:14px;background:#1A1A1F;transform:rotate(-25deg)"></div>' +
              '<div style="position:absolute;top:-12px;right:8px;width:3px;height:14px;background:#1A1A1F;transform:rotate(25deg)"></div>' +
              '<div style="position:absolute;top:14px;left:8px;width:8px;height:8px;background:#1A1A1F;border-radius:50%"></div>' +
              '<div style="position:absolute;top:14px;right:8px;width:8px;height:8px;background:#1A1A1F;border-radius:50%"></div>' +
              '<div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:24px;height:6px;background:#1A1A1F;border-radius:0 0 12px 12px"></div>' +
            '</div>' +
            '<div>' +
              '<div style="font-size:24px;font-weight:900;color:#1A1A1F;letter-spacing:1px">三连鉴定委员会</div>' +
              '<div style="font-family:\'JetBrains Mono\',monospace;font-size:14px;color:#FB7299;font-weight:800;letter-spacing:2px">SANLIAN JUDGE / 鉴定证书</div>' +
            '</div>' +
          '</div>' +
          '<div style="font-family:\'JetBrains Mono\',monospace;font-size:18px;color:#1A1A1F;font-weight:800;letter-spacing:2px;background:#00AEEC;color:#fff;padding:6px 14px;border:3px solid #1A1A1F">UID #' + escapeHtml(uid) + '</div>' +
        '</div>' +

        // 标题
        '<div style="text-align:center;margin-bottom:20px">' +
          '<div style="font-size:36px;font-weight:900;letter-spacing:8px;color:#FB7299">鉴 定 证 书</div>' +
          '<div style="font-family:\'JetBrains Mono\',monospace;font-size:14px;color:#1A1A1F;letter-spacing:4px;margin-top:4px">CERTIFICATE OF SANLIAN</div>' +
        '</div>' +

        // 身份区
        '<div style="display:flex;align-items:center;gap:28px;margin-bottom:24px;background:#FFE5EE;border:4px solid #1A1A1F;padding:20px 24px;box-shadow:6px 6px 0 #00AEEC">' +
          (face ? '<img id="share-avatar" src="' + face + '" onerror="this.onerror=null;this.style.visibility=\'hidden\'" style="width:128px;height:128px;border:4px solid #1A1A1F;object-fit:cover;background:#fff;flex-shrink:0">' : '<div style="width:128px;height:128px;border:4px solid #1A1A1F;background:#fff;flex-shrink:0"></div>') +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:60px;font-weight:900;color:#1A1A1F;line-height:1.05;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + name + '</div>' +
            '<div style="display:flex;gap:12px;align-items:center;font-family:\'JetBrains Mono\',monospace;font-size:18px">' +
              '<span style="background:#FB7299;color:#fff;padding:6px 12px;font-weight:900;border:2px solid #1A1A1F">LV' + level + '</span>' +
              '<span style="background:#1A1A1F;color:#FFF5F0;padding:6px 12px;font-weight:800">粉丝 ' + fanText + '</span>' +
              '<span style="background:#00AEEC;color:#fff;padding:6px 12px;font-weight:800">伴侣 ' + soulMateName + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // 人格类型
        '<div style="background:#fff;border:4px solid #1A1A1F;padding:22px 26px;margin-bottom:22px;box-shadow:6px 6px 0 #FB7299;position:relative">' +
          '<div style="font-family:\'JetBrains Mono\',monospace;font-size:13px;color:#FB7299;letter-spacing:3px;margin-bottom:8px;font-weight:800">// 弹幕人格鉴定</div>' +
          '<div style="display:flex;align-items:center;gap:20px">' +
            '<div style="font-size:96px;line-height:1;flex-shrink:0">' + personaEmoji + '</div>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-size:48px;font-weight:900;color:' + personaColor + ';line-height:1.05;letter-spacing:1px">' + personaName + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // 离谱指数(带印章)
        '<div style="background:#fff;border:4px solid #1A1A1F;padding:26px;margin-bottom:22px;box-shadow:6px 6px 0 #00AEEC;position:relative">' +
          '<div style="font-family:\'JetBrains Mono\',monospace;font-size:13px;color:#FB7299;letter-spacing:3px;margin-bottom:8px;font-weight:800">// 离谱指数</div>' +
          '<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;gap:16px">' +
            '<div style="display:flex;align-items:baseline;gap:4px;font-family:\'JetBrains Mono\',monospace;font-weight:900;line-height:0.9">' +
              '<span style="font-size:150px;color:#FB7299;letter-spacing:-5px;text-shadow:6px 6px 0 #1A1A1F">' + crazyScore + '</span>' +
              '<span style="font-size:48px;color:#00AEEC;line-height:1">%</span>' +
            '</div>' +
            '<div style="font-size:24px;font-weight:900;background:#FB7299;color:#fff;padding:10px 16px;letter-spacing:2px;white-space:nowrap;border:3px solid #1A1A1F;box-shadow:4px 4px 0 #1A1A1F">' + crazyLevel + '</div>' +
          '</div>' +
          '<div style="height:16px;background:#FFE5EE;border:3px solid #1A1A1F;position:relative;margin-bottom:14px">' +
            '<div style="position:absolute;top:0;left:0;height:100%;width:' + crazyScore + '%;background:linear-gradient(90deg,#00AEEC,#FB7299)"></div>' +
          '</div>' +
          '<div style="font-size:20px;line-height:1.5;color:#1A1A1F;padding:16px 18px;background:#FFF5F0;border:3px solid #1A1A1F;font-weight:700">「 ' + crazyVerdict + ' 」</div>' +
        '</div>' +

        // 烫金印章
        '<div style="position:absolute;right:80px;bottom:230px;width:180px;height:180px;border:6px solid #FB7299;border-radius:50%;display:flex;align-items:center;justify-content:center;transform:rotate(-12deg);color:#FB7299;font-weight:900;text-align:center;line-height:1.2;box-shadow:0 0 0 4px #FFF5F0,0 0 0 8px #FB7299">' +
          '<div>' +
            '<div style="font-size:24px;letter-spacing:4px">通过</div>' +
            '<div style="font-size:18px;margin:4px 0">★★★</div>' +
            '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;letter-spacing:2px">三连认证</div>' +
            '<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;margin-top:2px">' + dateStr + '</div>' +
          '</div>' +
        '</div>' +

        // 三连按钮(视觉)
        '<div style="display:flex;gap:14px;margin-bottom:20px">' +
          '<div style="flex:1;background:#fff;border:4px solid #1A1A1F;padding:14px 0;text-align:center;font-weight:900;font-size:24px;box-shadow:5px 5px 0 #1A1A1F;letter-spacing:4px">👍 点赞</div>' +
          '<div style="flex:1;background:#fff;border:4px solid #1A1A1F;padding:14px 0;text-align:center;font-weight:900;font-size:24px;box-shadow:5px 5px 0 #1A1A1F;letter-spacing:4px">🪙 投币</div>' +
          '<div style="flex:1;background:#fff;border:4px solid #1A1A1F;padding:14px 0;text-align:center;font-weight:900;font-size:24px;box-shadow:5px 5px 0 #1A1A1F;letter-spacing:4px">⭐ 收藏</div>' +
        '</div>' +

        // Footer
        '<div style="border-top:4px solid #1A1A1F;padding-top:16px;display:flex;justify-content:space-between;align-items:center;font-family:\'JetBrains Mono\',monospace;font-size:14px;color:#1A1A1F;letter-spacing:1px;font-weight:700">' +
          '<span>// 三连鉴定 v1.0</span>' +
          '<span style="background:#FB7299;color:#fff;padding:4px 10px;border:2px solid #1A1A1F;font-weight:900">AI 鉴定 · 仅供整活</span>' +
        '</div>' +
      '</div>'
    );
  }

  // ========== html2canvas 按需加载(多 CDN 回退,国内优先 bootcdn) ==========
  var HTML2CANVAS_CDNS = [
    "https://cdn.bootcdn.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  ];
  var _h2cLoading = null;

  function ensureHtml2canvas() {
    if (typeof html2canvas !== "undefined") return Promise.resolve();
    if (_h2cLoading) return _h2cLoading;
    _h2cLoading = HTML2CANVAS_CDNS.reduce(function (chain, src) {
      return chain.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement("script");
          s.src = src;
          s.onload = function () { (typeof html2canvas !== "undefined") ? resolve() : reject(new Error("no global")); };
          s.onerror = function () { reject(new Error("load failed: " + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () {
      if (typeof html2canvas === "undefined") throw new Error("html2canvas 所有 CDN 均加载失败");
    });
    return _h2cLoading;
  }

  // ========== 分享主流程 ==========
  function share() {
    var cur = window.Sanlian && window.Sanlian.getCurrent ? window.Sanlian.getCurrent() : null;
    if (!cur || !cur.report) {
      toast("先鉴定一位 UP 主才能分享证书哦", "info");
      return;
    }
    toast("正在烫金印章 ...", "info");

    ensureHtml2canvas().then(buildAndCapture).catch(function (e) {
      toast("截图组件加载失败,请检查网络后重试", "error");
      console.error("[share] html2canvas load error:", e);
    });
  }

  function buildAndCapture() {
    var cur = window.Sanlian && window.Sanlian.getCurrent ? window.Sanlian.getCurrent() : null;
    if (!cur || !cur.report) {
      toast("鉴定数据已失效,请重新鉴定后再分享", "error");
      return;
    }
    // 1. 构造分享卡 HTML(临时挂载到 share-host,渲染完截图后移除)
    var host = document.getElementById("share-host") || (function () {
      var d = document.createElement("div");
      d.id = "share-host";
      d.style.cssText = "position:fixed;left:-10000px;top:0;width:1080px;background:#FFF5F0;z-index:-1;";
      document.body.appendChild(d);
      return d;
    })();
    host.innerHTML = buildShareCardHTML(cur.profile, cur.report, cur.uid);
    // 截图完成后清理 DOM,避免 share-host 残留影响下次截图
    var cleanup = function () {
      try {
        if (host && host.parentNode) host.parentNode.removeChild(host);
      } catch (_) {}
    };

    // 2. 等待图片加载
    var imgs = host.querySelectorAll("img");
    var pending = Array.prototype.slice.call(imgs).map(function (img) {
      return new Promise(function (resolve) {
        if (img.complete && img.naturalWidth > 0) return resolve();
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
        // 8s 超时
        setTimeout(resolve, 8000);
      });
    });

    Promise.all(pending).then(function () {
      var node = host.firstElementChild;
      if (!node) {
        toast("鉴定证书组件未就绪", "error");
        cleanup();
        return;
      }
      var rect = node.getBoundingClientRect();
      var cardHeight = Math.max(800, Math.ceil(rect.height));
      html2canvas(node, {
        backgroundColor: "#FFF5F0",
        scale: 1,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: 1080,
        height: cardHeight,
        windowWidth: 1080,
        windowHeight: cardHeight,
        imageTimeout: 8000,
        scrollX: 0,
        scrollY: 0,
      }).then(function (canvas) {
        try {
          var dataUrl = canvas.toDataURL("image/png");
          var a = document.createElement("a");
          a.href = dataUrl;
          a.download = "sanlian-judge-" + (cur.uid || "000000") + ".png";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast("鉴定证书已下载到本地", "success");
        } catch (e) {
          // e.message 可能为 null/undefined,加 fallback
          var emsg = (e && e.message) || "未知错误";
          toast("生成失败:" + emsg, "error");
        }
      }).catch(function (err) {
        var emsg = (err && err.message) || "未知错误";
        toast("截图失败:" + emsg, "error");
        console.error("[share] html2canvas error:", err);
      }).then(function () {
        // 无论成功失败都清理临时 DOM
        cleanup();
      });
    });
  }

  function bind() {
    var btn = document.getElementById("btn-share-cert");
    if (btn) {
      btn.addEventListener("click", function () { share(); });
    }
  }

  // 兼容 share 接口被旧代码调用
  window.SanlianShare = { share: share };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
