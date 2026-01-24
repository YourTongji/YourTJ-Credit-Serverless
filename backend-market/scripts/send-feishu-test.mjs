import crypto from 'node:crypto'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run') || args.has('--print')
const kindArg = Array.from(args).find((a) => a.startsWith('--kind='))
const kind = kindArg ? String(kindArg.split('=')[1] || '').trim() : 'both'

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
      tag: 'button',
      type: 'primary',
      text: { tag: 'plain_text', content: '进入后台审核' },
      url: adminUrl,
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
const contentPayload = buildCard({
  title: '内容举报（测试卡片）',
  adminUrl: 'https://credit.yourtj.de/#/admin?tab=contentReports&reportId=TEST',
  fields: [
    cardField('举报编号', `RPT-TEST-${now.getTime()}`, { short: true, style: 'code' }),
    cardField('对象类型', 'task', { short: true, style: 'code' }),
    cardField('举报类型', 'report', { short: true, style: 'code' }),
    cardField('当前状态', 'pending', { short: true, style: 'code' }),
    cardField('对象编号', 'TASK-TEST-001', { short: true, style: 'code' }),
    cardField('发布者', '15ab2799...1826b7', { short: true, style: 'code' }),
    cardField('举报人', '72b4ba68...4cbb1e', { short: true, style: 'code' }),
    cardField('标题', '收二手书', { short: false, style: 'text' }),
    cardField('内容描述', 'rt', { short: false, style: 'text' }),
    cardField('理由', '不让收', { short: false, style: 'text' }),
    cardField('描述', '不让你收', { short: false, style: 'text' }),
  ],
})

const txPayload = buildCard({
  title: '交易举报（测试卡片）',
  adminUrl: 'https://credit.yourtj.de/#/admin?tab=txReports&reportId=TEST',
  fields: [
    cardField('举报编号', `RPT-TX-${now.getTime()}`, { short: true, style: 'code' }),
    cardField('交易编号', `TX-${now.getTime()}`, { short: true, style: 'code' }),
    cardField('举报类型', 'report', { short: true, style: 'code' }),
    cardField('当前状态', 'pending', { short: true, style: 'code' }),
    cardField('付款方(from)', '75f9a7a7...e81372', { short: true, style: 'code' }),
    cardField('收款方(to)', '1776d490...f6cb9f', { short: true, style: 'code' }),
    cardField('金额', '30', { short: true, style: 'code' }),
    cardField('理由', 'smoke tx report', { short: false, style: 'text' }),
    cardField('描述', 'smoke admin flow', { short: false, style: 'text' }),
  ],
})

function attachSign(payload) {
  if (!secret) return payload
  const timestamp = String(Math.floor(Date.now() / 1000))
  payload.timestamp = timestamp
  payload.sign = signFeishu(timestamp, secret)
  return payload
}

if (dryRun) {
  const out = kind === 'transaction' ? txPayload : kind === 'content' ? contentPayload : { content: contentPayload, transaction: txPayload }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
  process.exit(0)
}

if (!webhookUrl) {
  console.error('Missing FEISHU_WEBHOOK_URL (or run with --dry-run)')
  process.exit(1)
}

async function send(payload) {
  const finalPayload = attachSign(payload)
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(finalPayload),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    console.error(`Feishu webhook failed: HTTP ${res.status}`)
    console.error(text.slice(0, 500))
    process.exit(1)
  }
  console.log(`Sent. HTTP ${res.status}`)
  console.log(text.slice(0, 500))
}

if (kind === 'transaction') {
  await send(txPayload)
} else if (kind === 'content') {
  await send(contentPayload)
} else {
  await send(contentPayload)
  await send(txPayload)
}
