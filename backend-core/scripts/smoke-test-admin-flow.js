/* eslint-disable no-console */
/**
 * End-to-end smoke test for:
 * - core wallet/tx APIs
 * - market task/product/report APIs
 * - core admin aggregated APIs (reports handling, recovery, redeem codes)
 * - user redeem flow
 *
 * Run with local servers:
 *   # Build first:
 *   #   (cd backend-core && npm i && npx tsc)
 *   #   (cd backend-market && npm i && npx tsc)
 *   #
 *   # Start servers:
 *   #   node backend-core/scripts/local-api-server.js   (PORT=3001)
 *   #   node backend-market/scripts/local-api-server.js (PORT=3002)
 *   #
 *   # Then:
 *   CORE_BASE=http://127.0.0.1:3001 MARKET_BASE=http://127.0.0.1:3002 node scripts/smoke-test-admin-flow.js
 */

const crypto = require('crypto');

const CORE_BASE = process.env.CORE_BASE || 'http://127.0.0.1:3001';
const MARKET_BASE = process.env.MARKET_BASE || 'http://127.0.0.1:3002';

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
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = json.error || `HTTP ${res.status}`;
    throw new Error(`${options.method || 'GET'} ${url} failed: ${msg}`);
  }
  return json.data;
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
      title: 'smoke: mint',
      description: 'smoke admin flow'
    })
  });

  console.log('Transfer 50 from A -> B (core, signed)...');
  {
    const { payload, headers } = createSignedRequest(
      { toUserHash: walletB.userHash, amount: 50, title: 'smoke: transfer', description: 'smoke admin flow' },
      walletA.userHash,
      walletA.userSecret
    );
    await requestJson(CORE_BASE, '/api/transaction/transfer', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Create product by B (market, signed)...');
  let product;
  {
    const { payload, headers } = createSignedRequest(
      {
        title: 'smoke product',
        description: 'smoke product description',
        deliveryInfo: 'delivery: dm',
        price: 30,
        stock: 10
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

  console.log('Buy product by A (market, signed)...');
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

  console.log('Seller deliver by B (market, signed)...');
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

  console.log('Seller deliver by B (market, signed)...');
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

  console.log('Buyer confirm by A (market, signed)...');
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

  console.log('Create transaction report by A (market, signed)...');
  let txReport;
  {
    const { payload, headers } = createSignedRequest(
      { txId: purchase.txId, type: 'report', reason: 'smoke tx report', description: 'smoke admin flow' },
      walletA.userHash,
      walletA.userSecret
    );
    txReport = await requestJson(MARKET_BASE, '/api/report/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Create content report for product by A (market, signed)...');
  let contentReport;
  {
    const { payload, headers } = createSignedRequest(
      {
        targetType: 'product',
        targetId: product.productId,
        type: 'report',
        reason: 'smoke content report',
        description: 'smoke admin flow'
      },
      walletA.userHash,
      walletA.userSecret
    );
    contentReport = await requestJson(MARKET_BASE, '/api/report/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Admin login (core)...');
  const adminAuth = await requestJson(CORE_BASE, '/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin' })
  });
  const adminToken = adminAuth.token;
  if (!adminToken) throw new Error('Admin token missing');

  console.log('Admin list reports (core)...');
  const txReports = await requestJson(CORE_BASE, '/api/admin/reports?kind=transaction&status=pending&page=1&limit=50', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const contentReports = await requestJson(CORE_BASE, '/api/admin/reports?kind=content&status=pending&page=1&limit=50', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  if (!(txReports.data || []).some((r) => r.report_id === txReport.reportId)) {
    throw new Error('Transaction report missing in admin list');
  }
  if (!(contentReports.data || []).some((r) => r.report_id === contentReport.reportId)) {
    throw new Error('Content report missing in admin list');
  }

  console.log('Admin handle content report: take down product (core)...');
  await requestJson(CORE_BASE, '/api/admin/reports/handle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ kind: 'content', reportId: contentReport.reportId, action: 'take_down', adminNote: 'smoke' })
  });

  console.log('Verify product is removed from available list (market)...');
  {
    const list = await requestJson(MARKET_BASE, '/api/product/list?status=available&page=1&limit=50');
    if ((list.data || []).some((p) => p.productId === product.productId)) {
      throw new Error('Removed product still appears in available list');
    }
  }

  console.log('Admin handle transaction report: compensate victim, create recovery case (core)...');
  const comp = await requestJson(CORE_BASE, '/api/admin/reports/handle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      kind: 'transaction',
      reportId: txReport.reportId,
      action: 'compensate',
      victimUserHash: walletA.userHash,
      offenderUserHash: walletB.userHash,
      amount: 20,
      adminNote: 'smoke compensate'
    })
  });
  if (!comp.caseId) throw new Error('caseId missing after compensate');

  console.log('Admin list recovery cases (core)...');
  const recovery = await requestJson(CORE_BASE, '/api/admin/recovery?status=open', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!(recovery || []).some((c) => c.case_id === comp.caseId)) {
    throw new Error('Recovery case missing in list');
  }

  console.log('Execute recovery: deduct offender (core)...');
  await requestJson(CORE_BASE, '/api/admin/recovery/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ caseId: comp.caseId })
  });

  console.log('Create redeem code (core)...');
  const redeemCode = `SMOKE-${randHex(4).toUpperCase()}`;
  await requestJson(CORE_BASE, '/api/admin/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ code: redeemCode, title: 'smoke redeem', value: 7, maxUses: 1 })
  });

  console.log('User redeem (core, signed)...');
  let redemption;
  {
    const { payload, headers } = createSignedRequest({ code: redeemCode }, walletA.userHash, walletA.userSecret);
    redemption = await requestJson(CORE_BASE, '/api/redeem', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  console.log('Verify redeem prevents double-spend (core, signed)...');
  {
    const { payload, headers } = createSignedRequest({ code: redeemCode }, walletA.userHash, walletA.userSecret);
    let ok = false;
    try {
      await requestJson(CORE_BASE, '/api/redeem', { method: 'POST', headers, body: JSON.stringify(payload) });
    } catch {
      ok = true;
    }
    if (!ok) throw new Error('Redeem double-spend not blocked');
  }

  console.log('Get balances (core)...');
  const balA = await requestJson(CORE_BASE, `/api/wallet/${walletA.userHash}/balance`);
  const balB = await requestJson(CORE_BASE, `/api/wallet/${walletB.userHash}/balance`);

  console.log('Get admin user info (core)...');
  const adminUser = await requestJson(CORE_BASE, `/api/admin/user?userHash=${walletA.userHash}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (adminUser.wallet.user_hash !== walletA.userHash) throw new Error('Admin user query mismatch');

  console.log('OK:', {
    coreBase: CORE_BASE,
    marketBase: MARKET_BASE,
    walletA: { userHash: walletA.userHash, balance: balA.balance },
    walletB: { userHash: walletB.userHash, balance: balB.balance },
    productId: product.productId,
    purchaseId: purchase.purchaseId,
    txId: purchase.txId,
    txReportId: txReport.reportId,
    contentReportId: contentReport.reportId,
    recoveryCaseId: comp.caseId,
    redeemTxId: redemption.txId
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
