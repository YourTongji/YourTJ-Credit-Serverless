# YourTJ Credit

YourTJ Credit 是为 YOURTJ 社区提供的积分系统（去中心化钱包 + 任务/商品交易 + 申诉/举报 + 管理后台）。

本仓库为 **Vercel Serverless + Turso(libSQL)** 的分体式部署：
- `frontend`：Web 前端（桌面端/移动端自适应）
- `backend-core`：钱包/转账/流水/词库/管理后台/兑换码（聚合 `/api/admin/*`）
- `backend-market`：任务/商品/订单托管/举报入口
- `shared`：前后端共享 types 与加密工具（派生、签名、验签等）

> 说明：为规避 Vercel Hobby “单项目最多 12 个 Serverless Functions” 限制，后端拆分为 `backend-core` 与 `backend-market` 两个项目。

## 在线地址

- 前端：`https://yourtj-credit-frontend.vercel.app`
- Core：`https://yourtj-credit-backend-core.vercel.app`
- Market：`https://yourtj-credit-backend-market.vercel.app`

## 安全模型

- 钱包无账户：由 **学号 + PIN** 在本地浏览器派生密钥（PBKDF2），生成 3 词助记词。
- 请求签名：涉及资金/下单/发单/举报等写操作必须携带 `timestamp` + `nonce`，并用 `userSecret` 计算 HMAC-SHA256 签名；服务端验签后才写库（防重放）。
- 词库：通过后端受保护接口获取 2048 词库（用于助记词生成与校验）。

## 开发环境

要求：Node.js >= 18（建议 20）

### 1) 前端（Vite）

```bash
cd frontend
npm install
npm run dev
```

### 2) 后端（本地调试）

两套后端均提供本地 `dev-server.js`，用于在本地启动 API（无需 `vercel dev`）。

```bash
# Core
cd backend-core
npm install
node dev-server.js

# Market（另开一个终端）
cd ../backend-market
npm install
node dev-server.js
```

默认端口以各自 `dev-server.js` 为准。

### 3) 真实端到端验收（会写入数据库）

推荐使用现成脚本做真实联调（含举报/管理员补偿/扣回/兑换码等完整链路）：

```powershell
cd "f:/YourTJ Credit/Credit/backend-core"
$env:CORE_BASE   = "https://yourtj-credit-backend-core.vercel.app"
$env:MARKET_BASE = "https://yourtj-credit-backend-market.vercel.app"
node scripts/smoke-test-admin-flow.js
```

## 部署（保持当前线上行为不变）

### Vercel 环境变量（必须在 Vercel Dashboard 配置，勿写入仓库）

**backend-core**
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORDLIST_SECRET`
- `ADMIN_JWT_SECRET`
- `ADMIN_MASTER_SECRET`（可选但建议）
- `REDEEM_CODE_SECRET`

**backend-market**
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORDLIST_SECRET`
- `FEISHU_WEBHOOK_URL`（可选）
- `FEISHU_WEBHOOK_SECRET`（可选）
- `PUBLIC_FRONTEND_URL`（可选，用于飞书卡片按钮跳转；默认取请求 Origin）

**frontend**
- `VITE_API_CORE_URL`
- `VITE_API_MARKET_URL`
- `VITE_WORDLIST_SECRET`（必须与后端 `WORDLIST_SECRET` 一致；会被打包进前端产物）

详细部署说明见：`DEPLOYMENT.md`、`DEPLOYED_URLS.md`、`WEBHOOK_SETUP.md`。

### GitHub 仓库绑定与自动部署（推荐：Vercel Git Integration）

本仓库是一个 **monorepo**，对应 3 个 Vercel 项目（前端/Core/Market）。为了保持现网不变，请分别在对应目录下执行连接（会复用既有项目与环境变量）：

```bash
# 1) 前端
cd frontend
vercel git connect https://github.com/YourTongji/YourTJ-Credit-Serverless.git

# 2) Core
cd ../backend-core
vercel git connect https://github.com/YourTongji/YourTJ-Credit-Serverless.git

# 3) Market
cd ../backend-market
vercel git connect https://github.com/YourTongji/YourTJ-Credit-Serverless.git
```

完成后：
- `main` 分支提交会触发 Production 自动更新。
- PR 会生成 Preview 部署（如需）。
- Vercel 环境变量仍以 Dashboard 中已配置的为准，不会被仓库覆盖。

> 若 Vercel Dashboard 中的 Root Directory 被改动，请分别设置为：`frontend/`、`backend-core/`、`backend-market/`。

## API 清单（按服务拆分）

下面列出主要 API（更完整的字段说明以各接口源码/类型定义为准）。

### Core（backend-core）

**钱包**
- `POST /api/wallet/register`：注册/恢复钱包（可带 `userSecret`）
- `GET /api/wallet/:userHash`：查询钱包信息
- `GET /api/wallet/:userHash/balance`：查询余额

**交易**
- `POST /api/transaction/create`：系统类交易（如奖励/补发）
- `POST /api/transaction/transfer`：转账（签名）
- `GET /api/transaction/:txId`：查询单笔交易
- `GET /api/transaction/history/:userHash`：查询流水

**词库**
- `GET /api/wordlist`：获取词库（受保护）
- `GET /api/wordlist/token`：获取短期 token（受保护）

**兑换码**
- `POST /api/redeem`：用户兑换（签名）

**管理后台（聚合路由）**
- `POST /api/admin/auth`：管理登录（返回 Bearer JWT）
- `POST /api/admin/password`：修改管理密码（热更新）
- `GET /api/admin/reports`：查询举报/申诉（支持 `kind=transaction|content`、`status`、`reportId`）
- `POST /api/admin/reports`：处理举报/申诉（结案/驳回/补偿/下架/改价等）
- `GET /api/admin/recovery`：查询扣回单
- `POST /api/admin/recovery`：执行扣回
- `GET /api/admin/user?userHash=...`：查询指定卡号钱包/流水
- `POST /api/admin/user`：对指定卡号加/减并写入流水
- `GET /api/admin/redeem`：查询兑换码
- `POST /api/admin/redeem`：创建兑换码
- `POST /api/admin/redeem/disable`：禁用兑换码

### Market（backend-market）

**任务**
- `POST /api/task/create`：发布任务（签名）
- `GET /api/task/list`：任务列表
- `POST /api/task/accept`：接单（签名）
- `POST /api/task/complete`：提交/确认完成（签名）

**商品**
- `POST /api/product/create`：发布商品（签名）
- `GET /api/product/list`：商品列表
- `POST /api/product/purchase`：下单/卖家处理/买家确认（签名）

**举报/申诉**
- `POST /api/report/create`：提交交易举报/内容举报（签名，且会触发飞书通知（若开启））
- `GET /api/report/list`：查看举报记录

## 签名请求格式（重要）

需要签名的写操作：请求体必须包含 `timestamp`、`nonce`，并附带请求头：

- `X-User-Hash: <user_hash>`
- `X-Signature: <hmac_sha256_hex>`
- `X-Timestamp: <timestamp_ms>`
- `X-Nonce: <random_nonce>`

具体签名字段排序与计算规则见：`shared/utils/transaction-verification.ts` 与前端 `src/shared/utils/transaction-verification.ts`。
