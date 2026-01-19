# YourTJ Credit 部署与验收

本文档以“手把手部署并逐项验收”为目标，适用于 Windows + WSL（要求：使用 Turso CLI 时通过 WSL 执行）。

## 1. 前置要求

- Node.js >= 18
- 一个 Turso 账号
- 一个 Vercel 账号

## 2. 数据库（Turso）

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

初始化表结构（在项目根 `Credit/backend` 下执行）：

```bash
wsl -e bash -lc "~/.turso/turso db shell yourtj-credit < schema.sql"
```

## 3. 部署后端（Vercel）

后端拆分为两个 Vercel 项目以满足 Hobby 计划函数数量限制：

- Core 后端：`Credit/backend-core`（钱包、交易、词库）
- Market 后端：`Credit/backend-market`（任务、商品、举报、管理员）

在 Vercel 项目环境变量中配置：

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WORDLIST_SECRET`（自定义随机字符串）

两套后端都需要配置以上环境变量，并分别部署，得到两个后端 URL：

- `VITE_API_CORE_URL`（Core 后端 URL，例如 `https://xxx-core.vercel.app`）
- `VITE_API_MARKET_URL`（Market 后端 URL，例如 `https://xxx-market.vercel.app`）

## 4. 部署前端（Vercel）

目录：`Credit/frontend`

在 Vercel 项目环境变量中配置：

- `VITE_API_CORE_URL`：填 Core 后端 URL（不带末尾斜杠）
- `VITE_API_MARKET_URL`：填 Market 后端 URL（不带末尾斜杠）
- `VITE_WORDLIST_SECRET`：与后端 `WORDLIST_SECRET` 保持一致

部署后访问前端 URL。

## 5. 功能验收清单（建议顺序）

### 5.1 钱包生成与绑定

1. 桌面端输入学号 + PIN 登录/注册
2. 进入“安全”页，验证 PIN 后显示助记词
3. 桌面端生成“手机绑定二维码”
4. 手机端切换到“扫码”模式，扫描桌面端二维码完成导入

### 5.2 余额与流水

1. 查看余额是否可拉取
2. 查看交易历史与交易详情页跳转是否正常

### 5.3 转账

1. 使用另一个钱包地址进行转账
2. 检查发送方与接收方余额变化
3. 在历史中检查交易记录与详情

### 5.4 任务与商品

1. 发布任务（悬赏）
2. 其他钱包接受并完成任务，检查结算
3. 发布商品并购买，检查库存与结算

### 5.5 申诉/举报与管理员

1. 在交易详情页创建申诉/举报
2. 管理员接口处理工单并检查状态变化

## 6. 本地端到端真实测试（开发验收用）

如果需要在本机对所有“数据库交互与交易流程”做真实验收，可使用脚本：

```bash
cd backend
npm install
node scripts/run-smoke-local.js
```

该脚本使用本地 `file:./dev.db`（libSQL/SQLite 引擎）完成端到端验证，不依赖 `vercel dev`。
