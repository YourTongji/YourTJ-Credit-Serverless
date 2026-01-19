/**
 * YourTJ Credit - 共享类型定义
 * 所有前后端共享的类型定义
 */

// ============================================
// 钱包相关类型
// ============================================

/**
 * 钱包信息
 */
export interface Wallet {
  userHash: string;      // 用户哈希(唯一标识)
  balance: number;       // 积分余额
  createdAt: number;     // 创建时间戳
  lastActiveAt: number;  // 最后活跃时间戳
}

/**
 * 钱包创建参数
 */
export interface WalletCreateParams {
  studentId: string;     // 学号
  pin: string;           // PIN码(至少6位)
}

/**
 * 助记词信息
 */
export interface MnemonicInfo {
  mnemonic: string;      // 助记词(3个词,用"-"连接)
  userHash: string;      // 派生的用户哈希
  userSecret: string;    // 派生的用户密钥(用于签名)
}

// ============================================
// 交易相关类型
// ============================================

/**
 * 交易类型
 */
export enum TransactionType {
  TASK_REWARD = 'task_reward',           // 任务悬赏
  PRODUCT_PURCHASE = 'product_purchase', // 商品购买
  TRANSFER = 'transfer',                 // 积分转账
  ADMIN_ADJUST = 'admin_adjust',         // 管理员调整
  SYSTEM_REWARD = 'system_reward'        // 系统奖励
}

/**
 * 交易状态
 */
export enum TransactionStatus {
  PENDING = 'pending',       // 待处理
  COMPLETED = 'completed',   // 已完成
  CANCELLED = 'cancelled',   // 已取消
  DISPUTED = 'disputed'      // 有争议
}

/**
 * 交易记录
 */
export interface Transaction {
  id: number;
  txId: string;              // 交易唯一识别码
  typeId: number;            // 交易类型ID
  typeName: string;          // 交易类型名称
  typeDisplayName: string;   // 交易类型显示名称
  fromUserHash?: string;     // 发送方钱包哈希
  toUserHash?: string;       // 接收方钱包哈希
  amount: number;            // 交易金额
  status: TransactionStatus; // 状态
  title: string;             // 交易标题
  description?: string;      // 交易描述
  metadata?: string;         // 额外元数据(JSON)
  createdAt: number;         // 创建时间戳
  completedAt?: number;      // 完成时间戳
}

/**
 * 创建交易参数
 */
export interface TransactionCreateParams {
  type: TransactionType;
  fromUserHash?: string;
  toUserHash?: string;
  amount: number;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * 交易签名参数
 */
export interface TransactionSignParams {
  txId: string;
  amount: number;
  timestamp: number;
  userSecret: string;
}

// ============================================
// 任务相关类型
// ============================================

/**
 * 任务状态
 */
export enum TaskStatus {
  OPEN = 'open',               // 开放中
  IN_PROGRESS = 'in_progress', // 进行中
  COMPLETED = 'completed',     // 已完成
  CANCELLED = 'cancelled'      // 已取消
}

/**
 * 任务信息
 */
export interface Task {
  id: number;
  taskId: string;            // 任务唯一ID
  creatorUserHash: string;   // 创建者钱包哈希
  title: string;             // 任务标题
  description: string;       // 任务描述
  rewardAmount: number;      // 悬赏金额
  status: TaskStatus;        // 状态
  acceptorUserHash?: string; // 接受者钱包哈希
  txId?: string;             // 关联的交易ID
  createdAt: number;         // 创建时间戳
  acceptedAt?: number;       // 接受时间戳
  completedAt?: number;      // 完成时间戳
}

/**
 * 创建任务参数
 */
export interface TaskCreateParams {
  title: string;
  description: string;
  rewardAmount: number;
}

// ============================================
// 商品相关类型
// ============================================

/**
 * 商品状态
 */
export enum ProductStatus {
  AVAILABLE = 'available', // 可购买
  SOLD_OUT = 'sold_out',   // 已售罄
  REMOVED = 'removed'      // 已下架
}

/**
 * 商品信息
 */
export interface Product {
  id: number;
  productId: string;         // 商品唯一ID
  sellerUserHash: string;    // 卖家钱包哈希
  title: string;             // 商品标题
  description: string;       // 商品描述
  price: number;             // 商品价格
  stock: number;             // 库存数量
  status: ProductStatus;     // 状态
  createdAt: number;         // 创建时间戳
  updatedAt: number;         // 更新时间戳
}

/**
 * 创建商品参数
 */
export interface ProductCreateParams {
  title: string;
  description: string;
  price: number;
  stock: number;
}

/**
 * 购买记录
 */
export interface Purchase {
  id: number;
  purchaseId: string;        // 购买唯一ID
  productId: string;         // 商品ID
  buyerUserHash: string;     // 买家钱包哈希
  sellerUserHash: string;    // 卖家钱包哈希
  amount: number;            // 购买金额
  quantity: number;          // 购买数量
  txId: string;              // 关联的交易ID
  status: string;            // 状态
  createdAt: number;         // 创建时间戳
}

// ============================================
// 申诉举报相关类型
// ============================================

/**
 * 举报类型
 */
export enum ReportType {
  APPEAL = 'appeal',   // 申诉
  REPORT = 'report'    // 举报
}

/**
 * 举报状态
 */
export enum ReportStatus {
  PENDING = 'pending',     // 待处理
  REVIEWING = 'reviewing', // 审核中
  RESOLVED = 'resolved',   // 已解决
  REJECTED = 'rejected'    // 已拒绝
}

export type ReportTargetType = 'transaction' | 'task' | 'product';

/**
 * 举报信息
 */
export interface Report {
  id: number;
  reportId: string;          // 举报唯一ID
  txId: string;              // 关联的交易ID
  reporterUserHash: string;  // 举报人钱包哈希
  type: ReportType;          // 类型
  reason: string;            // 原因
  description?: string;      // 详细描述
  status: ReportStatus;      // 状态
  adminNote?: string;        // 管理员备注
  createdAt: number;         // 创建时间戳
  resolvedAt?: number;       // 处理时间戳
}

export interface ContentReport {
  id: number;
  reportId: string;
  targetType: Exclude<ReportTargetType, 'transaction'>; // task | product
  targetId: string;
  targetOwnerUserHash?: string;
  reporterUserHash: string;
  type: ReportType;
  reason: string;
  description?: string;
  status: ReportStatus;
  adminNote?: string;
  createdAt: number;
  resolvedAt?: number;
}

/**
 * 创建举报参数
 */
export type ReportCreateParams =
  | {
      txId: string;
      type: ReportType;
      reason: string;
      description?: string;
    }
  | {
      targetType: Exclude<ReportTargetType, 'transaction'>;
      targetId: string;
      type: ReportType;
      reason: string;
      description?: string;
    };

// ============================================
// API 响应类型
// ============================================

/**
 * 标准API响应
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// 统计相关类型
// ============================================

/**
 * 用户统计信息
 */
export interface UserStats {
  userHash: string;
  balance: number;
  sentCount: number;
  receivedCount: number;
  totalSent: number;
  totalReceived: number;
  createdAt: number;
  lastActiveAt: number;
}

/**
 * 交易类型统计
 */
export interface TransactionTypeStats {
  name: string;
  displayName: string;
  transactionCount: number;
  totalAmount: number;
  avgAmount: number;
}
