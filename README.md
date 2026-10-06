# Sanlian Judge · 三连鉴定委员会

> Drop in a Bilibili UID and the committee opens the box on the spot, handing you an electronic badge.
> A "half-serious, half-unhinged" 9-module certificate plus a share card in Bilibili styling

![Primary #FB7299](https://img.shields.io/badge/Bilibili%20pink-FB7299?logo=bilibili&logoColor=white)
![Bilibili blue #00AEEC](https://img.shields.io/badge/Bilibili%20blue-00AEEC?logo=bilibili&logoColor=white)
![StepFun](https://img.shields.io/badge/LLM-StepFun%20step--3.7--flash-FF6B6B)
![Cloudflare Pages](https://img.shields.io/badge/production-Cloudflare%20Pages%20Functions-F38020?logo=cloudflare&logoColor=white)
![Flask](https://img.shields.io/badge/local-Flask%203.0-black?logo=flask)
![License](https://img.shields.io/badge/license-MIT-C0452F?style=flat-square)
<br/>
<a href="README.zh-CN.md"><strong>简体中文</strong></a>

## What this is

**Sanlian Judge** is the most authoritative fan-made appraisal institution in the Bilibili universe, treating UP hosts and ordinary users who take themselves a little too seriously.

Enter any Bilibili UID (1–18 digits supported). The committee pulls your public data (followers, following, submissions, level, official verification), combines it with a StepFun model, stamps a gold seal, and issues a 9-module certificate:

1. **Core identity card** — avatar + nickname + level + follower count
2. **Danmaku personality type** — scored on 4 dimensions, named after Bilibili memes
3. **Cyber past life** — a time-travel gag plus an emoji identity
4. **Mental state** — a gauge, a psychological age, and health advice
5. **2026 fortune** — career / wealth / romance / abstraction / lucky color
6. **Cyber soulmate** — a matched fictional character with a similarity score
7. **Danmaku style appraisal** — words you use often, words you never use, plus a level grade
8. **Absurdity index** — a 0–100 sharp-tongued score with a site-wide rank
9. **Triple-action buttons + danmaku stream** — the ceremonial finish

Visual style: Bilibili's dual brand colors (pink #FB7299 and blue #00AEEC), the Smiley Sans typeface, Neo-Brutalist hard shadows, and danmaku scrolling across the background.

> ⚠️ Not affiliated with Bilibili. This is a fan-made joke project.

## Architecture: two runtimes, one business contract

```
Browser SPA (index.html + static/js/*, vanilla JS, no build step)
   │  fetch /api/*
   ▼
┌────────────────────────────┬─────────────────────────────┐
│ Production: Cloudflare     │ Local: Python Flask         │
│ Pages static assets +      │ scripts/dev_server.py       │
│ Pages Functions            │ api/*.py + bilibili-api-py  │
│ functions/api/*.js         │ (Wbi signing handled by the │
│ (Wbi signing implemented   │  library)                   │
│  on the JS side)           │                             │
└────────────────────────────┴─────────────────────────────┘
                      │  both call
                      ▼
         StepFun step-3.7-flash (the LLM appraisal)
         Bilibili open endpoints (public user data)
```

- **Production**: push the repo to Cloudflare Pages via Git integration. The `functions/` directory is picked up as Pages Functions automatically and `CNAME` binds the custom domain. No build command needed.
- **Local development**: a single-file Flask server whose business logic lives in `api/*.py` and behaves identically to production.
- **The LLM and Bilibili data** are the same on both sides. The only difference is the signing and network layer around Bilibili requests.

## Running locally

### 1. Prepare the environment

- Python 3.10+
- Node.js (optional, used by `node --check` and the JS syntax checks in `scripts/verify_mvp.py`)
- A **StepFun** API key (request one at [platform.stepfun.com](https://platform.stepfun.com))

### 2. Install dependencies

```powershell
Copy-Item .env.example .env
# Edit .env and set STEPFUN_API_KEY=sk-your-key

pip install -r requirements.txt
```

> Note: `requirements.txt` lists the core dependencies, but `bilibili-api-python` also needs an HTTP client to make requests (`curl_cffi`, `httpx`, or `aiohttp` — pick one). `curl_cffi` is recommended because it ships a TLS fingerprint that Bilibili's anti-scraping is friendlier to:
> ```powershell
> pip install curl_cffi
> ```

### 3. Start the dev server

```powershell
$env:STEPFUN_API_KEY = "sk-your-key"
python scripts/dev_server.py
# Listening on http://localhost:5000
```

### 4. Open it in a browser

Visit [http://localhost:5000](http://localhost:5000)

- Enter a Bilibili UID (for example `546195`), then click "Start appraisal"
- Wait 30–90 seconds while the reasoning model thinks for the first time
- The same UID within 24 hours hits the local cache (localStorage, zero latency)
- Use "Share" in the top right to generate a certificate, or "Leaderboard" for the ranking

### 5. Debug a single endpoint

```powershell
python scripts/test_profile.py 546195      # debug the Bilibili endpoints
python scripts/test_analyze.py 546195      # end-to-end LLM call (needs STEPFUN_API_KEY)
python scripts/verify_mvp.py               # full verification (JS syntax + Wbi signing regression)
```

## Deploying to Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → connect this Git repository
2. Leave the build command and output directory empty (pure static + Functions)
3. Set the environment variable `STEPFUN_API_KEY` (Pages project Settings → Environment variables)
4. Add the custom domain under Pages project Settings → Domains (the repo's `CNAME` is a reference)
5. A push deploys; every file under `functions/` becomes a route (`functions/api/profile.js` → `/api/profile`)

## Project structure

```
.
├── api/                            # local backend business logic (Python)
│   ├── profile.py                  # GET  /api/profile  Bilibili user data (4 endpoints in parallel)
│   ├── analyze.py                  # POST /api/analyze  StepFun appraisal (7 modules)
│   ├── rank.py                     # GET  /api/rank     absurdity leaderboard
│   ├── _llm.py                     # StepFun call + JSON tolerance parsing + prompt loading
│   └── _rank_store.py              # leaderboard file I/O (atomic write + global lock)
├── functions/                      # production runtime: Cloudflare Pages Functions (JS)
│   ├── api/
│   │   ├── profile.js              # GET  /api/profile  Wbi signing + 4 endpoints in parallel
│   │   ├── analyze.js              # POST /api/analyze  StepFun call + rate limit
│   │   ├── rank.js                 # GET  /api/rank     reads same-origin data/rank.json
│   │   └── avatar.js               # GET  /api/avatar   avatar proxy (SSRF allowlist)
│   └── _shared/                    # shared implementation (single source, avoids drift)
│       ├── wbi.js                  # MD5 + Wbi signing (aligned line by line with bilibili_api) + proxy fallback
│       ├── prompts.js              # system / user prompts (matching prompts/*.md)
│       └── llm.js                  # DEFAULTS + JSON tolerance + deep merge
├── prompts/
│   ├── system.md                   # system prompt (chief-appraiser voice, Bilibili meme flavored)
│   └── user.md                     # user prompt template merging the 7 modules
├── data/
│   └── rank.json                   # leaderboard data (shared by local Python and Pages)
├── static/
│   ├── fonts.css                   # @font-face declarations
│   ├── fonts/                      # Smiley Sans (woff2 first)
│   └── js/                         # frontend logic (vanilla JS, no build)
│       ├── brand.js                # main entry: UID input → loading → render (with cache hits)
│       ├── report.js               # renders the 9 certificate modules (with triple-action + danmaku)
│       ├── share.js                # html2canvas share card (loaded on demand, multi-CDN fallback)
│       ├── rank.js                 # leaderboard modal
│       ├── danmu.js                # live danmaku carousel
│       └── cache.js                # localStorage cache (24h TTL + LRU 10)
├── scripts/
│   ├── dev_server.py               # single-file Flask local server
│   ├── verify_mvp.py               # full verification (12 checks, incl. node --check and Wbi regression)
│   ├── test_profile.py / test_analyze.py  # single-endpoint debugging
│   └── ...                         # qa_full / debug_* and other debugging scripts
├── index.html                      # single-page SPA entry
├── requirements.txt                # Python dependencies
├── .env.example                    # environment variable sample
└── README.md                       # This file
```

## The three API endpoints

### GET `/api/profile?uid={uid}`

Fetches public Bilibili user data. Four endpoints run in parallel (user_info / relation_info / overview_stat / videos). In production a Pages Function signs the Wbi token before calling Bilibili; locally `bilibili-api-python` handles it.

### POST `/api/analyze`

Calls StepFun to generate the 7-module certificate (the body carries `uid` + `profile`).
**There is a simple rate limit**: 20 requests per minute per IP by default (best effort, each instance counts separately; for a hard limit configure Rate Limiting rules in the Cloudflare dashboard).

Returns 7 modules: `personaType` / `pastLife` / `mentalState` / `fortune2026` / `soulMate` / `danmuStyle` / `craziness`.

### GET `/api/rank?type=craziness&page=1&limit=20`

Reads the absurdity leaderboard. In production it reads the same-origin static file `data/rank.json`; locally it reads the same file.

## About the StepFun integration

`step-3.7-flash` is StepFun's OpenAI-compatible chat model:

- Endpoint: `https://api.stepfun.com/step_plan/v1/chat/completions`
- Returns: `choices[0].message.content` (a JSON string you must parse yourself)

Fault-tolerance strategy, kept identical across the Python and JS implementations:

1. **`response_format=json_object`** forces JSON output
2. **`max_tokens=6000`** — enough budget for the complete 7-module JSON
3. **timeout=45s**, at most 3 attempts, exponential backoff 1s→2s→4s plus jitter
4. Retries only on 5xx / 429 / empty choices / empty content / JSON parse failure; 4xx is not retried
5. **JSON tolerance** — three fallbacks in sequence (direct parse → strip markdown fences → extract the first balanced `{...}` block → default values)
6. **Strict prompt constraint** — the system prompt explicitly says "output JSON directly, no explanation"

## About Bilibili Wbi signing (read before changing code)

Some Bilibili endpoints require Wbi signing. The algorithm in `functions/_shared/wbi.js` is aligned line by line with `bilibili_api.utils.network._enc_wbi`:

1. `params["wts"] = current Unix seconds`
2. Sort by key and concatenate into a query string (**wts must be inside the signed string**)
3. `w_rid = MD5(query + mixin_key)`, where `mixin_key` is taken from the nav endpoint's img/sub keys, scrambled through a fixed table and truncated

> ⚠️ A trap hit in the past: signing only the business parameters and leaving `wts` out of the signed string makes Bilibili return -403 across the board. Check 12 of `scripts/verify_mvp.py` compares the JS implementation against the reference algorithm on fixed input to prevent regression.

## Security notes

- Avatars go through the `/api/avatar` proxy (SSRF protection: strict hostname allowlist, 2MB size limit, CORS headers)
- Color fields use a `#RRGGBB` regex allowlist (XSS protection)
- localStorage tolerates private mode (`lsGet/lsSet/lsRemove` wrappers plus try/catch)
- `/api/analyze` rate limits by IP (20 per minute) so STEPFUN_API_KEY cannot be burned through
- `.env` is excluded by .gitignore — never commit a real key

## Things to watch out for

1. **Bilibili risk control (-352 / -799)**: frequent requests may trigger it. When a direct call from a Pages Function fails, it falls back in order to public CORS proxies (a safety net only, free services are unreliable); keep 1–2 seconds between requests.
2. **Old accounts with regtime 0**: some long-standing Bilibili users return `regtime` as 0, and the frontend then shows "老账号" (veteran account).
3. **UID length**: Bilibili raised the maximum to 18 digits in 2023.
4. **PowerShell**: set `$env:PYTHONIOENCODING="utf-8"` to avoid GBK encoding errors.
5. **Share card capture**: `share.js` loads html2canvas on demand, falling back bootcdn → cdnjs → jsdelivr; bootcdn works inside China.
6. **Local cache**: the same UID within 24 hours hits the localStorage cache and skips all network requests; "appraise the next one" clears and resets it.

## Cost estimate

- **StepFun API**: billed per use (one 7-module appraisal with step-3.7-flash is roughly ¥0.01–0.05)
- **Cloudflare Pages**: effectively free within the free tier (100k Functions requests/day)

## License

Released under the [MIT License](LICENSE).

For entertainment only. The appraisal is AI-generated and has no connection to Bilibili.