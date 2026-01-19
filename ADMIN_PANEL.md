# 管理后台（Admin）使用说明

## 入口
- 前端入口：`/admin`（例如：`https://yourtj-credit-frontend.vercel.app/admin`）

## 登录与改密
- 初始管理密码：`admin`
- 登录成功后会获得管理 JWT（仅前端本地保存，用于调用 `/api/admin/*`）
- 改密入口：管理后台「设置」页（写入数据库 `settings.admin_password_hash`，无需重新部署即可生效）
- 紧急重置（可选）：后端 Core 配置 `ADMIN_MASTER_SECRET` 后，可用该密钥绕过登录直接重置密码（接口：`POST /api/admin/password`，传 `masterSecret`）

## 功能模块
### 1) 交易举报/申诉处理
- 列表查看：举报原因/描述、交易编号、交易双方卡号等信息
- 处理动作：
  - 驳回（reject）：仅更新举报状态
  - 结案（resolve）：仅更新举报状态
  - 补偿（compensate）：优先给受害者加分（允许对方后续扣回），并生成「扣回单」
- 资金规则：
  - 允许扣成负数
  - “补偿优先”：先补给受害者，再通过扣回单从对方扣回
- 流水/余额：
  - 所有补偿/扣回/手工加减都会写入 `transactions`，类型为 `admin_adjust`，并实时反映到钱包余额与历史流水

### 2) 内容举报（任务/商品）
- 用户端入口：交易广场（任务/商品详情弹窗内的「举报/申诉」）
- 管理端处理动作：
  - 商品：下架 / 恢复 / 改价
  - 任务：取消任务
  - 驳回 / 结案

### 3) 扣回单（Recovery）
- 查看所有补偿生成的扣回单
- 执行扣回：从对方扣回（允许扣成负数），并写入 `admin_adjust` 流水

### 4) 卡号处理
- 查询某卡号：查看余额与最近 50 条流水
- 手工加减分：写入 `admin_adjust` 流水并更新余额

### 5) 兑换码
- 管理端创建兑换码：可设置标题、数值、有效期、可用次数
- 用户端兑换入口：历史流水页顶部「兑换码」按钮
- 防重复：同一个兑换码同一张卡只能兑换一次；超次数/过期会被拒绝

## 相关后端
### Core（`https://yourtj-credit-backend-core.vercel.app`）
- 管理后台聚合 API：`/api/admin/*`
- 用户兑换：`POST /api/redeem`

### Market（`https://yourtj-credit-backend-market.vercel.app`）
- 内容举报创建：`POST /api/report/create`（支持 task/product）

