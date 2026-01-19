-- YourTJ Credit Database Schema
-- 设计原则: 去中心化、轻量级、自动清理
-- 数据库: Turso (LibSQL/SQLite)

-- ============================================
-- 1. 钱包表 (Wallets)
-- ============================================
-- 注意: 不存储学号和PIN,只存储钱包哈希用于识别
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_hash TEXT NOT NULL UNIQUE,           -- 用户哈希(由助记词派生,唯一标识)
  user_secret TEXT,                         -- 用户密钥(用于HMAC验签)
  public_key TEXT,                          -- 预留: 公钥(可用于后续升级为非对称签名)
  balance INTEGER NOT NULL DEFAULT 0,       -- 积分余额
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_active_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_hash ON wallets(user_hash);
CREATE INDEX IF NOT EXISTS idx_wallets_last_active ON wallets(last_active_at);

-- ============================================
-- 2. 交易类型表 (Transaction Types)
-- ============================================
CREATE TABLE IF NOT EXISTS transaction_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,                -- 类型名称(task_reward, product_purchase, transfer等)
  display_name TEXT NOT NULL,               -- 显示名称
  description TEXT,                         -- 描述
  enabled INTEGER NOT NULL DEFAULT 1        -- 是否启用
);

-- 插入默认交易类型
INSERT OR IGNORE INTO transaction_types (id, name, display_name, description) VALUES
  (1, 'task_reward', '任务悬赏', '发布任务悬赏,完成后获得积分'),
  (2, 'product_purchase', '商品购买', '使用积分购买商品'),
  (3, 'transfer', '积分转账', '用户之间转账积分'),
  (4, 'admin_adjust', '管理员调整', '管理员手动调整积分'),
  (5, 'system_reward', '系统奖励', '系统自动发放的奖励');

-- ============================================
-- 3. 交易记录表 (Transactions)
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_id TEXT NOT NULL UNIQUE,               -- 交易唯一识别码(用于申诉和举报)
  type_id INTEGER NOT NULL,                 -- 交易类型ID
  from_user_hash TEXT,                      -- 发送方钱包哈希(可为空,如系统奖励)
  to_user_hash TEXT,                        -- 接收方钱包哈希(可为空,如商品购买)
  amount INTEGER NOT NULL,                  -- 交易金额(积分)
  status TEXT NOT NULL DEFAULT 'completed', -- 状态: pending, completed, cancelled, disputed
  title TEXT NOT NULL,                      -- 交易标题
  description TEXT,                         -- 交易描述
  metadata TEXT,                            -- 额外元数据(JSON格式)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  completed_at INTEGER,                     -- 完成时间

  FOREIGN KEY (type_id) REFERENCES transaction_types(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_tx_id ON transactions(tx_id);
CREATE INDEX IF NOT EXISTS idx_transactions_from_user ON transactions(from_user_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_to_user ON transactions(to_user_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- ============================================
-- 4. 申诉举报表 (Reports)
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL UNIQUE,           -- 举报唯一ID
  tx_id TEXT NOT NULL,                      -- 关联的交易ID
  reporter_user_hash TEXT NOT NULL,         -- 举报人钱包哈希
  type TEXT NOT NULL,                       -- 类型: appeal(申诉), report(举报)
  reason TEXT NOT NULL,                     -- 原因
  description TEXT,                         -- 详细描述
  status TEXT NOT NULL DEFAULT 'pending',   -- 状态: pending, reviewing, resolved, rejected
  admin_note TEXT,                          -- 管理员备注
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  resolved_at INTEGER,                      -- 处理时间

  FOREIGN KEY (tx_id) REFERENCES transactions(tx_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_tx_id ON reports(tx_id);
CREATE INDEX IF NOT EXISTS idx_reports_report_id ON reports(report_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_user_hash);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

-- ============================================
-- 5. 系统设置表 (Settings)
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 插入默认设置
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('transaction_retention_days', '30', '交易记录保留天数'),
  ('min_transfer_amount', '1', '最小转账金额'),
  ('max_transfer_amount', '10000', '最大转账金额'),
  ('enable_task_reward', 'true', '是否启用任务悬赏'),
  ('enable_product_purchase', 'true', '是否启用商品购买'),
  ('enable_transfer', 'true', '是否启用积分转账');

-- ============================================
-- 6. 任务表 (Tasks) - 用于任务悬赏
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL UNIQUE,             -- 任务唯一ID
  creator_user_hash TEXT NOT NULL,          -- 创建者钱包哈希
  title TEXT NOT NULL,                      -- 任务标题
  description TEXT NOT NULL,                -- 任务描述
  contact_info TEXT,                        -- 联系方式（仅对创建者/接单者可见）
  reward_amount INTEGER NOT NULL,           -- 悬赏金额
  status TEXT NOT NULL DEFAULT 'open',      -- 状态: open, in_progress, submitted, completed, cancelled
  acceptor_user_hash TEXT,                  -- 接受者钱包哈希
  tx_id TEXT,                               -- 关联的交易ID
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  accepted_at INTEGER,                      -- 接受时间
  submitted_at INTEGER,                     -- 提交时间
  completed_at INTEGER,                     -- 完成时间

  FOREIGN KEY (tx_id) REFERENCES transactions(tx_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_user_hash);
CREATE INDEX IF NOT EXISTS idx_tasks_acceptor ON tasks(acceptor_user_hash);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- ============================================
-- 7. 商品表 (Products) - 用于商品购买
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL UNIQUE,          -- 商品唯一ID
  seller_user_hash TEXT NOT NULL,           -- 卖家钱包哈希
  title TEXT NOT NULL,                      -- 商品标题
  description TEXT NOT NULL,                -- 商品描述
  delivery_info TEXT,                       -- 发货信息/取货方式（仅买家/卖家可见）
  price INTEGER NOT NULL,                   -- 商品价格
  stock INTEGER NOT NULL DEFAULT 0,         -- 库存数量
  status TEXT NOT NULL DEFAULT 'available', -- 状态: available, sold_out, removed
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(product_id);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_user_hash);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

-- ============================================
-- 8. 购买记录表 (Purchases)
-- ============================================
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id TEXT NOT NULL UNIQUE,         -- 购买唯一ID
  product_id TEXT NOT NULL,                 -- 商品ID
  buyer_user_hash TEXT NOT NULL,            -- 买家钱包哈希
  seller_user_hash TEXT NOT NULL,           -- 卖家钱包哈希
  amount INTEGER NOT NULL,                  -- 购买金额
  quantity INTEGER NOT NULL DEFAULT 1,      -- 购买数量
  tx_id TEXT NOT NULL,                      -- 关联的交易ID
  status TEXT NOT NULL DEFAULT 'completed', -- 状态: pending, accepted, delivered, completed, cancelled, refunded
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  accepted_at INTEGER,                      -- 卖家接单时间
  delivered_at INTEGER,                     -- 卖家标记交付时间
  confirmed_at INTEGER,                     -- 买家确认时间
  updated_at INTEGER,                       -- 更新时间

  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (tx_id) REFERENCES transactions(tx_id)
);

CREATE INDEX IF NOT EXISTS idx_purchases_purchase_id ON purchases(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchases_product_id ON purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON purchases(buyer_user_hash);
CREATE INDEX IF NOT EXISTS idx_purchases_seller ON purchases(seller_user_hash);
CREATE INDEX IF NOT EXISTS idx_purchases_tx_id ON purchases(tx_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);

-- ============================================
-- 9. 自动清理触发器
-- ============================================
-- 注意: SQLite不支持事件调度器,需要在应用层实现定期清理
-- 这里提供清理查询的视图

-- 创建视图: 查找超过30天的交易记录
CREATE VIEW IF NOT EXISTS expired_transactions AS
SELECT id, tx_id, created_at
FROM transactions
WHERE created_at < strftime('%s', 'now', '-30 days')
  AND status IN ('completed', 'cancelled');

-- 创建视图: 查找超过30天的申诉记录
CREATE VIEW IF NOT EXISTS expired_reports AS
SELECT id, tx_id, created_at
FROM reports
WHERE created_at < strftime('%s', 'now', '-30 days')
  AND status IN ('resolved', 'rejected');

-- ============================================
-- 10. 统计视图
-- ============================================
-- 用户积分统计
CREATE VIEW IF NOT EXISTS user_stats AS
SELECT
  w.user_hash,
  w.balance,
  COUNT(DISTINCT t1.id) as sent_count,
  COUNT(DISTINCT t2.id) as received_count,
  COALESCE(SUM(CASE WHEN t1.status = 'completed' THEN t1.amount ELSE 0 END), 0) as total_sent,
  COALESCE(SUM(CASE WHEN t2.status = 'completed' THEN t2.amount ELSE 0 END), 0) as total_received,
  w.created_at,
  w.last_active_at
FROM wallets w
LEFT JOIN transactions t1 ON w.user_hash = t1.from_user_hash
LEFT JOIN transactions t2 ON w.user_hash = t2.to_user_hash
GROUP BY w.user_hash;

-- 交易类型统计
CREATE VIEW IF NOT EXISTS transaction_type_stats AS
SELECT
  tt.name,
  tt.display_name,
  COUNT(t.id) as transaction_count,
  COALESCE(SUM(t.amount), 0) as total_amount,
  AVG(t.amount) as avg_amount
FROM transaction_types tt
LEFT JOIN transactions t ON tt.id = t.type_id AND t.status = 'completed'
GROUP BY tt.id;

-- ============================================
-- 数据库初始化完成
-- ============================================
