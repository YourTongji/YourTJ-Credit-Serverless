## 飞书机器人通知（管理审批）

当有新的交易申诉/举报、任务/商品举报提交时，后端会尝试通过飞书自定义机器人 Webhook 推送一条“新审批”通知，并提供一个按钮可直接跳转到管理后台定位该记录：`/#/admin?tab=...&reportId=...`。

### 配置方式（推荐：管理后台热更新）

在管理后台 `/#/admin` → `设置` 中可直接配置：

- Webhook 地址
- Webhook 签名密钥（可选）

配置会写入数据库 `settings` 表，保存后立即生效；`backend-market` 发送通知时会优先读取该配置。

### 环境变量（fallback）

- `FEISHU_WEBHOOK_URL`：飞书机器人 Webhook 地址（形如 `https://open.feishu.cn/open-apis/bot/v2/hook/...`）
- `FEISHU_WEBHOOK_SECRET`：飞书机器人签名密钥（如未开启签名，可不填）
- `PUBLIC_FRONTEND_URL`（可选）：前端访问地址（默认回退到 `https://yourtj-credit-frontend.vercel.app`，或使用请求 `Origin`）

### 行为说明

- 未配置 `FEISHU_WEBHOOK_URL` 时：通知功能自动关闭，不影响举报创建。
- 配置了 `FEISHU_WEBHOOK_SECRET` 时：请求体会携带 `timestamp` 与 `sign`，签名算法按 `Webhook.md`：
  - `stringToSign = timestamp + "\\n" + secret`
  - `sign = Base64(HmacSHA256(key=stringToSign, msg=""))`
