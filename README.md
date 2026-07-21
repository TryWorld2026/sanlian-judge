# 三连鉴定委员会 · Sanlian Judge

> 丢一个 B 站 UID 进来,三连鉴定委员会当场开盒,赐你一枚电子勋章。  
> 一份"半认真半整活"的 7 模块鉴定证书 + B 站风格分享卡

![主色 #FB7299](https://img.shields.io/badge/B站粉-FB7299?logo=bilibili&logoColor=white)
![B站蓝 #00AEEC](https://img.shields.io/badge/B站蓝-00AEEC?logo=bilibili&logoColor=white)
![StepFun](https://img.shields.io/badge/LLM-StepFun%20step--3.7--flash-FF6B6B)
![Flask](https://img.shields.io/badge/Local-Flask%203.0-black?logo=flask)

## 这是什么

**三连鉴定委员会** 是 B 站宇宙最权威的同人鉴定机构,专治各种 UP 主 / 普通用户的"自以为是"。

输入任意 B 站 UID(支持 1-18 位),委员会当场调取你的公开数据(粉丝/关注/稿件/等级/官方认证),结合 StepFun 大模型,盖一枚烫金印章,赐你 7 模块鉴定证书:

1. **核心身份卡** — 头像 + 昵称 + 等级 + 粉丝
2. **弹幕人格类型** — 4 维度打分 + B 站梗向命名
3. **赛博前世** — 穿越梗 + emoji 身份
4. **精神状态** — 仪表盘 + 心理年龄 + 健康建议
5. **2026 运势** — 事业 / 财富 / 桃花 / 抽象 / 幸运色号
6. **赛博灵魂伴侣** — 匹配 B 站知名 UP 主 + 相似度
7. **弹幕风格鉴定** — 常用 / 从不 + 等级评分
8. **离谱指数** — 0-100 毒舌打分 + 全站排名
9. **三连按钮 + 弹幕评论流** — 仪式感收尾

设计风格:B 站双品牌色(粉 #FB7299 + 蓝 #00AEEC) + 得意黑字体 + Neo-Brutalist 硬投影 + 7 条弹幕飘过背景。

> ⚠️ 与 B 站官方无关。本项目是粉丝同人整活作品。

## 本地启动

### 1. 准备环境

- Python 3.10+
- 一个 **StepFun(阶跃星辰)** API Key(申请:[platform.stepfun.com](https://platform.stepfun.com))

### 2. 安装依赖

```powershell
Copy-Item .env.example .env
# 编辑 .env,填入 STEPFUN_API_KEY=sk-你的key

pip install -r requirements.txt
```

> 注意:`requirements.txt` 列了核心依赖,但 `bilibili-api-python` 还需要一个 HTTP 客户端才能发请求(`curl_cffi` / `httpx` / `aiohttp` 三选一)。本项目推荐 `curl_cffi`(自带 TLS 指纹,B 站反爬友好):
> ```powershell
> pip install curl_cffi
> ```

### 3. 启动开发服务器

```powershell
# 方式 A:Flask 一体化服务器(推荐)
$env:STEPFUN_API_KEY = "sk-你的key"
python scripts/dev_server.py
# 监听 http://localhost:5000
```

> 也可以把 `STEPFUN_API_KEY` 写进 `.env` 文件,然后在启动命令前 `Get-Content .env | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] } }`。

### 4. 浏览器访问

打开 [http://localhost:5000](http://localhost:5000)

- 输入 B 站 UID(如 `546195` 老番茄),点击"开始鉴定"
- 等待 30-90 秒(LLM reasoning 模型首次思考)查看报告
- 可点击右上角「分享」生成鉴定证书 / 「离谱榜」查看排行榜

### 5. 单独调试 API

```powershell
# 调试 B 站接口
python scripts/test_profile.py 546195

# 端到调 LLM(需 STEPFUN_API_KEY)
$env:STEPFUN_API_KEY = "sk-你的key"
python scripts/test_analyze.py 546195
```

## 项目结构

```
三连鉴定/
├── api/                            # 业务逻辑
│   ├── profile.py                  # GET  /api/profile  B 站用户数据(4 接口并行)
│   ├── analyze.py                  # POST /api/analyze  StepFun AI 鉴定(7 模块)
│   ├── rank.py                     # GET  /api/rank     离谱排行榜
│   ├── _llm.py                     # StepFun LLM 调用 + JSON 容错解析
│   └── _rank_store.py              # 排行榜文件读写(原子写入 + 全局锁)
├── prompts/
│   ├── system.md                   # 系统 Prompt(首席鉴定官口吻,B 站梗向)
│   └── user.md                     # 7 模块合并的 User Prompt 模板
├── data/
│   └── rank.json                   # 排行榜预置数据(11 条真实 B 站 UP 主)
├── static/
│   ├── css/style.css               # B 站双品牌色 + Neo-Brutalist 设计系统
│   └── js/                         # 前端逻辑(原生 JS,无构建)
│       ├── brand.js                # 主入口: UID 输入 → loading → 渲染
│       ├── report.js               # 鉴定证书 9 模块渲染(含三连 + 弹幕评论)
│       ├── share.js                # html2canvas 分享卡(1080×N PNG,鉴定证书视觉)
│       ├── rank.js                 # 排行榜弹窗
│       ├── danmu.js                # 弹幕实时轮播
│       └── cache.js                # localStorage 缓存(24h TTL + LRU 10)
├── scripts/
│   ├── dev_server.py               # 一体化 Flask 本地服务器
│   ├── test_profile.py             # 调试 B 站 API
│   ├── test_analyze.py             # 端到调 LLM
│   ├── verify_mvp.py               # 完整 MVP 验证(11 项)
│   └── debug_llm_raw.py            # LLM 原始响应诊断
├── index.html                      # 单页 SPA 入口
├── requirements.txt                # Python 依赖
├── .env.example                    # 环境变量示例
└── README.md                       # 本文件
```

## 三个 API 端点

### GET `/api/profile?uid={uid}`

获取 B 站用户公开数据。4 接口并行(user_info / relation_info / overview_stat / videos)。

### POST `/api/analyze`

调用 StepFun 生成 7 模块鉴定证书(body 包含 `uid` + `profile`)。

返回 7 个模块:
- **personaType** 弹幕人格类型
- **pastLife** 赛博前世
- **mentalState** 精神状态评估
- **fortune2026** 2026 运势预测
- **soulMate** 赛博灵魂伴侣
- **danmuStyle** 弹幕风格鉴定
- **craziness** 离谱指数

### GET `/api/rank?type=craziness&page=1&limit=20`

读取离谱指数排行榜(11 条预置真实 B 站 UP 主,本地 `data/rank.json` 文件存储)。

## 关于 StepFun 集成

`step-3.7-flash` 是 StepFun(阶跃星辰)提供的 OpenAI 兼容 Chat 模型:

- 接口:`https://api.stepfun.com/step_plan/v1/chat/completions`
- 返回:`choices[0].message.content`(JSON 字符串,需自行解析)

`api/_llm.py` 的容错策略:

1. **`response_format=json_object`** 强制 JSON 输出
2. **`max_tokens=6000`** — 留够预算给 7 模块完整 JSON
3. **timeout=45s** — 单次调用上限
4. **3 次重试 + 指数退避** — 仅重试 5xx / 429 瞬时错误,JSON 解析失败不重试
5. **JSON 容错解析** — 三次回退(直接 parse → 找首个 `{...}` 平衡块 → 兜底默认值)
6. **Prompt 强约束** — system prompt 明确写"直接输出 JSON,不要解释"

## 成本估算

- **StepFun API**: 阶跃星辰按量计费(step-3.7-flash 单次 7 模块 ≈ 0.01-0.05 元)
- **本地运行**:零成本,自己电脑随便跑

## 安全说明

- 头像走 `/api/avatar` 代理(SSRF 防护:`urllib.parse.urlparse` 严格 hostname 校验)
- 颜色字段走 `#RRGGBB` 正则白名单(XSS 防护)
- localStorage 隐私模式容错(`lsGet/lsSet/lsRemove` 包装 + try/catch)
- 渲染异常用 `try/finally` 保证 `_loadingInFlight` 状态一定释放

## 注意事项

1. **regtime 为 0 的老账号**:部分 B 站老用户(如老番茄)`regtime` 字段返回 0,前端会显示"元老级"。
2. **B 站风控 (-352)**:频繁请求可能触发 B 站风控,建议 1-2 秒间隔。
3. **UID 长度**:B 站 2023 年升级后 UID 最多 18 位(已修正 13 → 18)。

## 许可

仅供娱乐。鉴定由 AI 生成,与 B 站官方无关。
