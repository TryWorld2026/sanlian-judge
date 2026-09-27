# CLAUDE.md

This file provides guidance to Claude Code (claude.ai) when working with code in this repository.

## 项目概述

**三连鉴定委员会 (Sanlian Judge)** — 丢一个B站UID进来，委员会调用 B站 API + StepFun AI 生成一份"半认真半整活"的9模块鉴定证书。**两套运行时**:线上 Cloudflare Pages Functions(JS)，本地 Python Flask；业务契约完全一致。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | HTML5 + 自定义 CSS (Neo-Brutalist) + 原生 JS (6 个文件,无框架无构建) |
| 线上后端 | Cloudflare Pages Functions (`functions/`,ES Module,esbuild 打包) |
| 本地后端 | Python 3.10+，Flask 一体化服务器 (`scripts/dev_server.py`) |
| B站数据 | 线上:Wbi 签名 + fetch(直连失败回退公共 CORS 代理);本地:`bilibili-api-python` v17.4.2 + `curl_cffi`(4 接口并行) |
| LLM | StepFun (阶跃星辰) `step-3.7-flash`,OpenAI 兼容协议,`response_format=json_object`,单次返回 7 模块 JSON |
| 存储 | 排行榜 `data/rank.json`(线上按静态文件同源读取,本地直接读文件,原子写入 + 全局锁) |

## 目录结构

```
.
├── api/                            # 本地后端(Python handler,统一 {code,data,error} 契约)
│   ├── profile.py                  # GET /api/profile  4 接口并行 + 异常分类
│   ├── analyze.py                  # POST /api/analyze StepFun 鉴定 + 异步排行榜写入
│   ├── rank.py                     # GET /api/rank
│   ├── _llm.py                     # StepFun 调用 + 3 次重试 + JSON 容错 + prompt 加载
│   └── _rank_store.py              # 排行榜原子写入(临时文件 + os.replace + 全局锁)
├── functions/                      # 线上后端(Cloudflare Pages Functions,文件即路由)
│   ├── api/
│   │   ├── profile.js              # GET /api/profile
│   │   ├── analyze.js              # POST /api/analyze(含按 IP 限流 20 次/分)
│   │   ├── rank.js                 # GET /api/rank(同源读 data/rank.json,内置兜底)
│   │   └── avatar.js               # GET /api/avatar(SSRF host 白名单)
│   └── _shared/                    # ★ 共享实现,唯一出处
│       ├── wbi.js                  # MD5 + Wbi 签名 + fetchWithProxy 代理回退
│       ├── prompts.js              # SYSTEM_PROMPT + renderUserPrompt
│       └── llm.js                  # DEFAULTS + deepMergeDefaults + parseJSON
├── prompts/                        # Python 侧 prompt 源文件(与 functions/_shared/prompts.js 内容对应)
├── data/rank.json                  # 排行榜数据(两端共用)
├── static/
│   ├── fonts.css                   # @font-face(得意黑)
│   ├── fonts/SmileySans-Oblique.*  # 4 种格式,woff2 优先
│   └── js/
│       ├── brand.js                # 主入口:UID 输入 → loading → 渲染;含 24h 缓存命中
│       ├── report.js               # 9 模块渲染 + 三连按钮 + 弹幕评论流 + IO 入场动画
│       ├── share.js                # html2canvas 分享卡(按需动态加载,3 CDN 回退)
│       ├── rank.js                 # 排行榜弹窗
│       ├── danmu.js                # 弹幕轮播(预设池)
│       └── cache.js                # localStorage 缓存(TTL 24h + LRU 10 + 隐私模式容错)
├── scripts/
│   ├── dev_server.py               # Flask 一体化服务器(端口 5000,静态禁缓存)
│   ├── verify_mvp.py               # ★ 全量验证 12 项(改任何代码后必跑)
│   └── test_*.py / debug_*.py / qa_*.py  # 调试与 QA 脚本
├── index.html                      # 单页 SPA(内联全部 CSS,html2canvas 改由 share.js 动态加载)
├── CNAME                           # 自定义域名 sanlian-judge.tryworld.com.cn
└── requirements.txt
```

## 9个报告模块

| 模块 | 标题 | 渲染函数 (report.js) | 数据来源 |
|------|------|---------------------|---------|
| 1 | 核心身份卡 | `renderProfile` | B站 API |
| 2 | 弹幕人格类型 | `renderPersona` | LLM |
| 3 | 赛博前世 | `renderPastLife` | LLM |
| 4 | 精神状态评估 | `renderMental` | LLM |
| 5 | 2026运势预测 | `renderFortune` | LLM |
| 6 | 赛博灵魂伴侣 | `renderSoulMate` | LLM(虚构角色池,严禁真实 UP 名) |
| 7 | 弹幕风格鉴定 | `renderDanmu` | LLM |
| 8 | 离谱指数 | `renderCraziness` | LLM |
| 9 | 三连按钮 + 弹幕评论流 | `renderSanlianBar` / `renderDanmuStream` | 本地 |

模块1直接从 profile 渲染,其余 7 个模块由 LLM 一次调用生成;模块 9 是纯前端仪式感收尾。

## 关键架构决策

1. **双运行时同契约**:`api/*.py` 与 `functions/api/*.js` 都返回 `{code, data, error}`;前端 `brand.js` 只依赖契约,不关心后端是哪套。
2. **JS 侧单一实现**:Wbi/prompt/DEFAULTS/容错只放 `functions/_shared/`,4 个 Function 文件 import 复用。禁止在 function 文件里复制粘贴共享逻辑(历史上因此出现过多份漂移)。
3. **Wbi 签名与库对齐**:`functions/_shared/wbi.js` 的 `encWbi` 逐行对齐 `bilibili_api.utils.network._enc_wbi` —— **wts 必须入签**,漏掉会被 B 站判 -403。`verify_mvp.py` 第 12 项做固定输入回归对比。
4. **B 站请求代理回退**:Cloudflare IP 可能被 B 站风控,`fetchWithProxy` 按 [直连, allorigins, corsproxy] 顺序尝试,全部失败返回 null 由调用方分类。
5. **排行榜单一数据源**:线上 `functions/api/rank.js` 同源 fetch `/data/rank.json`(静态资产),与本地 Python 读同一文件;fetch 失败回退内置数据。
6. **前端缓存**:`cache.js` 写 + 读闭环。`brand.js` 鉴定前先查缓存,命中直接渲染(24h TTL);报告页 `fromCache` 控制缓存横幅。
7. **html2canvas 按需加载**:`share.js` 动态插 script,bootcdn → cdnjs → jsdelivr 回退,国内可用。
8. **`/api/analyze` 限流**:Pages Function 内按 IP 20 次/分钟(尽力而为,isolate 不共享状态;硬限流走 Cloudflare Rate Limiting 规则)。

## 常见开发命令

```bash
# 本地启动 (Flask 开发服务器, 端口 5000)
pip install -r requirements.txt && pip install curl_cffi
$env:STEPFUN_API_KEY = "sk-xxx"
python scripts/dev_server.py

# 调试单个 API 脚本 (不需启动服务器)
python scripts/test_profile.py 546195
python scripts/test_analyze.py 546195

# ★ 全量验证(仓库结构 / 配置 / HTML / JS 语法 node --check / 模块 / 数据 /
#   Prompt / Python 语法 / 三个端点 / Wbi 签名回归)—— 改完代码必跑
python scripts/verify_mvp.py

# 单独检查 JS 语法
node --check static/js/brand.js
```

## API 契约

### GET /api/profile?uid={uid}
- 成功: `{code: 0, data: {name, face, level, fans, following, regtime, joinDays, videos, ...}, error: null}`
- 失败: `{code: -1, data: null, error: "..."}` — 风控(-352/-799)/不存在/超时/参数非法

### POST /api/analyze
- Body: `{uid, profile}` (profile 必填,前端先从 /api/profile 拿到再传入)
- 成功: `{code: 0, data: {personaType, pastLife, mentalState, fortune2026, soulMate, danmuStyle, craziness}, error: null}`
- 失败: `{code: -1, ...}`;超限流: HTTP 429
- 超时: 180s (LLM reasoning 模型首 token 较慢,3 次重试最坏 ~140s)

### GET /api/rank?type=craziness&page=1&limit=20
- 返回: `{code: 0, data: {list: [...], total, type, page, limit, timestamp}, error: null}`

## LLM 容错策略(Python/JS 双实现保持一致)

1. `response_format=json_object` 强制 JSON 输出
2. `max_tokens=6000`
3. HTTP timeout=45s,最多 3 次(指数退避 1s→2s→4s + jitter)
4. 仅重试 5xx/429/空choices/空content/JSON解析失败;4xx 不重试
5. JSON 容错:直接 parse → markdown 围栏剥离 → 平衡 `{}` 块提取 → DEFAULTS 逐字段兜底
6. `soulMate` 兜底默认必须是虚构角色(九尾狐),严禁真实 B 站 UP 主名

## 设计系统

- 移动端优先,最大宽度 640px,桌面端居中
- 主色 `#FB7299` (B站粉),辅色 `#00AEEC` (B站蓝),强调色 `#F5C842`
- 背景 `#FFF5F0`,卡片白底 + 4px 黑边 + 硬投影(Neo-Brutalist)
- 字体:得意黑(本地 static/fonts/)+ 系统 fallback
- 全部 CSS 内联在 index.html(`static/css/` 已不存在,不要引用)

## 注意点(踩坑记录)

- **B站风控 (-352/-799)**:云函数 IP 易触发;`fetchWithProxy` 会回退代理,但仍建议控制频率
- **Wbi 签名 wts 必须入签**:见上;改 `encWbi` 后必须跑 `verify_mvp.py` 第 12 项
- **JS 语法检查必须用 ESM 模式**:`functions/` 全部是 ES Module,`node --check file.js` 在部分 Node 版本不会按 module 解析;`verify_mvp.py` 的做法是拷贝为 `.mjs` 再 check
- **regtime 为 0**:部分老账号返回 0,前端显示"元老级"
- **头像跨域**:html2canvas 需要 `/api/avatar` 代理,直接访问 B 站 CDN 会因 CORS 失败
- **UID 长度**:B站 2023 年后最长 18 位;前端 `cleanUid` 过滤非数字,后端正则 `^\d+$` 双重校验
- **PowerShell 启动**:用 `$env:PYTHONIOENCODING="utf-8"` 避免 GBK 编码错误
- **`.env` 只进 .gitignore**:真实 STEPFUN_API_KEY 绝不入库
