/* eslint-disable no-console */
/**
 * Smoke test for backend APIs with a real LibSQL database.
 *
 * Prerequisites:
 * - backend is running locally (vercel dev) on http://127.0.0.1:3001
 *
 * Usage:
 *  node scripts/smoke-test.js
 */

const crypto = require('crypto');

const BASE = process.env.API_BASE || 'http://127.0.0.1:3001';

function randHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function normalizePayload(payload) {
  const sortedKeys = Object.keys(payload).sort();
  const normalized = {};
  for (const k of sortedKeys) normalized[k] = payload[k];
  return normalized;
}

function signHmac(payload, userSecret) {
  const normalized = normalizePayload(payload);
  const data = JSON.stringify(normalized);
  return crypto.createHmac('sha256', Buffer.from(String(userSecret), 'utf8')).update(data).digest('hex');
}

function createSignedRequest(payload, userHash, userSecret) {
  const timestamp = Date.now();
  const nonce = `${Date.now().toString(36)}-${randHex(16)}`;
  const fullPayload = { ...payload, timestamp, nonce };
  const signature = signHmac(fullPayload, userSecret);
  return {
    payload: fullPayload,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Hash': userHash,
      'X-Signature': signature,
      'X-Timestamp': String(timestamp),
      'X-Nonce': nonce
    }
  };
}

async function requestJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = json.error || `HTTP ${res.status}`;
    throw new Error(`${options.method || 'GET'} ${path} failed: ${msg}`);
  }
  return json.data;
}

async function main() {
  const walletA = {
    userHash: randHex(32),
    userSecret: `secret-${randHex(16)}`
  };
  const walletB = {
    userHash: randHex(32),
    userSecret: `secret-${randHex(16)}`
  };

  console.log('Register wallets...');
  await requestJson('/api/wallet/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userHash: walletA.userHash, userSecret: walletA.userSecret })
  });
  await requestJson('/api/wallet/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userHash: walletB.userHash, userSecret: walletB.userSecret })
  });

  console.log('Mint system reward to walletA...');
  await requestJson('/api/transaction/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'system_reward',
      toUserHash: walletA.userHash,
      amount: 500,
      title: '测试入账',
      description: 'smoke test'
    })
  });

  console.log('Transfer 50 from A -> B...');
  {
    const { payload, headers } = createSignedRequest(
      { toUserHash: walletB.userHash, amount: 50, title: '测试转账', description: 'smoke test' },
      walletA.userHash,
      walletA.userSecret
    );
    await requestJson('/api/transaction/transfer', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Create a task by A (reward 100)...');
  let task;
  {
    const { payload, headers } = createSignedRequest(
      { title: '测试任务', description: '请帮忙处理一个小问题', rewardAmount: 100 },
      walletA.userHash,
      walletA.userSecret
    );
    task = await requestJson('/api/task/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Accept task by B...');
  {
    const { payload, headers } = createSignedRequest(
      { taskId: task.taskId },
      walletB.userHash,
      walletB.userSecret
    );
    await requestJson('/api/task/accept', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Complete task by A...');
  {
    const { payload, headers } = createSignedRequest(
      { taskId: task.taskId },
      walletA.userHash,
      walletA.userSecret
    );
    await requestJson('/api/task/complete', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Create a product by B...');
  let product;
  {
    const { payload, headers } = createSignedRequest(
      { title: '测试商品', description: '一份小礼物', price: 30, stock: 2 },
      walletB.userHash,
      walletB.userSecret
    );
    product = await requestJson('/api/product/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Purchase product by A (quantity 1)...');
  let purchase;
  {
    const { payload, headers } = createSignedRequest(
      { productId: product.productId, quantity: 1 },
      walletA.userHash,
      walletA.userSecret
    );
    purchase = await requestJson('/api/product/purchase', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Create report by A for purchase tx...');
  let report;
  {
    const { payload, headers } = createSignedRequest(
      { txId: purchase.txId, type: 'report', reason: '测试举报', description: 'smoke test' },
      walletA.userHash,
      walletA.userSecret
    );
    report = await requestJson('/api/report/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Get balances...');
  const balA = await requestJson(`/api/wallet/${walletA.userHash}/balance`);
  const balB = await requestJson(`/api/wallet/${walletB.userHash}/balance`);

  console.log('Get history...');
  const historyA = await requestJson(`/api/transaction/history/${walletA.userHash}?page=1&limit=50`);
  const historyB = await requestJson(`/api/transaction/history/${walletB.userHash}?page=1&limit=50`);

  console.log('Wordlist token & wordlist...');
  const tokenResp = await requestJson('/api/wordlist/token', { method: 'POST' });
  const wl = await requestJson(`/api/wordlist?timestamp=${tokenResp.timestamp}&token=${tokenResp.token}`);

  console.log('OK:', {
    walletA: { userHash: walletA.userHash, balance: balA.balance },
    walletB: { userHash: walletB.userHash, balance: balB.balance },
    taskId: task.taskId,
    productId: product.productId,
    purchaseId: purchase.purchaseId,
    reportId: report.reportId,
    historyA: historyA.total,
    historyB: historyB.total,
    wordlistChecksum: wl.checksum,
    wordlistSizeObfuscated: String(wl.wordlist).length
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

