# 三连鉴定委员会 · Sanlian Judge

> 丢一个 B 站 UID 进来,三连鉴定委员会当场开盒,赐你一枚电子勋章。
> 一份"半认真半整活"的 9 模块鉴定证书 + B 站风格分享卡

![主色 #FB7299](https://img.shields.io/badge/B站粉-FB7299?logo=bilibili&logoColor=white)
![B站蓝 #00AEEC](https://img.shields.io/badge/B站蓝-00AEEC?logo=bilibili&logoColor=white)
![StepFun](https://img.shields.io/badge/LLM-StepFun%20step--3.7--flash-FF6B6B)
![Cloudflare Pages](https://img.shields.io/badge/线上-Cloudflare%20Pages%20Functions-F38020?logo=cloudflare&logoColor=white)
![Flask](https://img.shields.io/badge/本地-Flask%203.0-black?logo=flask)
![License](https://img.shields.io/badge/license-MIT-C0452F?style=flat-square)

## 这是什么

**三连鉴定委员会** 是 B 站宇宙最权威的同人鉴定机构,专治各种 UP 主 / 普通用户的"自以为是"。

输入任意 B 站 UID(支持 1-18 位),委员会当场调取你的公开数据(粉丝/关注/稿件/等级/官方认证),结合 StepFun 大模型,盖一枚烫金印章,赐你 9 模块鉴定证书:

1. **核心身份卡** — 头像 + 昵称 + 等级 + 粉丝
2. **弹幕人格类型** — 4 维度打分 + B 站梗向命名
3. **赛博前世** — 穿越梗 + emoji 身份
4. **精神状态** — 仪表盘 + 心理年龄 + 健康建议
5. **2026 运势** — 事业 / 财富 / 桃花 / 抽象 / 幸运色号
6. **赛博灵魂伴侣** — 匹配虚构角色 + 相似度
7. **弹幕风格鉴定** — 常用 / 从不 + 等级评分
8. **离谱指数** — 0-100 毒舌打分 + 全站排名
9. **三连按钮 + 弹幕评论流** — 仪式感收尾

设计风格:B 站双品牌色(粉 #FB7299 + 蓝 #00AEEC)+ 得意黑字体 + Neo-Brutalist 硬投影 + 弹幕飘过背景。

> ⚠️ 与 B 站官方无关。本项目是粉丝同人整活作品。

## 架构:两套运行时,一套业务逻辑

```
浏览器 SPA (index.html + static/js/*,原生 JS 无构建)
   │  fetch /api/*
   ▼
┌────────────────────────────┬─────────────────────────────┐
│ 线上:Cloudflare Pages      │ 本地:Python Flask           │
│ 静态资产 + Pages Functions │ scripts/dev_server.py       │
│ functions/api/*.js         │ api/*.py + bilibili-api-py  │
│ (Wbi 签名在 JS 侧实现)     │ (Wbi 签名由库自动处理)      │
└────────────────────────────┴─────────────────────────────┘
                     │  两者都调
                     ▼
        StepFun step-3.7-flash (LLM 鉴定)
        B 站开放接口 (用户公开数据)
```

- **线上部署**:仓库推送到 Cloudflare Pages(git 集成),`functions/` 目录被自动识别为 Pages Functions,`CNAME` 绑定自定义域名。无需构建命令。
- **本地开发**:Flask 一体化服务器,业务逻辑在 `api/*.py`,与线上行为一致。
- **LLM 与 B 站数据**两端相同;差异只在 B 站请求的签名/网络层。

## 本地启动

### 1. 准备环境

- Python 3.10+
- Node.js(可选,用于 `node --check` / `scripts/verify_mvp.py` 的 JS 语法检查)
- 一个 **StepFun(阶跃星辰)** API Key(申请:[platform.stepfun.com](https://platform.stepfun.com))

### 2. 安装依赖

```powershell
Copy-Item .env.example .env
# 编辑 .env,填入 STEPFUN_API_KEY=sk-你的key

pip install -r requirements.txt
```

> 注意:`requirements.txt` 列了核心依赖,但 `bilibili-api-python` 还需要一个 HTTP 客户端才能发请求(`curl_cffi` / `httpx` / `aiohttp` 三选一)。推荐 `curl_cffi`(自带 TLS 指纹,B 站反爬友好):
> ```powershell
> pip install curl_cffi
> ```

### 3. 启动开发服务器

```powershell
$env:STEPFUN_API_KEY = "sk-你的key"
python scripts/dev_server.py
# 监听 http://localhost:5000
```

### 4. 浏览器访问

打开 [http://localhost:5000](http://localhost:5000)

- 输入 B 站 UID(如 `546195` 老番茄),点击"开始鉴定"
- 等待 30-90 秒(LLM reasoning 模型首次思考)查看报告
- 同一 UID 24 小时内再次鉴定直接命中本地缓存(localStorage,零延迟)
- 可点击右上角「分享」生成鉴定证书 / 「鉴定榜单」查看排行榜

### 5. 单独调试 API

```powershell
python scripts/test_profile.py 546195      # 调试 B 站接口
python scripts/test_analyze.py 546195      # 端到调 LLM(需 STEPFUN_API_KEY)
python scripts/verify_mvp.py               # 全量验证(含 JS 语法 + Wbi 签名回归)
```

## 部署到 Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → 连接到本 Git 仓库
2. 构建命令留空,输出目录留空(纯静态 + Functions)
3. 设置环境变量:`STEPFUN_API_KEY`(Pages 项目 Settings → Environment variables)
4. 自定义域名在 Pages 项目 Settings → Domains 中添加(仓库里的 `CNAME` 供参考)
5. 推送即部署;`functions/` 下每个文件自动成为一条路由(`functions/api/profile.js` → `/api/profile`)

## 项目结构

```
.
├── api/                            # 本地后端业务逻辑(Python)
│   ├── profile.py                  # GET  /api/profile  B 站用户数据(4 接口并行)
│   ├── analyze.py                  # POST /api/analyze  StepFun AI 鉴定(7 模块)
│   ├── rank.py                     # GET  /api/rank     离谱排行榜
│   ├── _llm.py                     # StepFun LLM 调用 + JSON 容错解析 + prompt 加载
│   └── _rank_store.py              # 排行榜文件读写(原子写入 + 全局锁)
├── functions/                      # 线上运行时:Cloudflare Pages Functions(JS)
│   ├── api/
│   │   ├── profile.js              # GET  /api/profile  Wbi 签名 + 4 接口并行
│   │   ├── analyze.js              # POST /api/analyze  StepFun 调用 + 限流
│   │   ├── rank.js                 # GET  /api/rank     读同源 data/rank.json
│   │   └── avatar.js               # GET  /api/avatar   头像代理(SSRF 白名单)
│   └── _shared/                    # 共享实现(单一出处,避免多份漂移)
│       ├── wbi.js                  # MD5 + Wbi 签名(与 bilibili_api 库算法对齐)+ 代理回退
│       ├── prompts.js              # system / user prompt(与 prompts/*.md 对应)
│       └── llm.js                  # DEFAULTS + JSON 容错 + 深合并
├── prompts/
│   ├── system.md                   # 系统 Prompt(首席鉴定官口吻,B 站梗向)
│   └── user.md                     # 7 模块合并的 User Prompt 模板
├── data/
│   └── rank.json                   # 排行榜数据(本地 Python 与线上 Pages 共用)
├── static/
│   ├── fonts.css                   # @font-face 声明
│   ├── fonts/                      # 得意黑字体(woff2 优先)
│   └── js/                         # 前端逻辑(原生 JS,无构建)
│       ├── brand.js                # 主入口: UID 输入 → loading → 渲染(含缓存命中)
│       ├── report.js               # 鉴定证书 9 模块渲染(含三连 + 弹幕评论)
│       ├── share.js                # html2canvas 分享卡(按需加载,多 CDN 回退)
│       ├── rank.js                 # 排行榜弹窗
│       ├── danmu.js                # 弹幕实时轮播
│       └── cache.js                # localStorage 缓存(24h TTL + LRU 10)
├── scripts/
│   ├── dev_server.py               # 一体化 Flask 本地服务器
│   ├── verify_mvp.py               # 全量验证(12 项,含 node --check 与 Wbi 签名回归)
│   ├── test_profile.py / test_analyze.py  # 单接口调试
│   └── ...                         # qa_full / debug_* 等调试脚本
├── index.html                      # 单页 SPA 入口
├── requirements.txt                # Python 依赖
├── .env.example                    # 环境变量示例
└── README.md                       # 本文件
```

## 三个 API 端点

### GET `/api/profile?uid={uid}`

获取 B 站用户公开数据。4 接口并行(user_info / relation_info / overview_stat / videos)。
线上由 Pages Function 做 Wbi 签名后请求 B 站;本地由 `bilibili-api-python` 处理。

### POST `/api/analyze`

调用 StepFun 生成 7 模块鉴定证书(body 包含 `uid` + `profile`)。
**有简单限流**:同一 IP 默认 20 次/分钟(尽力而为,多实例各算各的;硬限流请在 Cloudflare 后台配 Rate Limiting 规则)。

返回 7 个模块:`personaType` / `pastLife` / `mentalState` / `fortune2026` / `soulMate` / `danmuStyle` / `craziness`。

### GET `/api/rank?type=craziness&page=1&limit=20`

读取离谱指数排行榜。线上读同源静态文件 `data/rank.json`,本地读同一文件。

## 关于 StepFun 集成

`step-3.7-flash` 是 StepFun(阶跃星辰)提供的 OpenAI 兼容 Chat 模型:

- 接口:`https://api.stepfun.com/step_plan/v1/chat/completions`
- 返回:`choices[0].message.content`(JSON 字符串,需自行解析)

容错策略(Python 与 JS 两套实现保持一致):

1. **`response_format=json_object`** 强制 JSON 输出
2. **`max_tokens=6000`** — 留够预算给 7 模块完整 JSON
3. **timeout=45s**,最多 3 次调用,指数退避 1s→2s→4s + jitter
4. 仅重试 5xx / 429 / 空 choices / 空 content / JSON 解析失败;4xx 不重试
5. **JSON 容错** — 三次回退(直接 parse → 剥 markdown 围栏 → 提取首个平衡 `{...}` 块 → 兜底默认值)
6. **Prompt 强约束** — system prompt 明确写"直接输出 JSON,不要解释"

## 关于 B 站 Wbi 签名(改代码前必读)

B 站部分接口要求 Wbi 签名。算法要点(`functions/_shared/wbi.js` 与 `bilibili_api.utils.network._enc_wbi` 逐行对齐):

1. `params["wts"] = 当前 Unix 秒`
2. 按 key 排序拼成 query 串(**wts 必须在签名串里**)
3. `w_rid = MD5(query + mixin_key)`,`mixin_key` 由 nav 接口的 img/sub key 按固定表混淆截取

> ⚠️ 历史上踩过的坑:只签业务参数、把 `wts` 排除在签名串外,B 站会一律返回 -403。`scripts/verify_mvp.py` 第 12 项会用固定输入对比 JS 实现与参考算法的输出,防回归。

## 安全说明

- 头像走 `/api/avatar` 代理(SSRF 防护:hostname 白名单严格校验 + 2MB 大小限制 + CORS 头)
- 颜色字段走 `#RRGGBB` 正则白名单(XSS 防护)
- localStorage 隐私模式容错(`lsGet/lsSet/lsRemove` 包装 + try/catch)
- `/api/analyze` 按 IP 限流(20 次/分钟),保护 STEPFUN_API_KEY 不被刷
- `.env` 已被 .gitignore 排除,切勿提交真实 key

## 注意事项

1. **B 站风控 (-352 / -799)**:频繁请求可能触发 B 站风控。线上 Pages Function 直连失败时会按序回退到公共 CORS 代理(仅兜底,免费服务不稳定);建议请求间隔 1-2 秒。
2. **regtime 为 0 的老账号**:部分 B 站老用户 `regtime` 字段返回 0,前端会显示"元老级"。
3. **UID 长度**:B 站 2023 年升级后 UID 最多 18 位。
4. **PowerShell 启动**:用 `$env:PYTHONIOENCODING="utf-8"` 避免 GBK 编码错误。
5. **分享卡截图**:html2canvas 由 share.js 按需动态加载,按 bootcdn → cdnjs → jsdelivr 顺序回退,国内可用 bootcdn。
6. **本地缓存**:同一 UID 24 小时内命中 localStorage 缓存,跳过全部网络请求;"鉴定下一位"会清空重置。

## 成本估算

- **StepFun API**:阶跃星辰按量计费(step-3.7-flash 单次 7 模块 ≈ 0.01-0.05 元)
- **Cloudflare Pages**:免费额度内(10 万次 Functions 请求/天)基本零成本

## 许可

本项目采用 [MIT License](LICENSE) 开源。

仅供娱乐。鉴定由 AI 生成,与 B 站官方无关。
