# YourTJ Credit 部署与验收（Windows + WSL）

本项目为 monorepo，对应 3 个 Vercel 项目：
- `frontend/`：前端站点（`credit.yourtj.de`）
- `backend-core/`：Core API（`core.credit.yourtj.de`）
- `backend-market/`：Market API（`market.credit.yourtj.de`）

> 说明：历史遗留的 `backend/`（单体后端）已废弃并从仓库移除；请以 `backend-core/` + `backend-market/` 为准。

## 1) 前置要求
- Node.js >= 18
- 一个 Turso 账号
- 一个 Vercel 账号（已绑定项目）
- Turso CLI 必须通过 WSL 执行

## 2) 数据库（Turso）

在 Windows 终端通过 WSL 执行 Turso CLI（示例）：
```bash
wsl -e bash -lc "~/.turso/turso auth login"
wsl -e bash -lc "~/.turso/turso db create yourtj-credit"
wsl -e bash -lc "~/.turso/turso db show yourtj-credit --url"
wsl -e bash -lc "~/.turso/turso db tokens create yourtj-credit"
```

拿到以下两项：
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

初始化表结构（从 `Credit/backend-core` 执行即可，`schema.sql` 与 `backend-market` 一致）：
```bash
cd "f:/YourTJ Credit/Credit/backend-core"
wsl -e bash -lc "~/.turso/turso db shell yourtj-credit < schema.sql"
```

## 3) 后端部署（Vercel）

### Core（`Credit/backend-core`）
需要在 Vercel Project Env Vars 配置：
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORDLIST_SECRET`
- `ADMIN_JWT_SECRET`
- `ADMIN_MASTER_SECRET`（可选）
- `REDEEM_CODE_SECRET`

### Market（`Credit/backend-market`）
需要在 Vercel Project Env Vars 配置：
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORDLIST_SECRET`
- `FEISHU_WEBHOOK_URL`（可选）
- `FEISHU_WEBHOOK_SECRET`（可选）
- `PUBLIC_FRONTEND_URL`（可选）

## 4) 前端部署（Vercel）

目录：`Credit/frontend`

前端环境变量（Vercel Project Env Vars）：
- `VITE_WORDLIST_SECRET`（必须与后端 `WORDLIST_SECRET` 完全一致）
- `VITE_API_CORE_URL`（可选：直连 Core；生产环境默认走同域 `/api/*` 代理）
- `VITE_API_MARKET_URL`（可选：直连 Market；生产环境默认走同域 `/api/*` 代理）

## 5) 验收（真实线上 API）

建议从前端域名走同域代理验收（最贴近真实用户网络环境）：
- `https://credit.yourtj.de/api/wordlist/token`（POST）
- `https://credit.yourtj.de/api/task/list?page=1&limit=1`（GET）
- `https://credit.yourtj.de/api/product/list?page=1&limit=1`（GET）

端到端脚本（会真实写入/读取数据库）：
```powershell
cd "f:/YourTJ Credit/Credit/backend-core"
$env:CORE_BASE   = "https://core.credit.yourtj.de"
$env:MARKET_BASE = "https://market.credit.yourtj.de"
node scripts/smoke-test-admin-flow.js
```
