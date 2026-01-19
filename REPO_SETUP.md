# 仓库初始化与自动部署说明

本项目为 monorepo，对应 3 个 Vercel 项目：
- `frontend/` → `yourtj-credit-frontend`
- `backend-core/` → `yourtj-credit-backend-core`
- `backend-market/` → `yourtj-credit-backend-market`

为了保持现网行为不变：
- **所有运行时密钥/数据库连接**只允许存在于 Vercel 环境变量中（Production），不写入 Git。
- 仓库中仅保留 `.env.example` 作为字段参考。

## 1. 防泄露规则

根目录 `.gitignore` 已默认忽略：
- `node_modules/`
- `dist/`、`build/`
- `*.db`（含 `dev.db`）
- `.env*`（含 `.env.local` 等）

并且仅保留 `.vercel/project.json` 用于在 CI/本地确定“部署到哪个 Vercel 项目”，其余 `.vercel/` 内容不提交。

## 2. 自动部署（推荐：GitHub Actions）

已提供工作流：`.github/workflows/deploy-vercel.yml`  
触发条件：`main` 分支 push 或手动 `workflow_dispatch`。

### 需要配置的 GitHub Secret

在 GitHub 仓库 Settings → Secrets and variables → Actions → New repository secret 中添加：

- `VERCEL_TOKEN`：Vercel Personal Token（仅此一个即可）

创建 token 的方式：
- 打开 Vercel Dashboard → Account Settings → Tokens → Create

> 说明：部署会复用 Vercel 项目中已经配置的 Production 环境变量，不会从仓库读取或覆盖。

## 3. 绑定到 Vercel Git（可选）

如果希望在 Vercel Dashboard 中显示“已连接 GitHub 仓库”，可以使用 Vercel 的 Git Integration：

```bash
cd frontend
vercel git connect https://github.com/YourTongji/YourTJ-Credit-Serverless.git

cd ../backend-core
vercel git connect https://github.com/YourTongji/YourTJ-Credit-Serverless.git

cd ../backend-market
vercel git connect https://github.com/YourTongji/YourTJ-Credit-Serverless.git
```

若出现“无权限访问仓库”：
- 需要在 Vercel Team/账号中安装并授权 GitHub App 对 `YourTongji/YourTJ-Credit-Serverless` 的访问权限；
- 或在 Vercel Dashboard 中手动 Connect Git Repository。

