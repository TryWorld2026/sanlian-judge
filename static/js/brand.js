/**
 * 三连鉴定 · brand.js
 * 主页面交互:UID 输入 → 后端鉴 → 渲染 cert-card
 * 设计:基于 _brand_v2.html 布局,接入 /api/profile + /api/analyze
 */
(function () {
  "use strict";

  var NS = "sanlian";
  var API_BASE = "";
  var ANALYZE_TIMEOUT = 180000;  // 3 分钟(AI reasoning 较慢)
  var PROFILE_TIMEOUT = 15000;   // 15s(B 站接口 4 并行,正常 2-5s)
  var currentUid = null;
  var currentProfile = null;
  var currentReport = null;
  var _loadingInFlight = false;
  var _loadingTimer = null;
  var _loadingStart = 0;

  // ========== 工具 ==========
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function safeColor(c, def) {
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : (def || "#FB7299");
  }
  function clamp(n, lo, hi, def) {
    n = parseInt(n, 10);
    if (isNaN(n)) return def || 0;
    return Math.max(lo, Math.min(hi, n));
  }
  function cleanUid(v) { return String(v || "").replace(/[^\d]/g, ""); }
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

  // ========== Toast ==========

  function computeJoinDays(regtime) {
    if (!regtime || regtime <= 0) return 0;
    var delta = Math.floor(Date.now() / 1000) - regtime;
    return delta > 0 ? Math.floor(delta / 86400) : 0;
  }

  // ========== 后端代理获取 B 站数据 ==========
  // 浏览器直连 B 站需要 Wbi 签名 + CORS 代理,免费代理经常超时/被风控。
  // 直接走本服务的 /api/profile 端点,后端用 curl_cffi 拿到完整数据。
  function fetchBiliProfile(uid) {
    return getJSON(API_BASE + "/api/profile?uid=" + encodeURIComponent(uid), PROFILE_TIMEOUT)
      .then(function (r) {
        if (!r || r.code !== 0 || !r.data) {
          throw new Error((r && r.error) || "B站数据获取失败,请稍后再试");
        }
        return r.data;
      });
  }

  // ========== Toast ==========
  function toast(msg, type) {
    var c = $("toast-container");
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

  // ========== UID 校验 ==========
  function validateUid(v) {
    if (!v) return "丢一个 B 站 UID 进来才能开始鉴定哦";
    if (!/^\d+$/.test(v)) return "UID 只能输入数字,别夹带私货";
    if (v.length > 18) return "UID 太长啦(B 站最长 18 位)";
    return null;
  }
  function showHint(msg, isError) {
    var h = $("input-hint");
    if (!h) return;
    h.textContent = msg || "";
    h.className = "input-hint" + (isError ? " error" : "");
  }

  // ========== Fetch with timeout ==========
  function fetchWithTimeout(url, opts, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, ms);
    return fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }))
      .then(function (r) { clearTimeout(t); return r; })
      .catch(function (e) { clearTimeout(t); throw e; });
  }
  function getJSON(url, ms) {
    return fetchWithTimeout(url, { method: "GET", headers: { "Accept": "application/json" } }, ms || 15000)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
  }
  function postJSON(url, body, ms) {
    return fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body || {}),
    }, ms || 30000)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
  }

  // ========== 加载遮罩控制 ==========
  function showLoading() {
    _loadingStart = Date.now();
    var ov = $("loading-overlay");
    if (ov) {
      ov.classList.add("show");
      ov.setAttribute("aria-hidden", "false");
    }
    setStep(1);
    setBar(5);
    var elapsedEl = $("loading-elapsed");
    if (elapsedEl) elapsedEl.textContent = "0";
    showLoadingHint("蹲在 B 站门口敲门 ...");
    if (_loadingTimer) clearInterval(_loadingTimer);
    _loadingTimer = setInterval(function () {
      var sec = Math.floor((Date.now() - _loadingStart) / 1000);
      var el = $("loading-elapsed");
      if (el) el.textContent = String(sec);
      // 进度条:0-60s 线性 5%→85%,60s 后停在 90%
      var pct = Math.min(90, 5 + sec * 1.3);
      setBar(pct);
      if (sec === 15) {
        setStep(2);
        showLoadingHint("正在分析 B 站数据,生成鉴定报告 ...");
      } else if (sec === 30) {
        setStep(3);
        showLoadingHint("三连鉴定委员会正在激烈讨论,马上出结果 ...");
      } else if (sec >= 60 && sec < 80) {
        showLoadingHint("出签比较慢,通常 60-90s 才能烫好金印章,谢谢耐心");
      } else if (sec >= 80) {
        showLoadingHint("印章盖了比较久,请不要走开 ...");
      }
    }, 1000);
  }
  function hideLoading() {
    if (_loadingTimer) { clearInterval(_loadingTimer); _loadingTimer = null; }
    var ov = $("loading-overlay");
    if (ov) {
      ov.classList.remove("show");
      ov.setAttribute("aria-hidden", "true");
    }
  }
  function setStep(n) {
    for (var i = 1; i <= 3; i++) {
      var el = $("step-" + i);
      if (!el) continue;
      el.classList.remove("active", "done");
      if (i < n) el.classList.add("done");
      else if (i === n) el.classList.add("active");
    }
  }
  function setBar(pct) {
    var b = $("loading-bar");
    if (b) b.style.width = Math.max(5, Math.min(100, pct)) + "%";
  }
  function showLoadingHint(msg) {
    var h = $("loading-hint");
    if (h) h.textContent = msg || "";
  }

  // ========== 鉴证渲染 ==========
  function renderCert(profile, report, uid) {
    var p = profile || {};
    var r = report || {};
    currentProfile = p;
    currentReport = r;
    currentUid = uid;

    // 名字 / UID
    $("cert-name").textContent = p.name || "???";
    $("cert-uid").textContent = "UID " + uid;

    // 等级
    var lvWrap = $("cert-level-wrap");
    if (p.level != null && p.level !== "") {
      lvWrap.style.display = "block";
      $("cert-level").textContent = "LV " + p.level;
    } else {
      lvWrap.style.display = "none";
    }

    // 三连指数 = 离谱指数
    var cz = r.craziness || {};
    var score = clamp(cz.score, 0, 100, 50);
    $("cert-score").textContent = String(score);

    // 标签:从 persona + craziness 提炼
    var tags = [];
    var persona = r.personaType || {};
    if (persona.type) tags.push({ text: "# " + persona.type, blue: false });
    if (cz.level) tags.push({ text: "# " + cz.level, blue: true });
    if (p.fans != null && p.fans >= 100000) tags.push({ text: "# 硬核 UP", blue: false });
    if (persona.tags && persona.tags.length) {
      persona.tags.slice(0, 2).forEach(function (t, i) {
        if (t) {
          // 用 tag 文本的稳定 hash 决定颜色(避免每次渲染抖动)
          var h = 0;
          for (var j = 0; j < t.length; j++) h = (h * 31 + t.charCodeAt(j)) >>> 0;
          tags.push({ text: "# " + t, blue: (h + i) % 2 === 0 });
        }
      });
    }
    tags = tags.slice(0, 4);
    if (tags.length === 0) {
      tags = [{ text: "# B 站原住民", blue: false }, { text: "# 三连鉴定中", blue: true }];
    }
    $("cert-tags").innerHTML = tags.map(function (t) {
      return '<span class="cert-tag' + (t.blue ? " blue" : "") + '">' + escapeHtml(t.text) + '</span>';
    }).join("");

    // 鉴定语
    var quote = cz.verdict || persona.description || (p.name ? p.name + " 已被三连鉴定委员会盖章" : "等待鉴定");
    $("cert-quote").textContent = quote;

    // 鉴定证书激活样式(去掉旋转,换粉色硬投影)
    var card = $("cert-card");
    if (card) card.classList.add("has-data");

    // 显示"查看完整报告"按钮
    var cta = $("btn-open-report");
    if (cta) cta.style.display = "block";

    // 启用分享按钮
    var shareBtn = $("btn-share-cert");
    if (shareBtn) shareBtn.disabled = false;

    // 滚动到证书(平滑)
    try {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (_) {}
  }

  // ========== 鉴定主流程 ==========
  function startAnalyze() {
    if (_loadingInFlight) {
      toast("鉴定正在进行中,别催别催", "info");
      return;
    }
    var input = $("uid-input");
    var btn = $("btn-submit");
    var raw = cleanUid(input ? input.value : "");
    var err = validateUid(raw);
    if (err) {
      showHint(err, true);
      return;
    }
    showHint("");

    _loadingInFlight = true;
    if (btn) btn.disabled = true;
    showLoading();

    // 3 分钟兜底:_safetyFired 防止 catch 块已经清理后 safetyTimer 再次触发
    var _safetyFired = false;
    var safetyTimer = setTimeout(function () {
      if (_safetyFired) return;
      _safetyFired = true;
      hideLoading();
      _loadingInFlight = false;
      if (btn) btn.disabled = false;
      toast("印章盖了太久没盖下来,稍后再来一次吧", "error");
    }, ANALYZE_TIMEOUT + 15000);

    // Step 1: profile (走本地后端 /api/profile,后端用 curl_cffi 直连 B 站)
    return fetchBiliProfile(raw).then(function (profile) {
      setStep(2);
      showLoadingHint("正在分析 B 站数据,生成鉴定报告 ...");
      setBar(40);
      // Step 2: analyze (profile 随请求传入,后端不再自行拉取)
      return postJSON(API_BASE + "/api/analyze", { uid: raw, profile: profile }, ANALYZE_TIMEOUT)
        .then(function (r2) {
          if (!r2 || r2.code !== 0) throw new Error((r2 && r2.error) || "三连鉴定委员会算挂了,稍后再试");
          return { profile: profile, report: r2.data };
        });
    })
      .then(function (data) {
        setStep(3);
        setBar(100);
        showLoadingHint("鉴定报告已生成 ✓");
        // 写入缓存
        try {
          if (window.CyberJudgeCache && window.CyberJudgeCache.set) {
            window.CyberJudgeCache.set(raw, data.report, data.profile);
          }
        } catch (_) {}
        // 短暂展示盖章完成
        setTimeout(function () {
          try {
            renderCert(data.profile, data.report, raw);
            toast("鉴定完成,三连鉴定委员会向你致谢", "success");
          } catch (e) {
            console.error("render error:", e);
            toast("鉴定证书印糊了,请稍后再试一次", "error");
          } finally {
            // 标记 safety 已处理,防止兜底 timer 重复触发 toast
            _safetyFired = true;
            clearTimeout(safetyTimer);
            hideLoading();
            _loadingInFlight = false;
            if (btn) btn.disabled = false;
          }
        }, 300);
      })
      .catch(function (e) {
        _safetyFired = true;
        clearTimeout(safetyTimer);
        hideLoading();
        _loadingInFlight = false;
        if (btn) btn.disabled = false;
        var msg = (e && e.message) || "网络开小差";
        if (/abort/i.test(msg) || /超时/.test(msg)) {
          msg = "B 站敲门敲太久没人开(>15s),稍后再试";
        } else if (/Failed to fetch|fetch/i.test(msg)) {
          msg = "请确认网络正常,能访问 B 站和本页面";
        } else if (/JSON|Unexpected token|SyntaxError/i.test(msg)) {
          msg = "后端服务未就绪,请确认 Worker 已部署";
        }
        toast(msg, "error");
        console.error("[brand] analyze error:", e);
      });
  }

  // ========== 输入交互 ==========
  function bindInput() {
    var input = $("uid-input");
    if (!input) return;
    var btn = $("btn-submit");
    input.addEventListener("input", function () {
      var v = cleanUid(input.value);
      if (v !== input.value) input.value = v;
      var err = validateUid(v);
      showHint(err, !!err);
    });
    input.addEventListener("paste", function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData("text");
      var v = cleanUid(text);
      input.value = v;
      var err = validateUid(v);
      showHint(err, !!err);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); startAnalyze(); }
    });
    if (btn) btn.addEventListener("click", function () { startAnalyze(); });

    // 提示 kbd 可点击自动填充 UID
    var tips = document.querySelectorAll(".input-tip kbd");
    tips.forEach(function (k) {
      k.style.cursor = "pointer";
      k.addEventListener("click", function () {
        var text = k.textContent || "";
        // 提取末尾数字作为 UID(如"老番茄 546195" → "546195")
        var match = text.match(/(\d+)$/);
        if (!match) return;
        var uid = match[1];
        input.value = uid;
        // 触发 validation + 自动开始鉴定
        var err = validateUid(uid);
        showHint(err, !!err);
        if (!err) startAnalyze();
      });
    });
  }

  // ========== 三连按钮交互 ==========
  function bindSanlian() {
    var btns = document.querySelectorAll(".sanlian-btn");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.classList.contains("done")) return;
        if (!currentReport) {
          toast("先鉴定一位 UP 主才能三连哦", "info");
          return;
        }
        b.classList.add("done");
        var tip = b.getAttribute("data-tip") || "三连";
        toast("已 " + tip + " · 三连鉴定委员会向你致谢", "success");
      });
    });
  }

  // ========== 排行榜交互 ==========
  function bindRank() {
    var btn = $("btn-rank");
    var modal = $("rank-modal");
    var close = $("rank-close");
    if (!btn || !modal) return;
    btn.addEventListener("click", function () {
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
      // 触发 rank.js 加载(若有)
      try {
        if (window.SanlianRank && typeof window.SanlianRank.load === "function") {
          window.SanlianRank.load("rank-body");
        } else if (window.CyberJudgeRank && typeof window.CyberJudgeRank.load === "function") {
          window.CyberJudgeRank.load("rank-body");
        }
      } catch (e) { console.error(e); }
    });
    function closeModal() {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
    }
    if (close) close.addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("show")) closeModal();
    });
  }

  // ========== 报告页导航 ==========
  function openReportPage() {
    if (!currentProfile || !currentReport) {
      toast("先鉴定一位 UP 主才能看完整报告哦", "info");
      return;
    }
    if (!window.SanlianReport) {
      toast("报告模块未加载", "error");
      return;
    }
    try {
      window.SanlianReport.render(currentProfile, currentReport, currentUid);
      // 报告里渲染了三连按钮,这里也单独 rebind(防止被 report.js 内部 observer 抢占)
      if (typeof window.SanlianReport.rebindSanlian === "function") {
        window.SanlianReport.rebindSanlian();
      }
    } catch (e) {
      console.error("report render error:", e);
      toast("报告渲染失败", "error");
      return;
    }
    window.SanlianReport.show();
    // 同步顶部 nav 标题里的 UID
    var navUid = document.getElementById("nav-uid");
    if (navUid) navUid.textContent = "#" + (currentUid || "000000");
  }
  function closeReportPage() {
    if (window.SanlianReport) window.SanlianReport.hide();
  }
  function bindReportNav() {
    // 入口按钮:cert-card 内的"查看完整报告"
    var cta = $("btn-open-report");
    if (cta) cta.addEventListener("click", openReportPage);

    // 报告页内:返回
    var back = $("btn-back-home");
    if (back) back.addEventListener("click", function () { closeReportPage(); });

    // 报告页内:重新鉴定
    var retry = $("btn-retry-report");
    if (retry) retry.addEventListener("click", function () {
      closeReportPage();
      // 清空当前数据,让用户输入新 UID
      var input = $("uid-input");
      if (input) {
        currentProfile = null;
        currentReport = null;
        currentUid = null;
        input.value = "";
        try { input.focus(); } catch (_) {}
      }
      // 重置 hint(上一次的 error 状态不应残留)
      showHint("");
      // 重置 cert-card 到默认占位态
      var cta2 = $("btn-open-report");
      if (cta2) cta2.style.display = "none";
      var share2 = $("btn-share-cert");
      if (share2) share2.disabled = true;
      var card2 = $("cert-card");
      if (card2) card2.classList.remove("has-data");
      // 复位 cert-card 内的占位文本(与 index.html 初始值一致)
      var cn = $("cert-name"); if (cn) cn.textContent = "等待鉴定";
      var cu = $("cert-uid"); if (cu) cu.textContent = "UID ——";
      var cs = $("cert-score"); if (cs) cs.textContent = "0";
      var ct = $("cert-tags"); if (ct) ct.innerHTML = '<span class="cert-tag"># 等你输入 UID</span>';
      var cq = $("cert-quote"); if (cq) cq.textContent = "三连鉴定委员会在此候命";
      var clw = $("cert-level-wrap"); if (clw) clw.style.display = "none";
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) {}
    });

    // 报告页内:分享证书
    var reportShare = $("btn-report-share");
    if (reportShare) reportShare.addEventListener("click", function () {
      if (window.SanlianShare && window.SanlianShare.share) {
        window.SanlianShare.share();
      } else {
        toast("分享组件未加载", "error");
      }
    });

    // 报告页内:排行榜
    var reportRank = $("btn-report-rank");
    if (reportRank) reportRank.addEventListener("click", function () {
      // 排行榜模态是顶层的,即使报告页打开了也能弹
      var btn = $("btn-rank");
      if (btn) btn.click();
    });
  }

  // ========== 启动 ==========
  function init() {
    if (location.protocol === "file:") {
      console.warn("请用 http://localhost:5000 打开,file:// 协议会触发 CORS");
    }
    bindInput();
    bindSanlian();
    bindRank();
    bindReportNav();

    // 自动聚焦
    var input = $("uid-input");
    if (input) {
      setTimeout(function () { try { input.focus(); input.select(); } catch (_) {} }, 100);
    }
  }

  // 暴露给 share.js / report.js / 调试
  window.Sanlian = {
    getCurrent: function () {
      return { uid: currentUid, profile: currentProfile, report: currentReport };
    },
    toast: toast,
    proxyAvatar: proxyAvatar,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
