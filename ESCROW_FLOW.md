# 任务/商品托管确认制（Escrow）对接说明

本文档描述当前“任务 / 商品”与资金流动的托管式流程：发布（或下单）后先进入广场/订单；对方完成后回到发起方确认；**只有确认后才发生资金流动**。

> 前端已移除 `prompt/confirm/alert`，改为站内面板（桌面/移动保持现有设计风格）。

## 1. 任务（Task）状态机

### 状态
- `open`：已发布，等待接单
- `in_progress`：已接单，进行中
- `submitted`：接单者已提交，等待发布者确认
- `completed`：发布者确认完成（此刻才发放奖励、生成交易记录）
- `cancelled`：已取消/已删除（不会从数据库硬删除）

### 接口
- `POST /api/task/create`（发布任务，签名）
  - Body：`{ title, description, rewardAmount, contactInfo?, timestamp, nonce }`
- `POST /api/task/accept`（接单，签名）
  - Body：`{ taskId, timestamp, nonce }`
- `POST /api/task/complete`（两阶段，签名）
  - 接单者提交：`{ taskId, action: "submit", timestamp, nonce }`（`in_progress -> submitted`）
  - 发布者确认：`{ taskId, action: "confirm", timestamp, nonce }`（`submitted -> completed`，并写入 `transactions` + 给接单者加余额）
  - 接单者取消：`{ taskId, action: "cancel", timestamp, nonce }`（清除接单者，`in_progress/submitted -> open`）
  - 发布者打回：`{ taskId, action: "reject", timestamp, nonce }`（清除接单者，`in_progress/submitted -> open`）
  - 发布者删除：`{ taskId, action: "delete", timestamp, nonce }`（仅 `open` 可删除，悬赏退回，`open -> cancelled`）
- `GET /api/task/list`（广场/我的任务列表）
  - Query：`status=open|in_progress|submitted|completed|all`、`page`、`limit`
  - 额外筛选：`creatorUserHash`、`acceptorUserHash`
  - 可选签名鉴权：带 `X-User-Hash/X-Signature/X-Timestamp/X-Nonce` 且验签通过时，才可能返回敏感字段 `contactInfo`

### 联系方式（contactInfo）可见性
- 广场（未签名）不返回 `contactInfo`
- 只有以下场景可见：
  - 发布者自己查看自己的任务
  - 接单者查看已接单的任务（任务状态不为 `open`）
- 当任务被取消/打回后，会清除接单者，`contactInfo` 将不再对原接单者可见（符合“打回记录消失”）

## 2. 商品订单（Purchase）托管状态机

### 状态
- `pending`：买家下单托管（已扣买家余额、预占库存；交易记录为 `pending`）
- `accepted`：卖家接单
- `delivered`：卖家标记已交付
- `completed`：买家确认（此刻才给卖家加余额；交易记录改为 `completed`）
> 已购买商品不支持取消：取消入口已移除，后端也不再接受 `buyer_cancel`。

### 接口
- `POST /api/product/create`（发布商品，签名）
- 额外字段：`deliveryInfo?`（发货/取货信息，仅订单双方可见）
- `POST /api/product/purchase`（复用一个入口做订单动作，签名）
  - 创建订单（默认动作）：`{ productId, quantity, timestamp, nonce }`
  - 卖家接单：`{ action: "seller_accept", purchaseId, timestamp, nonce }`
  - 卖家交付：`{ action: "seller_deliver", purchaseId, timestamp, nonce }`
  - 买家确认：`{ action: "buyer_confirm", purchaseId, timestamp, nonce }`
- `GET /api/product/purchase?action=list`（订单列表，签名）
  - Query：`role=buyer|seller`、`status=all|pending|accepted|delivered|completed|cancelled`、`page`、`limit`

### 发货信息（deliveryInfo）可见性
- 商品广场列表不返回 `deliveryInfo`
- 订单列表/订单详情（仅买家/卖家可访问）会返回 `deliveryInfo`，可反复查看

## 3. 签名说明（前端对接要点）
- 所有需要签名的接口使用请求头：
  - `X-User-Hash`、`X-Signature`、`X-Timestamp`、`X-Nonce`
- 签名 payload 必须包含 `timestamp` 与 `nonce`（前端已按此生成签名）

## 4. 已修复的两个关键问题
- 助记词出现 “��” 异常字符：前端解码增加 `TextDecoder(..., { fatal: true })` 与 `\uFFFD` 检测；同时确保 `VITE_WORDLIST_SECRET` 与后端 `WORDLIST_SECRET` 一致。
- 三词输入框自动乱跳：改为仅在“粘贴”时解析三词；键盘输入不会再自动分发到 3 个框。
