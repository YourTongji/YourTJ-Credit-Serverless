/* eslint-disable no-console */
/**
 * Smoke test for split backend deployment (core + market) with a real LibSQL database.
 *
 * Usage:
 *  API_CORE_BASE=https://yourtj-credit-backend-core.vercel.app \
 *  API_MARKET_BASE=https://yourtj-credit-backend-market.vercel.app \
 *  ADMIN_SECRET=... \
 *  node scripts/smoke-test-split.js
 */

const crypto = require('crypto');

const CORE_BASE = process.env.API_CORE_BASE || 'https://yourtj-credit-backend-core.vercel.app';
const MARKET_BASE = process.env.API_MARKET_BASE || 'https://yourtj-credit-backend-market.vercel.app';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

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

async function requestJson(base, path, options = {}) {
  const url = `${base}${path}`;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);
      const json = await res.json().catch(() => ({}));

      // Retry transient server errors / throttling
      if (!res.ok && (res.status >= 500 || res.status === 429) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }

      if (!res.ok || json.success === false) {
        const msg = json.error || `HTTP ${res.status}`;
        throw new Error(`${options.method || 'GET'} ${url} failed: ${msg}`);
      }
      return json.data;
    } catch (err) {
      const isLast = attempt >= maxAttempts;
      // Retry network errors (fetch failed, ECONNRESET, etc.)
      if (!isLast) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`${options.method || 'GET'} ${url} failed: unexpected retry exhaustion`);
}

async function main() {
  const walletA = { userHash: randHex(32), userSecret: `secret-${randHex(16)}` };
  const walletB = { userHash: randHex(32), userSecret: `secret-${randHex(16)}` };

  console.log('Register wallets (core)...');
  await requestJson(CORE_BASE, '/api/wallet/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userHash: walletA.userHash, userSecret: walletA.userSecret })
  });
  await requestJson(CORE_BASE, '/api/wallet/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userHash: walletB.userHash, userSecret: walletB.userSecret })
  });

  console.log('Mint system reward to walletA (core)...');
  await requestJson(CORE_BASE, '/api/transaction/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'system_reward',
      toUserHash: walletA.userHash,
      amount: 500,
      title: '测试入账',
      description: 'smoke split'
    })
  });

  console.log('Transfer 50 from A -> B (core, signed)...');
  {
    const { payload, headers } = createSignedRequest(
      { toUserHash: walletB.userHash, amount: 50, title: '测试转账', description: 'smoke split' },
      walletA.userHash,
      walletA.userSecret
    );
    await requestJson(CORE_BASE, '/api/transaction/transfer', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Create task by A (market, signed, with contactInfo)...');
  let task;
  {
    const { payload, headers } = createSignedRequest(
      {
        title: '测试任务',
        description: '请帮忙处理一个小问题',
        rewardAmount: 100,
        contactInfo: '微信：test_wechat（平台备注：微信）'
      },
      walletA.userHash,
      walletA.userSecret
    );
    task = await requestJson(MARKET_BASE, '/api/task/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Verify contactInfo not leaked in public list (market)...');
  {
    const publicList = await requestJson(MARKET_BASE, `/api/task/list?status=all&page=1&limit=50`);
    const found = (publicList.data || []).find((t) => t.taskId === task.taskId);
    if (!found) throw new Error('Public list did not include the created task');
    if (found.contactInfo) throw new Error('contactInfo leaked in public task list');
  }

  console.log('Accept task by B (market, signed)...');
  {
    const { payload, headers } = createSignedRequest(
      { taskId: task.taskId },
      walletB.userHash,
      walletB.userSecret
    );
    await requestJson(MARKET_BASE, '/api/task/accept', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Verify acceptor can see contactInfo after accept (market, signed list)...');
  {
    const listPayload = { status: 'all', page: 1, limit: 50, acceptorUserHash: walletB.userHash };
    const { headers } = createSignedRequest(listPayload, walletB.userHash, walletB.userSecret);
    const acceptedList = await requestJson(
      MARKET_BASE,
      `/api/task/list?status=all&page=1&limit=50&acceptorUserHash=${walletB.userHash}`,
      { headers }
    );
    const found = (acceptedList.data || []).find((t) => t.taskId === task.taskId);
    if (!found) throw new Error('Acceptor list did not include the accepted task');
    if (!found.contactInfo) throw new Error('contactInfo missing for acceptor after accept');
  }

  console.log('Create another task then cancel by acceptor (market)...');
  let taskToCancel;
  {
    const { payload, headers } = createSignedRequest(
      {
        title: '测试任务-取消',
        description: '用于测试取消接单',
        rewardAmount: 10,
        contactInfo: 'QQ：123456（平台备注：QQ）'
      },
      walletA.userHash,
      walletA.userSecret
    );
    taskToCancel = await requestJson(MARKET_BASE, '/api/task/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }
  {
    const { payload, headers } = createSignedRequest(
      { taskId: taskToCancel.taskId },
      walletB.userHash,
      walletB.userSecret
    );
    await requestJson(MARKET_BASE, '/api/task/accept', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }
  {
    const { payload, headers } = createSignedRequest(
      { taskId: taskToCancel.taskId, action: 'cancel' },
      walletB.userHash,
      walletB.userSecret
    );
    await requestJson(MARKET_BASE, '/api/task/complete', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }
  {
    const listPayload = { status: 'all', page: 1, limit: 50, acceptorUserHash: walletB.userHash };
    const { headers } = createSignedRequest(listPayload, walletB.userHash, walletB.userSecret);
    const acceptedList = await requestJson(
      MARKET_BASE,
      `/api/task/list?status=all&page=1&limit=50&acceptorUserHash=${walletB.userHash}`,
      { headers }
    );
    const found = (acceptedList.data || []).find((t) => t.taskId === taskToCancel.taskId);
    if (found) throw new Error('Canceled task still visible in acceptor list');
  }

  console.log('Create another task then reject by creator (market)...');
  let taskToReject;
  {
    const { payload, headers } = createSignedRequest(
      {
        title: '测试任务-打回',
        description: '用于测试打回（清除接单记录）',
        rewardAmount: 10,
        contactInfo: '邮箱：test@example.com（平台备注：邮箱）'
      },
      walletA.userHash,
      walletA.userSecret
    );
    taskToReject = await requestJson(MARKET_BASE, '/api/task/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }
  {
    const { payload, headers } = createSignedRequest(
      { taskId: taskToReject.taskId },
      walletB.userHash,
      walletB.userSecret
    );
    await requestJson(MARKET_BASE, '/api/task/accept', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }
  {
    const { payload, headers } = createSignedRequest(
      { taskId: taskToReject.taskId, action: 'reject' },
      walletA.userHash,
      walletA.userSecret
    );
    await requestJson(MARKET_BASE, '/api/task/complete', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }
  {
    const listPayload = { status: 'all', page: 1, limit: 50, acceptorUserHash: walletB.userHash };
    const { headers } = createSignedRequest(listPayload, walletB.userHash, walletB.userSecret);
    const acceptedList = await requestJson(
      MARKET_BASE,
      `/api/task/list?status=all&page=1&limit=50&acceptorUserHash=${walletB.userHash}`,
      { headers }
    );
    const found = (acceptedList.data || []).find((t) => t.taskId === taskToReject.taskId);
    if (found) throw new Error('Rejected task still visible in acceptor list');
  }

  console.log('Submit task by B (market, signed)...');
  {
    const { payload, headers } = createSignedRequest(
      { taskId: task.taskId, action: 'submit' },
      walletB.userHash,
      walletB.userSecret
    );
    await requestJson(MARKET_BASE, '/api/task/complete', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Confirm task by A (market, signed)...');
  {
    const { payload, headers } = createSignedRequest(
      { taskId: task.taskId, action: 'confirm' },
      walletA.userHash,
      walletA.userSecret
    );
    await requestJson(MARKET_BASE, '/api/task/complete', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Create a product by B (market, signed)...');
  let product;
  {
    const { payload, headers } = createSignedRequest(
      {
        title: '测试商品',
        description: '一份小礼物',
        price: 30,
        stock: 2,
        deliveryInfo: '网盘：example.com（平台备注：网盘），或线下自取：图书馆门口'
      },
      walletB.userHash,
      walletB.userSecret
    );
    product = await requestJson(MARKET_BASE, '/api/product/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Verify deliveryInfo not leaked in product list (market)...');
  {
    const publicList = await requestJson(MARKET_BASE, `/api/product/list?status=available&page=1&limit=50`);
    const found = (publicList.data || []).find((p) => p.productId === product.productId);
    if (!found) throw new Error('Public product list did not include the created product');
    if (found.deliveryInfo) throw new Error('deliveryInfo leaked in public product list');
  }

  console.log('Create order (escrow) by A (market, signed)...');
  let purchase;
  {
    const { payload, headers } = createSignedRequest(
      { productId: product.productId, quantity: 1 },
      walletA.userHash,
      walletA.userSecret
    );
    purchase = await requestJson(MARKET_BASE, '/api/product/purchase', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Verify buyer_cancel is rejected (market)...');
  {
    const { payload, headers } = createSignedRequest(
      { action: 'buyer_cancel', purchaseId: purchase.purchaseId },
      walletA.userHash,
      walletA.userSecret
    );
    try {
      await requestJson(MARKET_BASE, '/api/product/purchase', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      throw new Error('buyer_cancel unexpectedly succeeded');
    } catch (err) {
      // expected
    }
  }

  console.log('Seller accept order by B (market, signed)...');
  {
    const { payload, headers } = createSignedRequest(
      { action: 'seller_accept', purchaseId: purchase.purchaseId },
      walletB.userHash,
      walletB.userSecret
    );
    purchase = await requestJson(MARKET_BASE, '/api/product/purchase', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Verify purchase list contains deliveryInfo for buyer/seller (market, signed)...');
  {
    const listPayloadBuyer = { action: 'list', role: 'buyer', status: 'all', page: 1, limit: 50 };
    const { headers: buyerHeaders } = createSignedRequest(listPayloadBuyer, walletA.userHash, walletA.userSecret);
    const buyerList = await requestJson(
      MARKET_BASE,
      `/api/product/purchase?action=list&role=buyer&status=all&page=1&limit=50`,
      { headers: buyerHeaders }
    );
    const foundBuyer = (buyerList.data || []).find((p) => p.purchaseId === purchase.purchaseId);
    if (!foundBuyer) throw new Error('Buyer purchase list missing purchase');
    if (!foundBuyer.deliveryInfo) throw new Error('deliveryInfo missing in buyer purchase list');

    const listPayloadSeller = { action: 'list', role: 'seller', status: 'all', page: 1, limit: 50 };
    const { headers: sellerHeaders } = createSignedRequest(listPayloadSeller, walletB.userHash, walletB.userSecret);
    const sellerList = await requestJson(
      MARKET_BASE,
      `/api/product/purchase?action=list&role=seller&status=all&page=1&limit=50`,
      { headers: sellerHeaders }
    );
    const foundSeller = (sellerList.data || []).find((p) => p.purchaseId === purchase.purchaseId);
    if (!foundSeller) throw new Error('Seller purchase list missing purchase');
    if (!foundSeller.deliveryInfo) throw new Error('deliveryInfo missing in seller purchase list');
  }

  console.log('Seller mark delivered by B (market, signed)...');
  {
    const { payload, headers } = createSignedRequest(
      { action: 'seller_deliver', purchaseId: purchase.purchaseId },
      walletB.userHash,
      walletB.userSecret
    );
    purchase = await requestJson(MARKET_BASE, '/api/product/purchase', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Buyer confirm order by A (market, signed)...');
  {
    const { payload, headers } = createSignedRequest(
      { action: 'buyer_confirm', purchaseId: purchase.purchaseId },
      walletA.userHash,
      walletA.userSecret
    );
    purchase = await requestJson(MARKET_BASE, '/api/product/purchase', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Create report by A for purchase tx (market, signed)...');
  let report;
  {
    const { payload, headers } = createSignedRequest(
      { txId: purchase.txId, type: 'report', reason: '测试举报', description: 'smoke split' },
      walletA.userHash,
      walletA.userSecret
    );
    report = await requestJson(MARKET_BASE, '/api/report/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Verify tx exists (core)...');
  await requestJson(CORE_BASE, `/api/transaction/${purchase.txId}`);

  console.log('Get balances (core)...');
  const balA = await requestJson(CORE_BASE, `/api/wallet/${walletA.userHash}/balance`);
  const balB = await requestJson(CORE_BASE, `/api/wallet/${walletB.userHash}/balance`);

  console.log('Get history (core)...');
  const historyA = await requestJson(CORE_BASE, `/api/transaction/history/${walletA.userHash}?page=1&limit=50`);
  const historyB = await requestJson(CORE_BASE, `/api/transaction/history/${walletB.userHash}?page=1&limit=50`);

  console.log('List tasks/products/reports (market)...');
  await requestJson(MARKET_BASE, `/api/task/list?status=all&page=1&limit=10`);
  await requestJson(MARKET_BASE, `/api/product/list?status=all&page=1&limit=10`);
  await requestJson(MARKET_BASE, `/api/report/list?status=all&page=1&limit=10`);

  if (ADMIN_SECRET) {
    console.log('Admin stats & handle report (market)...');
    await requestJson(MARKET_BASE, '/api/admin/stats', {
      headers: { 'X-Admin-Token': ADMIN_SECRET }
    });
    await requestJson(MARKET_BASE, '/api/admin/report/handle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_SECRET },
      body: JSON.stringify({ reportId: report.reportId, action: 'resolved', adminNote: 'smoke split' })
    });
  } else {
    console.log('Skip admin endpoints (ADMIN_SECRET not set).');
  }

  console.log('Wordlist token & wordlist (core)...');
  const tokenResp = await requestJson(CORE_BASE, '/api/wordlist/token', { method: 'POST' });
  const wl = await requestJson(CORE_BASE, `/api/wordlist?timestamp=${tokenResp.timestamp}&token=${tokenResp.token}`);

  console.log('OK:', {
    coreBase: CORE_BASE,
    marketBase: MARKET_BASE,
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
