import crypto from 'node:crypto'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run') || args.has('--print')

const webhookUrl = (process.env.FEISHU_WEBHOOK_URL || '').trim()
const secret = (process.env.FEISHU_WEBHOOK_SECRET || '').trim()

const FEISHU_CARD_LOGO_IMG_KEY = 'img_v3_02u9_4ca7644a-997d-4963-9d6a-30043ca697eg'

function signFeishu(timestampSec, secretValue) {
  const stringToSign = `${timestampSec}\n${secretValue}`
  return crypto.createHmac('sha256', stringToSign).update('').digest('base64')
}

function cardField(label, value, { short = false, style = 'code' } = {}) {
  const raw = String(value ?? '').trim() || '—'
  const content = style === 'code' ? `**${label}**\n\`${raw}\`` : `**${label}**\n${raw}`
  return { short, content }
}

function buildCard({ title, fields, adminUrl }) {
  const shortBlocks = fields.filter((f) => f.short)
  const longBlocks = fields.filter((f) => !f.short)

  const shortRows = []
  for (let i = 0; i < shortBlocks.length; i += 2) {
    const left = shortBlocks[i]
    const right = shortBlocks[i + 1]
    shortRows.push({
      tag: 'column_set',
      horizontal_spacing: '8px',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          elements: [{ tag: 'markdown', content: left.content, text_align: 'left' }],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          elements: right ? [{ tag: 'markdown', content: right.content, text_align: 'left' }] : [],
        },
      ],
    })
  }

  const bodyElements = [
    {
      tag: 'markdown',
      content: `**有新的审核：${title}**\n请在管理后台处理该条记录。`,
      text_align: 'left',
    },
    { tag: 'hr' },
    ...shortRows,
    ...(longBlocks.length ? [{ tag: 'hr', margin: '4px 0px 0px 0px' }] : []),
    ...longBlocks.map((f) => ({
      tag: 'markdown',
      content: f.content,
      text_align: 'left',
      margin: '4px 0px 0px 0px',
    })),
    { tag: 'hr' },
    {
      tag: 'action',
      actions: [
        {
          tag: 'button',
          type: 'primary',
          text: { tag: 'plain_text', content: '进入后台审核' },
          url: adminUrl,
        },
      ],
    },
  ]

  return {
    msg_type: 'interactive',
    card: {
      schema: '2.0',
      config: {
        update_multi: true,
        enable_forward: true,
        width_mode: 'fill',
        summary: { content: `新审核：${title}` },
      },
      header: {
        template: 'wathet',
        icon: { tag: 'custom_icon', img_key: FEISHU_CARD_LOGO_IMG_KEY },
        title: { tag: 'plain_text', content: 'YOURTJ Credit 新审核' },
        subtitle: { tag: 'plain_text', content: title },
        padding: '12px 12px 12px 12px',
      },
      body: {
        direction: 'vertical',
        padding: '12px 12px 12px 12px',
        horizontal_spacing: '8px',
        vertical_spacing: '8px',
        horizontal_align: 'left',
        vertical_align: 'top',
        elements: bodyElements,
      },
    },
  }
}

const now = new Date()
const payload = buildCard({
  title: '内容举报（测试卡片）',
  adminUrl: 'https://credit.yourtj.de/#/admin?tab=contentReports&reportId=TEST',
  fields: [
    cardField('举报编号', `TEST-${now.getTime()}`, { short: true, style: 'code' }),
    cardField('对象类型', 'task', { short: true, style: 'code' }),
    cardField('对象编号', 'task_123', { short: true, style: 'code' }),
    cardField('举报人', 'user_hash_xxx', { short: true, style: 'code' }),
    cardField('理由', '这是一条用于预览飞书卡片样式的测试通知。', { short: false, style: 'text' }),
  ],
})

if (secret) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  payload.timestamp = timestamp
  payload.sign = signFeishu(timestamp, secret)
}

if (dryRun) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exit(0)
}

if (!webhookUrl) {
  console.error('Missing FEISHU_WEBHOOK_URL (or run with --dry-run)')
  process.exit(1)
}

const res = await fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

const text = await res.text().catch(() => '')
if (!res.ok) {
  console.error(`Feishu webhook failed: HTTP ${res.status}`)
  console.error(text.slice(0, 500))
  process.exit(1)
}

console.log(`Sent. HTTP ${res.status}`)
console.log(text.slice(0, 500))
