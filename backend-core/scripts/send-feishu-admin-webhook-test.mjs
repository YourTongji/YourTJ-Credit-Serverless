import crypto from 'node:crypto'

const webhookUrl = (process.env.FEISHU_WEBHOOK_URL || '').trim()
const secret = (process.env.FEISHU_WEBHOOK_SECRET || '').trim()
const dryRun = new Set(process.argv.slice(2)).has('--dry-run')

const FEISHU_CARD_LOGO_IMG_KEY = 'img_v3_02u9_4ca7644a-997d-4963-9d6a-30043ca697eg'

function signFeishu(timestampSec, secretValue) {
  const stringToSign = `${timestampSec}\n${secretValue}`
  return crypto.createHmac('sha256', stringToSign).update('').digest('base64')
}

if (!webhookUrl && !dryRun) {
  console.error('Missing FEISHU_WEBHOOK_URL (or run with --dry-run)')
  process.exit(1)
}

const timestamp = String(Math.floor(Date.now() / 1000))
const card = {
  msg_type: 'interactive',
  card: {
    schema: '2.0',
    config: {
      update_multi: true,
      enable_forward: true,
      width_mode: 'fill',
      summary: { content: 'YOURTJ Credit Webhook 测试' },
    },
    header: {
      template: 'wathet',
      icon: { tag: 'custom_icon', img_key: FEISHU_CARD_LOGO_IMG_KEY },
      title: { tag: 'plain_text', content: 'YOURTJ Credit Webhook 测试' },
      subtitle: { tag: 'plain_text', content: '这是一条来自管理后台的测试消息' },
      padding: '12px 12px 12px 12px',
    },
    body: {
      direction: 'vertical',
      padding: '12px 12px 12px 12px',
      horizontal_spacing: '8px',
      vertical_spacing: '8px',
      horizontal_align: 'left',
      vertical_align: 'top',
      elements: [
        { tag: 'markdown', content: `**发送时间**\n${new Date().toLocaleString('zh-CN')}`, text_align: 'left' },
        { tag: 'markdown', content: '**来源**\n管理后台 /api/admin/webhook/test', text_align: 'left' },
        { tag: 'hr' },
        {
          tag: 'button',
          type: 'primary',
          text: { tag: 'plain_text', content: '打开管理后台' },
          url: 'https://credit.yourtj.de/#/admin',
        },
      ],
    },
  },
}

if (secret) {
  card.timestamp = timestamp
  card.sign = signFeishu(timestamp, secret)
}

if (dryRun) {
  process.stdout.write(`${JSON.stringify(card, null, 2)}\n`)
  process.exit(0)
}

const res = await fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(card),
})

const text = await res.text().catch(() => '')
console.log(`HTTP ${res.status}`)
console.log(text.slice(0, 500))

if (!res.ok) process.exit(1)

