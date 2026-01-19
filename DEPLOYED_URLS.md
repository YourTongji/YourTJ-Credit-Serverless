# YourTJ Credit - 已部署地址与对接说明

## 生产地址（自定义域名）
- 前端（Web）：`https://credit.yourtj.de`
- 后端 Core（钱包/转账/交易历史/词库/兑换码/管理后台聚合路由）：`https://core.credit.yourtj.de`
- 后端 Market（任务/商品/订单/举报入口等市场能力）：`https://market.credit.yourtj.de`

## 生产地址（Vercel 备用域名）
- 前端（Web）：`https://yourtj-credit-frontend.vercel.app`
- 后端 Core：`https://yourtj-credit-backend-core.vercel.app`
- 后端 Market：`https://yourtj-credit-backend-market.vercel.app`

## 路由对接（重要）
为避免跨域与兼容性问题，前端项目在 `frontend/vercel.json` 中配置了反向代理：
- `credit.yourtj.de/api/*` 会按路径前缀转发到 `core.credit.yourtj.de` 或 `market.credit.yourtj.de`
- 例如：`/api/wordlist`（带 query）会正确转发到 Core（该路径曾因规则仅匹配 `/api/wordlist/*` 导致返回前端 HTML，现已修复）

## 环境变量清单（Vercel Project Env Vars）

### 后端 Core（`Credit/backend-core`）
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORDLIST_SECRET`
- `ADMIN_JWT_SECRET`
- `ADMIN_MASTER_SECRET`（可选，紧急重置用）
- `REDEEM_CODE_SECRET`

### 后端 Market（`Credit/backend-market`）
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORDLIST_SECRET`
- `FEISHU_WEBHOOK_URL`（可选：新申诉/举报通知）
- `FEISHU_WEBHOOK_SECRET`（可选：飞书签名密钥）
- `PUBLIC_FRONTEND_URL`（可选：通知卡片按钮跳转用）

### 前端（`Credit/frontend`）
- `VITE_API_CORE_URL`（可选：直连 Core；留空时走 `credit.yourtj.de/api/*` 代理）
- `VITE_API_MARKET_URL`（可选：直连 Market；留空时走 `credit.yourtj.de/api/*` 代理）
- `VITE_WORDLIST_SECRET`（必须与后端 `WORDLIST_SECRET` 完全一致）

## 真实数据库验收（建议）
- 基础联调：`Credit/backend-core/scripts/smoke-test-split.js`
- 管理后台/补偿扣回/兑换码联调：`Credit/backend-core/scripts/smoke-test-admin-flow.js`

PowerShell 示例：
```powershell
cd "f:/YourTJ Credit/Credit/backend-core"
$env:CORE_BASE   = "https://core.credit.yourtj.de"
$env:MARKET_BASE = "https://market.credit.yourtj.de"
node scripts/smoke-test-admin-flow.js
```

## Turso CLI（必须通过 WSL）示例
```bash
wsl -e bash -lc "~/.turso/turso auth login"
wsl -e bash -lc "~/.turso/turso db show <db-name> --url"
wsl -e bash -lc "~/.turso/turso db tokens create <db-name>"
```
