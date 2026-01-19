# YourTJ Credit - 已部署地址与对接说明

## 生产地址（Vercel）
- 前端（Web）：`https://yourtj-credit-frontend.vercel.app`
- 后端 Core（钱包/转账/交易历史/词库/管理后台/兑换码）：`https://yourtj-credit-backend-core.vercel.app`
- 后端 Market（任务/商品/订单托管/举报入口）：`https://yourtj-credit-backend-market.vercel.app`

说明：为规避 Vercel Hobby “单项目最多 12 个 Serverless Functions” 限制，后端拆分为 `backend-core` 与 `backend-market` 两个项目；管理后台 API 已收敛为 Core 的单个聚合路由 `/api/admin/*`。

## 环境变量清单

### 后端 Core（`Credit/backend-core`）
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORDLIST_SECRET`
- `ADMIN_JWT_SECRET`（管理后台 JWT 签名密钥）
- `ADMIN_MASTER_SECRET`（紧急重置密钥，可选但建议配置）
- `REDEEM_CODE_SECRET`（兑换码哈希/HMAC 密钥）

### 后端 Market（`Credit/backend-market`）
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORDLIST_SECRET`
- `FEISHU_WEBHOOK_URL`（可选：飞书机器人 Webhook，用于“新审批”通知）
- `FEISHU_WEBHOOK_SECRET`（可选：飞书签名密钥；开启签名校验时需要）
- `PUBLIC_FRONTEND_URL`（可选：通知按钮跳转用；默认自动使用请求 Origin）

> 备注：旧的 `ADMIN_SECRET`（`X-Admin-Token`）为历史遗留，管理后台已切换到 Core 的 `/api/admin/*`（Bearer JWT）。

### 前端（`Credit/frontend`）
- `VITE_API_CORE_URL`（指向 Core 后端，不带末尾 `/`）
- `VITE_API_MARKET_URL`（指向 Market 后端，不带末尾 `/`）
- `VITE_WORDLIST_SECRET`（必须与后端 `WORDLIST_SECRET` 完全一致；会被打包进前端产物）

## 真实数据库验收（推荐）
已提供一键端到端 smoke 脚本（会产生真实写入与交易记录）：
- 基础联调：`Credit/backend-core/scripts/smoke-test-split.js`
- 管理后台/补偿扣回/兑换码联调：`Credit/backend-core/scripts/smoke-test-admin-flow.js`

PowerShell 示例：
```powershell
cd "f:/YourTJ Credit/Credit/backend-core"
$env:CORE_BASE   = "https://yourtj-credit-backend-core.vercel.app"
$env:MARKET_BASE = "https://yourtj-credit-backend-market.vercel.app"
node scripts/smoke-test-admin-flow.js
```

## Turso CLI（必须通过 WSL）
示例（从 Windows PowerShell 调用 WSL）：
```bash
wsl -e bash -lc "~/.turso/turso auth login"
wsl -e bash -lc "~/.turso/turso db show <db-name> --url"
wsl -e bash -lc "~/.turso/turso db tokens create <db-name>"
```
