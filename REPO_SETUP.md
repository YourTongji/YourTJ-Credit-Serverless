# 仓库初始化与自动部署（GitHub Actions → Vercel）

本项目为 monorepo，对应 3 个 Vercel 项目（已通过各子目录的 `.vercel/project.json` 绑定）：
- `frontend/` → `yourtj-credit-frontend`
- `backend-core/` → `yourtj-credit-backend-core`
- `backend-market/` → `yourtj-credit-backend-market`

## 1) 防泄露规则

根目录 `Credit/.gitignore` 已默认忽略：
- `node_modules/`
- `dist/`、`build/`
- `*.db`（含 `dev.db`）
- `.env*`（所有环境变量文件）
- `.vercel/*`（仅允许提交 `.vercel/project.json` 用于定位项目）

仓库内只保留 `*.env.example` 作为字段参考；生产密钥/数据库连接只放在 Vercel Project Env Vars。

## 2) 自动部署（推荐：GitHub Actions）

工作流：`Credit/.github/workflows/deploy-vercel.yml`  
触发：`main` 分支 push 或手动 `workflow_dispatch`

### 需要配置的 GitHub Secret

在 GitHub 仓库（组织仓库也一样）：
`Settings → Secrets and variables → Actions → New repository secret`

添加：
- `VERCEL_TOKEN`：你的 Vercel Personal Token（需对 3 个 Vercel 项目有部署权限）

创建 token：
`Vercel Dashboard → Account Settings → Tokens → Create`

> 提醒：你在聊天里粘贴过 token，建议立刻在 Vercel 把旧 token Revoke/Rotate，然后把新 token 只放到 GitHub Secret 里。

### 部署原理
GitHub Actions 会在三个子目录分别执行：
- `npx vercel deploy --prod --yes --token="${{ secrets.VERCEL_TOKEN }}"`

部署会复用 Vercel 项目里现有的 Production 环境变量，不会从仓库读取或覆盖。

## 3) 可选：Vercel Git Integration
如果希望 Vercel Dashboard 显示“已连接 GitHub 仓库”，可在 Vercel 中安装并授权 GitHub App 访问组织仓库，再在各子目录执行：
```bash
cd frontend
vercel git connect https://github.com/YourTongji/YourTJ-Credit-Serverless.git

cd ../backend-core
vercel git connect https://github.com/YourTongji/YourTJ-Credit-Serverless.git

cd ../backend-market
vercel git connect https://github.com/YourTongji/YourTJ-Credit-Serverless.git
```
