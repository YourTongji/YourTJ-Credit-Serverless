/**
 * YourTJ Credit - 前端API服务
 * 封装所有API请求
 */

import type {
  Wallet,
  Transaction,
  ApiResponse,
  PaginatedResponse,
  TransactionCreateParams,
  Purchase,
  Task,
  TaskCreateParams,
  ProductCreateParams,
  Product
} from '@shared/types';

const API_CORE_BASE =
  import.meta.env.VITE_API_CORE_URL ||
  import.meta.env.VITE_API_URL ||
  '';

const API_MARKET_BASE =
  import.meta.env.VITE_API_MARKET_URL ||
  import.meta.env.VITE_API_URL ||
  '';

function normalizeBase(base: string): string {
  const trimmed = String(base || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function getBaseForPath(path: string): string {
  // Production on Vercel: always prefer same-origin `/api/*` so clients only need to reach the frontend domain.
  // This avoids cross-domain fetch issues in certain networks (e.g. `*.vercel.app` blocked) and lets `vercel.json` handle routing.
  if (import.meta.env.PROD && typeof window !== 'undefined' && path.startsWith('/api/')) {
    return '';
  }

  if (
    path.startsWith('/api/task') ||
    path.startsWith('/api/product') ||
    path.startsWith('/api/report')
  ) {
    return normalizeBase(API_MARKET_BASE);
  }
  return normalizeBase(API_CORE_BASE);
}

function buildApiUrl(path: string): string {
  const base = getBaseForPath(path);
  return base ? `${base}${path}` : path;
}

/**
 * 带超时的fetch
 */
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeout = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    // Fallback: if cross-origin fetch fails (CORS/network), retry via same-origin rewrite.
    // This is especially helpful on mobile Safari where CORS failures surface as "Failed to fetch".
    try {
      if (typeof window !== 'undefined' && /^https?:\/\//i.test(url)) {
        const u = new URL(url);
        const fallback = `${u.pathname}${u.search}`;
        if (fallback.startsWith('/api/')) {
          return await fetch(fallback, { ...options, signal: controller.signal });
        }
      }
    } catch {
      // ignore fallback failure, surface original error
    }
    throw err;
  }
}

/**
 * 处理API响应
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text().catch(() => '');
    if (contentType.includes('application/json')) {
      try {
        const parsed = JSON.parse(text || '{}') as any;
        throw new Error(parsed?.error || parsed?.message || `HTTP ${response.status}`);
      } catch {
        throw new Error(text || `HTTP ${response.status}`);
      }
    }
    const brief = text ? text.slice(0, 200) : '';
    throw new Error(brief || `HTTP ${response.status}`);
  }
  const data: ApiResponse<T> = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Request failed');
  }
  return data.data as T;
}

// ============================================
// 钱包API
// ============================================

/**
 * 注册或获取钱包
 */
export async function registerWallet(
  userHash: string,
  options?: { userSecret?: string; publicKey?: string }
): Promise<Wallet> {
  const response = await fetchWithTimeout(buildApiUrl('/api/wallet/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userHash, ...options })
  });
  return handleResponse<Wallet>(response);
}

/**
 * 获取钱包信息
 */
export async function getWallet(userHash: string): Promise<Wallet> {
  const response = await fetchWithTimeout(buildApiUrl(`/api/wallet/${userHash}`));
  return handleResponse<Wallet>(response);
}

/**
 * 获取钱包余额
 */
export async function getBalance(userHash: string): Promise<{ balance: number }> {
  const response = await fetchWithTimeout(buildApiUrl(`/api/wallet/${userHash}/balance`));
  return handleResponse<{ balance: number }>(response);
}

// ============================================
// 交易API
// ============================================

/**
 * 创建交易
 */
export async function createTransaction(
  params: TransactionCreateParams,
  headers: Record<string, string>
): Promise<Transaction> {
  const response = await fetchWithTimeout(buildApiUrl('/api/transaction/create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(params)
  });
  return handleResponse<Transaction>(response);
}

/**
 * 获取交易详情
 */
export async function getTransaction(txId: string): Promise<Transaction> {
  const response = await fetchWithTimeout(buildApiUrl(`/api/transaction/${txId}`));
  return handleResponse<Transaction>(response);
}

/**
 * 获取交易历史
 */
export async function getTransactionHistory(
  userHash: string,
  page = 1,
  limit = 20
): Promise<PaginatedResponse<Transaction>> {
  const response = await fetchWithTimeout(
    buildApiUrl(`/api/transaction/history/${userHash}?page=${page}&limit=${limit}`)
  );
  return handleResponse<PaginatedResponse<Transaction>>(response);
}

/**
 * 转账
 */
export async function transfer(
  params: {
    toUserHash: string;
    amount: number;
    title: string;
    description?: string;
  },
  headers: Record<string, string>
): Promise<Transaction> {
  const response = await fetchWithTimeout(buildApiUrl('/api/transaction/transfer'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(params)
  });
  return handleResponse<Transaction>(response);
}

// ============================================
// 任务API
// ============================================

/**
 * 创建任务
 */
export async function createTask(
  params: TaskCreateParams,
  headers: Record<string, string>
): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/task/create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(params)
  });
  return handleResponse<any>(response);
}

/**
 * 获取任务列表
 */
export async function getTaskList(
  status = 'open',
  page = 1,
  limit = 20,
  filters?: { creatorUserHash?: string; acceptorUserHash?: string },
  headers?: Record<string, string>
): Promise<PaginatedResponse<Task>> {
  const queryParams = new URLSearchParams();
  queryParams.set('status', status);
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (filters?.creatorUserHash) queryParams.set('creatorUserHash', filters.creatorUserHash);
  if (filters?.acceptorUserHash) queryParams.set('acceptorUserHash', filters.acceptorUserHash);

  const response = await fetchWithTimeout(buildApiUrl(`/api/task/list?${queryParams.toString()}`), {
    headers: headers ? { ...headers } : undefined
  });
  return handleResponse<PaginatedResponse<Task>>(response);
}

/**
 * 接受任务
 */
export async function acceptTask(
  params: {
    taskId: string;
  },
  headers: Record<string, string>
): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/task/accept'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(params)
  });
  return handleResponse<any>(response);
}

/**
 * 完成任务
 */
export async function completeTask(
  params: {
    taskId: string;
    action?: 'submit' | 'confirm' | 'cancel' | 'reject' | 'delete';
  },
  headers: Record<string, string>
): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/task/complete'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(params)
  });
  return handleResponse<any>(response);
}

// ============================================
// 商品API
// ============================================

/**
 * 创建商品
 */
export async function createProduct(
  params: ProductCreateParams,
  headers: Record<string, string>
): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/product/create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(params)
  });
  return handleResponse<any>(response);
}

export async function takeDownProduct(productId: string, headers: Record<string, string>): Promise<Product> {
  const response = await fetchWithTimeout(buildApiUrl('/api/product/create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({ action: 'take_down', productId })
  });
  return handleResponse<Product>(response);
}

/**
 * 获取商品列表
 */
export async function getProductList(
  status = 'available',
  page = 1,
  limit = 20
): Promise<PaginatedResponse<Product>> {
  const response = await fetchWithTimeout(
    buildApiUrl(`/api/product/list?status=${status}&page=${page}&limit=${limit}`)
  );
  return handleResponse<PaginatedResponse<Product>>(response);
}

/**
 * 购买商品
 */
export async function purchaseProduct(
  params:
    | { productId: string; quantity: number }
    | { action: 'seller_accept' | 'seller_deliver' | 'buyer_confirm'; purchaseId: string },
  headers: Record<string, string>
): Promise<Purchase> {
  const response = await fetchWithTimeout(buildApiUrl('/api/product/purchase'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(params)
  });
  return handleResponse<Purchase>(response);
}

export async function getPurchaseList(
  params: {
    role: 'buyer' | 'seller';
    status?: string;
    page?: number;
    limit?: number;
  },
  headers: Record<string, string>
): Promise<PaginatedResponse<Purchase>> {
  const queryParams = new URLSearchParams();
  queryParams.set('action', 'list');
  queryParams.set('role', params.role);
  if (params.status) queryParams.set('status', params.status);
  queryParams.set('page', String(params.page ?? 1));
  queryParams.set('limit', String(params.limit ?? 20));

  const response = await fetchWithTimeout(buildApiUrl(`/api/product/purchase?${queryParams.toString()}`), {
    headers: {
      ...headers
    }
  });
  return handleResponse<PaginatedResponse<Purchase>>(response);
}

// ============================================
// 举报/申诉API
// ============================================

/**
 * 创建举报/申诉
 */
export async function createReport(
  params: {
    txId: string;
    type: 'appeal' | 'report';
    reason: string;
    description?: string;
  } | {
    targetType: 'task' | 'product';
    targetId: string;
    type: 'appeal' | 'report';
    reason: string;
    description?: string;
  },
  headers: Record<string, string>
): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/report/create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(params)
  });
  return handleResponse<any>(response);
}

/**
 * 获取举报列表
 */
export async function getReportList(
  params?: {
    status?: string;
    userHash?: string;
    page?: number;
    limit?: number;
  }
): Promise<any> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.append('status', params.status);
  if (params?.userHash) queryParams.append('userHash', params.userHash);
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());

  const response = await fetchWithTimeout(
    buildApiUrl(`/api/report/list?${queryParams.toString()}`)
  );
  return handleResponse<any>(response);
}

// ============================================
// 管理员API
// ============================================

/**
 * 处理举报
 */
export async function handleReport(
  params: {
    reportId: string;
    action: 'resolved' | 'rejected';
    adminNote?: string;
  },
  adminToken: string
): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/report/handle'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken
    },
    body: JSON.stringify(params)
  });
  return handleResponse<any>(response);
}

/**
 * 获取管理员统计数据
 */
export async function getAdminStats(adminToken: string): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/stats'), {
    headers: {
      'X-Admin-Token': adminToken
    }
  });
  return handleResponse<any>(response);
}

// ============================================
// 管理后台（Core 聚合路由）
// ============================================

export async function adminLogin(password: string): Promise<{ token: string; expiresIn: number }> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/auth'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return handleResponse<{ token: string; expiresIn: number }>(response);
}

export async function adminChangePassword(params: { newPassword: string; masterSecret?: string }, token: string): Promise<{ updated: boolean }> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/password'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(params)
  });
  return handleResponse<{ updated: boolean }>(response);
}

export async function adminListReports(
  params: { kind: 'transaction' | 'content'; status?: string; page?: number; limit?: number },
  token: string
): Promise<any> {
  const queryParams = new URLSearchParams();
  queryParams.set('kind', params.kind);
  if (params.status) queryParams.set('status', params.status);
  queryParams.set('page', String(params.page ?? 1));
  queryParams.set('limit', String(params.limit ?? 20));

  const response = await fetchWithTimeout(buildApiUrl(`/api/admin/reports?${queryParams.toString()}`), {
    headers: { Authorization: `Bearer ${token}` }
  });
  return handleResponse<any>(response);
}

export async function adminGetReport(
  params: { kind: 'transaction' | 'content'; reportId: string },
  token: string
): Promise<any> {
  const queryParams = new URLSearchParams();
  queryParams.set('kind', params.kind);
  queryParams.set('reportId', String(params.reportId));
  queryParams.set('page', '1');
  queryParams.set('limit', '1');

  const response = await fetchWithTimeout(buildApiUrl(`/api/admin/reports?${queryParams.toString()}`), {
    headers: { Authorization: `Bearer ${token}` }
  });
  const list = await handleResponse<any>(response);
  const rows = Array.isArray(list?.data) ? list.data : [];
  const found = rows[0];
  if (!found) throw new Error('未找到该记录');
  return found;
}

export async function adminHandleReport(payload: any, token: string): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/reports'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return handleResponse<any>(response);
}

export async function adminListRecovery(params: { status?: string }, token: string): Promise<any> {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.set('status', params.status);
  const response = await fetchWithTimeout(buildApiUrl(`/api/admin/recovery?${queryParams.toString()}`), {
    headers: { Authorization: `Bearer ${token}` }
  });
  return handleResponse<any>(response);
}

export async function adminRecoverCase(payload: { caseId: string; adminNote?: string }, token: string): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/recovery'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return handleResponse<any>(response);
}

export async function adminGetUser(params: { userHash: string }, token: string): Promise<any> {
  const queryParams = new URLSearchParams();
  queryParams.set('userHash', params.userHash);
  const response = await fetchWithTimeout(buildApiUrl(`/api/admin/user?${queryParams.toString()}`), {
    headers: { Authorization: `Bearer ${token}` }
  });
  return handleResponse<any>(response);
}

export async function adminAdjustUser(payload: { userHash: string; delta: number; reason?: string }, token: string): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/user'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return handleResponse<any>(response);
}

export async function adminListRedeemCodes(token: string): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/redeem'), {
    headers: { Authorization: `Bearer ${token}` }
  });
  return handleResponse<any>(response);
}

export async function adminCreateRedeemCode(
  payload: { code: string; title?: string; value: number; expiresAt?: number; maxUses?: number },
  token: string
): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/redeem'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return handleResponse<any>(response);
}

export async function adminDisableRedeemCode(payload: { code?: string; codeHash?: string }, token: string): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/redeem'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ op: 'disable', ...payload })
  });
  return handleResponse<any>(response);
}

export async function adminGetWebhookConfig(token: string): Promise<{ webhookUrl: string; hasSecret: boolean }> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/webhook'), {
    headers: { Authorization: `Bearer ${token}` }
  });
  return handleResponse<{ webhookUrl: string; hasSecret: boolean }>(response);
}

export async function adminUpdateWebhookConfig(
  payload: { webhookUrl?: string; secret?: string },
  token: string
): Promise<{ webhookUrl: string; hasSecret: boolean }> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/webhook'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return handleResponse<{ webhookUrl: string; hasSecret: boolean }>(response);
}

export async function adminTestWebhook(token: string): Promise<{ ok: boolean; status?: number; responseSnippet?: string; error?: string }> {
  const response = await fetchWithTimeout(buildApiUrl('/api/admin/webhook/test'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({})
  });
  return handleResponse<{ ok: boolean; status?: number; responseSnippet?: string; error?: string }>(response);
}

export async function redeemCode(code: string, headers: Record<string, string>): Promise<any> {
  const response = await fetchWithTimeout(buildApiUrl('/api/redeem'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({ code })
  });
  return handleResponse<any>(response);
}

// ============================================
// 词库API
// ============================================

/**
 * 生成词库访问令牌
 */
export async function generateWordlistToken(): Promise<{
  timestamp: number;
  token: string;
}> {
  const response = await fetchWithTimeout(buildApiUrl('/api/wordlist/token'), {
    method: 'POST'
  });
  return handleResponse<{ timestamp: number; token: string }>(response);
}

/**
 * 获取词库
 */
export async function getWordlist(
  timestamp: number,
  token: string
): Promise<{
  wordlist: string;
  checksum: string;
  timestamp: number;
}> {
  const response = await fetchWithTimeout(
    buildApiUrl(`/api/wordlist?timestamp=${timestamp}&token=${token}`)
  );
  return handleResponse<{
    wordlist: string;
    checksum: string;
    timestamp: number;
  }>(response);
}
