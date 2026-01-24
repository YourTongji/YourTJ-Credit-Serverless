/**
 * YourTJ Credit - 交易广场页面
 * 包含任务悬赏和商品购买两个模块
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Plus, Briefcase, ShoppingBag, X, Loader2 } from 'lucide-react';
import { loadWallet, type WalletStorage } from '../utils/wallet-storage';
import {
  acceptTask,
  completeTask,
  createProduct,
  createReport,
  createTask,
  getProductList,
  getPurchaseList,
  getTaskList,
  purchaseProduct,
  takeDownProduct
} from '../services/api';
import { createSignedRequest } from '../shared/utils/transaction-verification';
import type { Product, Purchase, Task } from '@shared/types';

type TabType = 'tasks' | 'products';
type TaskView = 'square' | 'accepted' | 'toConfirm' | 'published';
type ProductView = 'square' | 'buyOrders' | 'sellOrders';

function getAvatarGradient(seed: string): { from: string; to: string } {
  const s = String(seed || 'seed');
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    h1 = (h1 * 31 + code) % 360;
    h2 = (h2 * 17 + code) % 360;
  }
  const hueA = h1;
  const hueB = (h1 + 30 + (h2 % 90)) % 360;
  return {
    from: `hsl(${hueA} 78% 58%)`,
    to: `hsl(${hueB} 78% 52%)`
  };
}

function Avatar({ seed, className }: { seed: string; className?: string }) {
  const { from, to } = getAvatarGradient(seed);
  return (
    <div
      className={className || 'w-6 h-6 rounded-full flex-shrink-0 ring-1 ring-black/5 dark:ring-white/10'}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-hidden="true"
    />
  );
}

export function MarketplacePage() {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [wallet, setWallet] = useState<WalletStorage | null>(null);
  const [detail, setDetail] = useState<
    | { type: 'task'; task: Task }
    | { type: 'product'; product: Product }
    | { type: 'order'; order: Purchase; role: 'buyer' | 'seller' }
    | null
  >(null);

  const [taskView, setTaskView] = useState<TaskView>('square');
  const [productView, setProductView] = useState<ProductView>('square');

  const [info, setInfo] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: ''
  });

  const [reportModal, setReportModal] = useState<{
    open: boolean;
    targetType: 'task' | 'product';
    targetId: string;
    title: string;
  }>({ open: false, targetType: 'task', targetId: '', title: '' });
  const [reportType, setReportType] = useState<'report' | 'appeal'>('report');
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: ''
  });
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);

  const [quantityState, setQuantityState] = useState<{ open: boolean; max: number; title: string }>({
    open: false,
    max: 1,
    title: ''
  });
  const [quantity, setQuantity] = useState('1');
  const quantityResolveRef = useRef<((value: number | null) => void) | null>(null);

  useEffect(() => {
    setWallet(loadWallet());
  }, []);

  useEffect(() => {
    if (activeTab === 'tasks') {
      void loadTasks();
    } else if (activeTab === 'products') {
      void loadProductsOrOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, taskView, productView, wallet?.userHash]);

  function showInfo(title: string, message: string) {
    setInfo({ open: true, title, message });
  }

  function requestConfirm(title: string, message: string): Promise<boolean> {
    setConfirmState({ open: true, title, message });
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
    });
  }

  function requestQuantity(title: string, max: number): Promise<number | null> {
    setQuantityState({ open: true, title, max });
    setQuantity('1');
    return new Promise<number | null>((resolve) => {
      quantityResolveRef.current = resolve;
    });
  }

  function getUserSecretForSigning(): string | null {
    const localWallet = wallet || loadWallet();
    if (!localWallet) {
      showInfo('需要登录', '请先登录钱包');
      return null;
    }
    return localWallet.userSecret;
  }

  function requestPin(): Promise<string | null> {
    // 交易相关操作不再要求 PIN，直接使用本地密钥签名
    return Promise.resolve(getUserSecretForSigning());
  }

  function openReport(targetType: 'task' | 'product', targetId: string, title: string) {
    setReportType('report');
    setReportReason('');
    setReportDescription('');
    setReportModal({ open: true, targetType, targetId, title });
  }

  async function submitReport() {
    const localWallet = wallet || loadWallet();
    if (!localWallet) {
      showInfo('需要登录', '请先登录钱包');
      return;
    }
    if (!reportReason.trim()) {
      showInfo('缺少原因', '请填写举报/申诉原因');
      return;
    }

    try {
      setReportSubmitting(true);
      const { payload, headers } = await createSignedRequest(
        {
          targetType: reportModal.targetType,
          targetId: reportModal.targetId,
          type: reportType,
          reason: reportReason.trim(),
          description: reportDescription.trim() || undefined
        },
        localWallet.userHash,
        localWallet.userSecret
      );
      await createReport(payload as any, headers);
      setReportModal({ open: false, targetType: reportModal.targetType, targetId: '', title: '' });
      showInfo('提交成功', '举报/申诉已提交，等待处理');
    } catch (err) {
      showInfo('提交失败', err instanceof Error ? err.message : '提交失败');
    } finally {
      setReportSubmitting(false);
    }
  }

  async function loadTasks() {
    try {
      setLoading(true);
      if (taskView === 'square') {
        const response = await getTaskList('all', 1, 50);
        const list = (response.data || []).filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
        setTasks(list);
        return;
      }

      if (!wallet) {
        setTasks([]);
        return;
      }

      if (taskView === 'accepted') {
        const listPayload = { status: 'all', page: 1, limit: 50, acceptorUserHash: wallet.userHash };
        const { headers } = await createSignedRequest(listPayload, wallet.userHash, wallet.userSecret);
        const response = await getTaskList('all', 1, 50, { acceptorUserHash: wallet.userHash }, headers);
        setTasks((response.data || []).filter((t) => t.status !== 'cancelled'));
        return;
      }

      if (taskView === 'toConfirm') {
        const listPayload = { status: 'submitted', page: 1, limit: 50, creatorUserHash: wallet.userHash };
        const { headers } = await createSignedRequest(listPayload, wallet.userHash, wallet.userSecret);
        const response = await getTaskList('submitted', 1, 50, { creatorUserHash: wallet.userHash }, headers);
        setTasks((response.data || []).filter((t) => t.status !== 'cancelled'));
        return;
      }

      const listPayload = { status: 'all', page: 1, limit: 50, creatorUserHash: wallet.userHash };
      const { headers } = await createSignedRequest(listPayload, wallet.userHash, wallet.userSecret);
      const response = await getTaskList('all', 1, 50, { creatorUserHash: wallet.userHash }, headers);
      setTasks((response.data || []).filter((t) => t.status !== 'cancelled'));
    } catch (err) {
      console.error('Load tasks error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadProductsOrOrders() {
    try {
      setLoading(true);
      if (productView === 'square') {
        const response = await getProductList('available', 1, 50);
        setProducts(response.data || []);
        setOrders([]);
        return;
      }

      if (!wallet) {
        setOrders([]);
        setProducts([]);
        return;
      }

      const role = productView === 'sellOrders' ? ('seller' as const) : ('buyer' as const);
      const listPayload = { action: 'list', role, status: 'all', page: 1, limit: 50 };
      const { headers } = await createSignedRequest(listPayload, wallet.userHash, wallet.userSecret);
      const response = await getPurchaseList({ role, status: 'all', page: 1, limit: 50 }, headers);
      setOrders(response.data || []);
      setProducts([]);
    } catch (err) {
      console.error('Load products error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function runSignedTaskAction(
    taskId: string,
    action: 'accept' | 'submit' | 'confirm' | 'cancel' | 'reject' | 'delete'
  ) {
    const localWallet = wallet || loadWallet();
    if (!localWallet) return;

    const messageMap: Record<typeof action, string> = {
      accept: '确认接受这个任务吗？',
      submit: '确认提交任务吗？（提交后等待发布者确认结算）',
      confirm: '确认该任务已完成并发放悬赏吗？',
      cancel: '确认取消接单吗？（任务将重新回到广场，悬赏仍由发布者托管）',
      reject: '确认打回该任务吗？（任务将重新回到广场，接单记录将清除）',
      delete: '确认删除该任务吗？（悬赏金额将退回到你的账户）'
    };

    const ok = await requestConfirm('确认操作', messageMap[action]);
    if (!ok) return;

    const userSecret = getUserSecretForSigning();
    if (!userSecret) return;

    try {
      const payload:
        | { taskId: string }
        | { taskId: string; action: 'submit' | 'confirm' | 'cancel' | 'reject' | 'delete' } =
        action === 'accept'
          ? { taskId }
          : { taskId, action };
      const { payload: signedPayload, headers } = await createSignedRequest(payload, localWallet.userHash, userSecret);
      if (action === 'accept') {
        await acceptTask(signedPayload, headers);
      } else {
        await completeTask(signedPayload, headers);
      }
      await loadTasks();
      showInfo('操作成功', '已更新任务状态');
    } catch (err: any) {
      showInfo('操作失败', err?.message || '请稍后重试');
    }
  }

  async function runSignedProductAction(payload: any, successTitle: string) {
    const localWallet = wallet || loadWallet();
    if (!localWallet) return;

    const ok = await requestConfirm('确认操作', successTitle);
    if (!ok) return;

    const userSecret = getUserSecretForSigning();
    if (!userSecret) return;

    try {
      const { payload: signedPayload, headers } = await createSignedRequest(payload, localWallet.userHash, userSecret);
      await purchaseProduct(signedPayload, headers);
      await loadProductsOrOrders();
      showInfo('操作成功', '已更新订单状态');
    } catch (err: any) {
      showInfo('操作失败', err?.message || '请稍后重试');
    }
  }

  async function runSignedProductTakeDown(productId: string) {
    const localWallet = wallet || loadWallet();
    if (!localWallet) return;

    const ok = await requestConfirm('确认操作', '确认下架该商品吗？下架后广场将不再展示，但已产生的订单不受影响。');
    if (!ok) return;

    const userSecret = getUserSecretForSigning();
    if (!userSecret) return;

    try {
      const { headers } = await createSignedRequest({ action: 'take_down', productId }, localWallet.userHash, userSecret);
      await takeDownProduct(productId, headers);
      await loadProductsOrOrders();
      showInfo('操作成功', '商品已下架');
    } catch (err: any) {
      showInfo('操作失败', err?.message || '请稍后重试');
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'tasks'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            任务悬赏
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'products'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            商品交易
          </button>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="text-xs bg-black dark:bg-white dark:text-black text-white px-4 py-2 rounded-full font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus size={14} />
          发布{activeTab === 'tasks' ? '任务' : '商品'}
        </button>
      </div>

      {/* Sub Tabs */}
      {activeTab === 'tasks' && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTaskView('square')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              taskView === 'square'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            广场
          </button>
          <button
            onClick={() => setTaskView('accepted')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              taskView === 'accepted'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            我接的单
          </button>
          <button
            onClick={() => setTaskView('toConfirm')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              taskView === 'toConfirm'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            待我确认
          </button>
          <button
            onClick={() => setTaskView('published')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              taskView === 'published'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            我发布的
          </button>
        </div>
      )}

      {activeTab === 'tasks' && <NoticeBanner kind="tasks" />}

      {activeTab === 'products' && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setProductView('square')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              productView === 'square'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            广场
          </button>
          <button
            onClick={() => setProductView('buyOrders')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              productView === 'buyOrders'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            我的订单
          </button>
          <button
            onClick={() => setProductView('sellOrders')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              productView === 'sellOrders'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            待我处理
          </button>
        </div>
      )}

      {activeTab === 'products' && <NoticeBanner kind="products" />}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-blue-500" />
        </div>
      )}

      {/* Tasks Grid */}
      {!loading && activeTab === 'tasks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.length === 0 ? (
            <div className="col-span-full text-center py-20 text-slate-500">
              暂无任务
            </div>
          ) : (
              tasks.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
                currentUserHash={wallet?.userHash}
                onOpen={(opened) => setDetail({ type: 'task', task: opened })}
                onAction={runSignedTaskAction}
              />
            ))
          )}
        </div>
      )}

      {/* Products Grid */}
      {!loading && activeTab === 'products' && productView === 'square' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.length === 0 ? (
            <div className="col-span-full text-center py-20 text-slate-500">
              暂无商品
            </div>
          ) : (
            products.map((product) => (
              <ProductCard
                key={product.productId}
                product={product}
                onOpen={(opened) => setDetail({ type: 'product', product: opened })}
                onCreateOrder={async (productId, stock, price) => {
                  const qty = await requestQuantity('下单数量', stock);
                  if (!qty) return;
                  await runSignedProductAction(
                    { productId, quantity: qty },
                    `确认下单 ${qty} 个商品，共 ${price * qty} 小济元？（将先托管扣除，确认后才转给卖家）`
                  );
                }}
              />
            ))
          )}
        </div>
      )}

      {/* Orders Grid */}
      {!loading && activeTab === 'products' && productView !== 'square' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.length === 0 ? (
            <div className="col-span-full text-center py-20 text-slate-500">
              暂无订单
            </div>
          ) : (
            orders.map((order) => (
              <OrderCard
                key={order.purchaseId}
                order={order}
                role={productView === 'sellOrders' ? 'seller' : 'buyer'}
                currentUserHash={wallet?.userHash}
                onOpen={(opened, role) => setDetail({ type: 'order', order: opened, role })}
                onAction={async (action, purchaseId) => {
                  const messageMap: Record<string, string> = {
                    seller_accept: '确认接单吗？',
                    seller_deliver: '确认标记交付吗？',
                    buyer_confirm: '确认已收到并完成交易吗？（确认后资金转给卖家）'
                  };
                  await runSignedProductAction({ action, purchaseId }, messageMap[action] || '确认执行该操作吗？');
                }}
              />
            ))
          )}
        </div>
      )}

      {detail?.type === 'task' && (
        <TaskDetailModal
          task={detail.task}
          currentUserHash={wallet?.userHash}
          onClose={() => setDetail(null)}
          onReport={(taskId, title) => openReport('task', taskId, title)}
          onAction={async (taskId, action) => {
            await runSignedTaskAction(taskId, action);
            setDetail(null);
          }}
        />
      )}

      {detail?.type === 'product' && (
        <ProductDetailModal
          product={detail.product}
          currentUserHash={wallet?.userHash}
          onClose={() => setDetail(null)}
          onReport={(productId, title) => openReport('product', productId, title)}
          onCreateOrder={async (productId, stock, price) => {
            const qty = await requestQuantity('下单数量', stock);
            if (!qty) return;
            await runSignedProductAction(
              { productId, quantity: qty },
              `确认下单 ${qty} 个商品，共￥${price * qty}？（将先托管扣除，确认后才转给卖家）`
            );
            setDetail(null);
          }}
          onTakeDown={async (productId) => {
            await runSignedProductTakeDown(productId);
            setDetail(null);
          }}
        />
      )}

      {detail?.type === 'order' && (
        <OrderDetailModal
          order={detail.order}
          role={detail.role}
          currentUserHash={wallet?.userHash}
          onClose={() => setDetail(null)}
          onAction={async (action, purchaseId) => {
            const messageMap: Record<string, string> = {
              seller_accept: '确认接单吗？',
              seller_deliver: '确认标记交付吗？',
              buyer_confirm: '确认已收到并完成交易吗？（确认后资金转给卖家）'
            };
            await runSignedProductAction({ action, purchaseId }, messageMap[action] || '确认执行该操作吗？');
            setDetail(null);
          }}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateModal
          type={activeTab}
          wallet={wallet}
          requestPin={requestPin}
          showInfo={showInfo}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            if (activeTab === 'tasks') {
              void loadTasks();
            } else {
              void loadProductsOrOrders();
            }
          }}
        />
      )}

      {/* Confirm Modal */}
      {confirmState.open && (
        <ModalShell title={confirmState.title}>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{confirmState.message}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setConfirmState({ open: false, title: '', message: '' });
                confirmResolveRef.current?.(false);
                confirmResolveRef.current = null;
              }}
              className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => {
                setConfirmState({ open: false, title: '', message: '' });
                confirmResolveRef.current?.(true);
                confirmResolveRef.current = null;
              }}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              确认
            </button>
          </div>
        </ModalShell>
      )}

      {/* Quantity Modal */}
      {quantityState.open && (
        <ModalShell title={quantityState.title}>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">请输入数量（1 - {quantityState.max}）</p>
          <input
            type="number"
            min={1}
            max={quantityState.max}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setQuantityState({ open: false, title: '', max: 1 });
                quantityResolveRef.current?.(null);
                quantityResolveRef.current = null;
              }}
              className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => {
                const n = parseInt(quantity, 10);
                if (!Number.isFinite(n) || n <= 0 || n > quantityState.max) return;
                setQuantityState({ open: false, title: '', max: 1 });
                quantityResolveRef.current?.(n);
                quantityResolveRef.current = null;
              }}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              确认
            </button>
          </div>
        </ModalShell>
      )}

      {/* Info Modal */}
      {info.open && (
        <ModalShell title={info.title}>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{info.message}</p>
          <button
            onClick={() => setInfo({ open: false, title: '', message: '' })}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            确认
          </button>
        </ModalShell>
      )}

      {/* Report Modal */}
      {reportModal.open && (
        <ModalShell title={`举报/申诉：${reportModal.title || '内容'}`}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">类型</div>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white"
                >
                  <option value="report">举报</option>
                  <option value="appeal">申诉</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">对象</div>
                <div className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-700 dark:text-slate-200">
                  {reportModal.targetType}:{reportModal.targetId.slice(0, 8)}…
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">原因 *</div>
              <input
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white"
                placeholder="请简要说明原因"
                maxLength={100}
              />
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">详细描述（可选）</div>
              <textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white resize-none"
                placeholder="补充细节、截图说明等（可选）"
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setReportModal({ open: false, targetType: reportModal.targetType, targetId: '', title: '' })}
                disabled={reportSubmitting}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => void submitReport()}
                disabled={reportSubmitting}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {reportSubmitting ? '提交中…' : '提交'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function ModalShell({ title, children }: { title: string; children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/35 backdrop-blur-md backdrop-saturate-150">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-4 md:p-6 w-full max-w-[92vw] sm:max-w-sm shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <button
            onClick={() => {}}
            className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors opacity-0 pointer-events-none"
            aria-hidden="true"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>,
    document.body
  );
}

function NoticeBanner({ kind }: { kind: 'tasks' | 'products' }) {
  const copy =
    kind === 'tasks'
      ? '提倡发布对老师/课程/保研/竞赛等“信息类”悬赏，不提倡代写/代考/代课等交易；谨慎留下联系方式并备注平台，仅接单后可见。'
      : '提倡交易二手教材/电子资料/二手物品；不提倡未经允许的课程内部资料/违法违规文件；平台不提供代理储存，建议网盘发货或备注平台联系方式。';

  return (
    <div className="rounded-xl border border-black/5 dark:border-white/10 bg-gradient-to-r from-amber-50/70 via-white/50 to-sky-50/70 dark:from-amber-500/10 dark:via-white/5 dark:to-sky-500/10 px-4 py-3">
      <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        <span className="font-semibold tracking-wide">提示：</span>
        <span className="text-slate-600 dark:text-slate-300">{copy}</span>
      </div>
    </div>
  );
}

// Task Card Component
function TaskCard({
  task,
  currentUserHash,
  onOpen,
  onAction
}: {
  task: Task;
  currentUserHash?: string;
  onOpen: (task: Task) => void;
  onAction: (taskId: string, action: 'accept' | 'submit' | 'confirm') => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  function formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return `${days}天前`;
  }

  const canAccept = task.status === 'open' && currentUserHash && task.creatorUserHash !== currentUserHash;
  const canSubmit = task.status === 'in_progress' && currentUserHash && task.acceptorUserHash === currentUserHash;
  const canConfirm = task.status === 'submitted' && currentUserHash && task.creatorUserHash === currentUserHash;

  const action: 'accept' | 'submit' | 'confirm' | null = canAccept ? 'accept' : canSubmit ? 'submit' : canConfirm ? 'confirm' : null;

  async function handleClick() {
    if (!action) return;
    setSubmitting(true);
    try {
      await onAction(task.taskId, action);
    } finally {
      setSubmitting(false);
    }
  }

  function actionLabel(): string {
    if (action === 'accept') return `¥ ${task.rewardAmount}`;
    if (action === 'submit') return '提交';
    if (action === 'confirm') return '确认';
    if (task.status === 'submitted') return '待确认';
    if (task.status === 'in_progress') return '进行中';
    if (task.status === 'completed') return '已完成';
    return `¥ ${task.rewardAmount}`;
  }

  return (
    <div
      onClick={() => onOpen(task)}
      className="group relative bg-white/50 dark:bg-[#1e1e1e]/50 backdrop-blur-md border border-black/5 dark:border-white/5 rounded-xl p-5 hover:scale-[1.01] transition-transform duration-200 cursor-pointer flex flex-col justify-between min-h-[180px] shadow-sm hover:shadow-md"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border bg-pink-50 border-pink-100 text-pink-600 dark:bg-pink-900/20 dark:border-pink-800">
            <Briefcase size={14} />
            悬赏
          </div>
          <span className="text-xs text-slate-400 font-mono">{formatTimeAgo(task.createdAt)}</span>
        </div>

        <h4 className="text-base font-medium leading-snug text-slate-800 dark:text-slate-100 line-clamp-2 mb-2">
          {task.title}
        </h4>

        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
          {task.description}
        </p>
      </div>

      <div className="flex items-end justify-between mt-4 pt-4 border-t border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Avatar seed={task.creatorUserHash} />
          <span className="text-xs text-slate-500 font-mono truncate max-w-[80px]">
            {task.creatorUserHash.substring(0, 8)}...
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleClick();
          }}
          disabled={!action || submitting}
          className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin inline-block" /> : actionLabel()}
        </button>
      </div>
    </div>
  );
}

// Product Card Component
function ProductCard({
  product,
  onOpen,
  onCreateOrder
}: {
  product: Product;
  onOpen: (product: Product) => void;
  onCreateOrder: (productId: string, stock: number, price: number) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  function formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return `${days}天前`;
  }

  return (
    <div
      onClick={() => onOpen(product)}
      className="group relative bg-white/50 dark:bg-[#1e1e1e]/50 backdrop-blur-md border border-black/5 dark:border-white/5 rounded-xl p-5 hover:scale-[1.01] transition-transform duration-200 cursor-pointer flex flex-col justify-between min-h-[180px] shadow-sm hover:shadow-md"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800">
            <ShoppingBag size={14} />
            商品
          </div>
          <span className="text-xs text-slate-400 font-mono">{formatTimeAgo(product.createdAt)}</span>
        </div>

        <h4 className="text-base font-medium leading-snug text-slate-800 dark:text-slate-100 line-clamp-2 mb-2">
          {product.title}
        </h4>

        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
          {product.description}
        </p>

        <div className="mt-2 text-xs text-slate-400">
          库存：{product.stock}
        </div>
      </div>

      <div className="flex items-end justify-between mt-4 pt-4 border-t border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Avatar seed={product.sellerUserHash} />
          <span className="text-xs text-slate-500 font-mono truncate max-w-[80px]">
            {product.sellerUserHash.substring(0, 8)}...
          </span>
        </div>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            setSubmitting(true);
            try {
              await onCreateOrder(product.productId, product.stock, product.price);
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={submitting || product.stock === 0}
          className="text-lg font-bold font-mono text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin inline-block" /> : `¥ ${product.price}`}
        </button>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  role,
  currentUserHash,
  onOpen,
  onAction
}: {
  order: Purchase;
  role: 'buyer' | 'seller';
  currentUserHash?: string;
  onOpen: (order: Purchase, role: 'buyer' | 'seller') => void;
  onAction: (
    action: 'seller_accept' | 'seller_deliver' | 'buyer_confirm',
    purchaseId: string
  ) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  function formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return `${days}天前`;
  }

  const title = order.productTitle || '订单';
  const description = order.productDescription || '';

  const canSellerAccept = role === 'seller' && order.status === 'pending';
  const canSellerDeliver = role === 'seller' && order.status === 'accepted';
  const canBuyerConfirm = role === 'buyer' && order.status === 'delivered';

  const action: 'seller_accept' | 'seller_deliver' | 'buyer_confirm' | null = canBuyerConfirm
    ? 'buyer_confirm'
    : canSellerDeliver
      ? 'seller_deliver'
      : canSellerAccept
        ? 'seller_accept'
        : null;

  const labelMap: Record<string, string> = {
    buyer_confirm: '确认',
    seller_deliver: '交付',
    seller_accept: '接单'
  };

  return (
    <div
      onClick={() => onOpen(order, role)}
      className="group relative bg-white/50 dark:bg-[#1e1e1e]/50 backdrop-blur-md border border-black/5 dark:border-white/5 rounded-xl p-5 hover:scale-[1.01] transition-transform duration-200 cursor-pointer flex flex-col justify-between min-h-[180px] shadow-sm hover:shadow-md"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800">
            <ShoppingBag size={14} />
            订单
          </div>
          <span className="text-xs text-slate-400 font-mono">{formatTimeAgo(order.createdAt)}</span>
        </div>

        <h4 className="text-base font-medium leading-snug text-slate-800 dark:text-slate-100 line-clamp-2 mb-2">
          {title}
        </h4>

        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
          {description}
        </p>

        <div className="mt-2 text-xs text-slate-400">
          数量：{order.quantity}，金额：{order.amount}，状态：{order.status}
        </div>
      </div>

      <div className="flex items-end justify-between mt-4 pt-4 border-t border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Avatar seed={role === 'buyer' ? order.sellerUserHash : order.buyerUserHash} />
          <span className="text-xs text-slate-500 font-mono truncate max-w-[80px]">
            {(role === 'buyer' ? order.sellerUserHash : order.buyerUserHash).substring(0, 8)}...
          </span>
        </div>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            if (!action) return;
            setSubmitting(true);
            try {
              await onAction(action, order.purchaseId);
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={!action || submitting || !currentUserHash}
          className="text-sm font-bold font-mono text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 size={16} className="animate-spin inline-block" /> : action ? labelMap[action] : '—'}
        </button>
      </div>
    </div>
  );
}

// Create Modal Component
function CreateModal({
  type,
  wallet,
  requestPin,
  showInfo,
  onClose,
  onSuccess
}: {
  type: TabType;
  wallet: WalletStorage | null;
  requestPin: () => Promise<string | null>;
  showInfo: (title: string, message: string) => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  if (typeof document === 'undefined') return null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [stock, setStock] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [deliveryInfo, setDeliveryInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!wallet) {
      setError('请先登录钱包');
      return;
    }

    if (!title || !description || !amount) {
      setError('请填写所有必填项');
      return;
    }

    if (type === 'products' && !stock) {
      setError('请填写库存数量');
      return;
    }

    setSubmitting(true);
    try {
      setError('');
      const userSecret = await requestPin();
      if (!userSecret) {
        setSubmitting(false);
        return;
      }

      if (type === 'tasks') {
        const { payload, headers } = await createSignedRequest(
          { title, description, rewardAmount: parseInt(amount, 10), contactInfo: contactInfo.trim() || undefined },
          wallet.userHash,
          userSecret
        );
        await createTask(payload, headers);
      } else {
        const { payload, headers } = await createSignedRequest(
          {
            title,
            description,
            price: parseInt(amount, 10),
            stock: parseInt(stock, 10),
            deliveryInfo: deliveryInfo.trim() || undefined
          },
          wallet.userHash,
          userSecret
        );
        await createProduct(payload, headers);
      }

      showInfo('发布成功', '已发布到广场');
      onSuccess();
    } catch (err: any) {
      setError(err?.message || '发布失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/35 backdrop-blur-md backdrop-saturate-150">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-white dark:bg-[#1e1e1e] rounded-2xl p-4 md:p-6 w-full max-w-[92vw] sm:max-w-md md:max-w-lg shadow-2xl max-h-[78vh] md:max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-4 md:mb-6 flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            发布{type === 'tasks' ? '任务' : '商品'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <form id="create-form" onSubmit={handleSubmit} className="space-y-3 md:space-y-4 overflow-y-auto flex-1 pr-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
              标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="简短描述..."
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
              描述 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细说明..."
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {type === 'tasks' && (
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
                联系方式（仅接单后可见）
              </label>
              <textarea
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="例如：微信/QQ/手机号/邮箱 + 平台备注（建议写清楚你在哪个平台）"
                rows={2}
                maxLength={300}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="mt-1 text-[11px] text-slate-400">
                {contactInfo.length}/300
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
              {type === 'tasks' ? '悬赏金额' : '价格'} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              step="0.01"
              min="0"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {type === 'products' && (
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
                库存 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                min="1"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {type === 'products' && (
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
                发货/取货信息（仅买卖双方可见）
              </label>
              <textarea
                value={deliveryInfo}
                onChange={(e) => setDeliveryInfo(e.target.value)}
                placeholder="例如：发货方式/网盘链接说明/取货地址/联系方式 + 平台备注"
                rows={2}
                maxLength={500}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="mt-1 text-[11px] text-slate-400">
                {deliveryInfo.length}/500
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </form>

        <div className="flex gap-3 pt-4 mt-4 border-t border-slate-200 dark:border-white/10 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            form="create-form"
            disabled={submitting}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>发布中...</span>
              </>
            ) : (
              '确认发布'
            )}
          </button>
        </div>
      </motion.div>
    </div>,
      document.body
    )
  );
}

function TaskDetailModal({
  task,
  currentUserHash,
  onClose,
  onReport,
  onAction
}: {
  task: Task;
  currentUserHash?: string;
  onClose: () => void;
  onReport: (taskId: string, title: string) => void;
  onAction: (taskId: string, action: 'accept' | 'submit' | 'confirm' | 'cancel' | 'reject' | 'delete') => Promise<void>;
}) {
  function shortHash(hash: string | undefined | null): string {
    const value = String(hash || '');
    if (!value) return '—';
    if (value.length <= 8) return value;
    return `${value.slice(0, 8)}...`;
  }

  const isCreator = !!currentUserHash && task.creatorUserHash === currentUserHash;
  const isAcceptor = !!currentUserHash && task.acceptorUserHash === currentUserHash;
  const canReport = !!currentUserHash && !isCreator;

  const actions: Array<{ key: 'accept' | 'submit' | 'confirm' | 'cancel' | 'reject' | 'delete'; label: string; tone: 'primary' | 'danger' | 'ghost' }> = [];

  if (task.status === 'open') {
    if (isCreator) actions.push({ key: 'delete', label: '删除任务', tone: 'danger' });
    if (currentUserHash && !isCreator) actions.push({ key: 'accept', label: `接单（￥${task.rewardAmount}）`, tone: 'primary' });
  }

  if (task.status === 'in_progress') {
    if (isAcceptor) {
      actions.push({ key: 'submit', label: '提交交付', tone: 'primary' });
      actions.push({ key: 'cancel', label: '取消接单', tone: 'ghost' });
    }
    if (isCreator) actions.push({ key: 'reject', label: '打回', tone: 'danger' });
  }

  if (task.status === 'submitted') {
    if (isCreator) {
      actions.push({ key: 'confirm', label: '确认结算', tone: 'primary' });
      actions.push({ key: 'reject', label: '打回', tone: 'danger' });
    }
    if (isAcceptor) actions.push({ key: 'cancel', label: '取消接单', tone: 'ghost' });
  }

  const statusLabel: Record<string, string> = {
    open: '未接单',
    in_progress: '已接单',
    submitted: '待确认',
    completed: '已完成',
    cancelled: '已取消'
  };

  return (
    <ModalShellWithClose title="任务详情" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900 dark:text-white break-words">{task.title}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10">{statusLabel[task.status] || task.status}</span>
              <span className="font-mono">￥{task.rewardAmount}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Avatar seed={task.creatorUserHash} className="w-7 h-7 rounded-full ring-1 ring-black/5 dark:ring-white/10" />
          </div>
        </div>

        <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
          {task.description}
        </div>

        <div className="rounded-xl border border-black/5 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 px-3 py-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">联系方式（仅接单后可见）</div>
          <div className="mt-1 text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">
            {task.contactInfo ? task.contactInfo : '未接单不可见 / 未填写'}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="rounded-lg border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2">
            <div className="text-[11px]">发布者</div>
            <div className="mt-0.5 font-mono text-slate-700 dark:text-slate-200">{shortHash(task.creatorUserHash)}</div>
          </div>
          <div className="rounded-lg border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2">
            <div className="text-[11px]">接单者</div>
            <div className="mt-0.5 font-mono text-slate-700 dark:text-slate-200">{shortHash(task.acceptorUserHash)}</div>
          </div>
        </div>

        {actions.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            {actions.map((a) => {
              const base =
                a.tone === 'primary'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : a.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10';

              return (
                <button
                  key={a.key}
                  onClick={() => void onAction(task.taskId, a.key)}
                  className={`w-full sm:flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${base}`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        )}

        {canReport && (
          <button
            onClick={() => onReport(task.taskId, task.title)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
          >
            举报/申诉
          </button>
        )}
      </div>
    </ModalShellWithClose>
  );
}

function ProductDetailModal({
  product,
  currentUserHash,
  onClose,
  onReport,
  onCreateOrder,
  onTakeDown
}: {
  product: Product;
  currentUserHash?: string;
  onClose: () => void;
  onReport: (productId: string, title: string) => void;
  onCreateOrder: (productId: string, stock: number, price: number) => Promise<void>;
  onTakeDown: (productId: string) => Promise<void>;
}) {
  function shortHash(hash: string | undefined | null): string {
    const value = String(hash || '');
    if (!value) return '—';
    if (value.length <= 8) return value;
    return `${value.slice(0, 8)}...`;
  }

  const isSeller = !!currentUserHash && product.sellerUserHash === currentUserHash;
  const canBuy = !!currentUserHash && !isSeller && product.stock > 0;
  const canReport = !!currentUserHash && !isSeller;

  return (
    <ModalShellWithClose title="商品详情" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900 dark:text-white break-words">{product.title}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
              <span className="font-mono">￥{product.price}</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10">剩余 {product.stock}</span>
            </div>
          </div>
          <Avatar seed={product.sellerUserHash} className="w-7 h-7 rounded-full ring-1 ring-black/5 dark:ring-white/10" />
        </div>

        <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
          {product.description}
        </div>

        <div className="rounded-xl border border-black/5 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 px-3 py-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">发货/取货信息</div>
          <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
            购买后自动显示（订单详情可反复查看），已购买商品不支持取消。
          </div>
        </div>

        <div className="rounded-lg border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="text-[11px]">卖家</div>
          <div className="mt-0.5 font-mono text-slate-700 dark:text-slate-200">{shortHash(product.sellerUserHash)}</div>
        </div>

        {canBuy && (
          <button
            onClick={() => void onCreateOrder(product.productId, product.stock, product.price)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            下单购买
          </button>
        )}

        {canReport && (
          <button
            onClick={() => onReport(product.productId, product.title)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
          >
            举报/申诉
          </button>
        )}

        {!currentUserHash && (
          <div className="text-xs text-slate-500 dark:text-slate-400">登录后可下单购买。</div>
        )}
        {isSeller && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">这是你发布的商品。</div>
            {product.status !== 'removed' && (
              <button
                onClick={() => void onTakeDown(product.productId)}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors"
              >
                下架商品
              </button>
            )}
            {product.status === 'removed' && (
              <div className="text-xs text-rose-600 dark:text-rose-200">该商品已下架，广场将不再展示。</div>
            )}
          </div>
        )}
      </div>
    </ModalShellWithClose>
  );
}

function OrderDetailModal({
  order,
  role,
  currentUserHash,
  onClose,
  onAction
}: {
  order: Purchase;
  role: 'buyer' | 'seller';
  currentUserHash?: string;
  onClose: () => void;
  onAction: (action: 'seller_accept' | 'seller_deliver' | 'buyer_confirm', purchaseId: string) => Promise<void>;
}) {
  function shortHash(hash: string | undefined | null): string {
    const value = String(hash || '');
    if (!value) return '—';
    if (value.length <= 8) return value;
    return `${value.slice(0, 8)}...`;
  }

  const title = order.productTitle || '订单';
  const description = order.productDescription || '';

  const canSellerAccept = role === 'seller' && order.status === 'pending';
  const canSellerDeliver = role === 'seller' && order.status === 'accepted';
  const canBuyerConfirm = role === 'buyer' && order.status === 'delivered';

  const action: 'seller_accept' | 'seller_deliver' | 'buyer_confirm' | null = canBuyerConfirm
    ? 'buyer_confirm'
    : canSellerDeliver
      ? 'seller_deliver'
      : canSellerAccept
        ? 'seller_accept'
        : null;

  const actionLabel: Record<string, string> = {
    seller_accept: '接单',
    seller_deliver: '标记交付',
    buyer_confirm: '确认收货'
  };

  return (
    <ModalShellWithClose title="订单详情" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900 dark:text-white break-words">{title}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10">状态：{order.status}</span>
              <span>数量：{order.quantity}</span>
              <span className="font-mono">金额：￥{order.amount}</span>
            </div>
          </div>
          <Avatar seed={role === 'buyer' ? order.sellerUserHash : order.buyerUserHash} className="w-7 h-7 rounded-full ring-1 ring-black/5 dark:ring-white/10" />
        </div>

        {description && (
          <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
            {description}
          </div>
        )}

        <div className="rounded-xl border border-black/5 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 px-3 py-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">发货/取货信息（订单可反复查看）</div>
          <div className="mt-1 text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">
            {order.deliveryInfo || '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">已购买商品不支持取消，如需处理请走流水申诉。</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="rounded-lg border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2">
            <div className="text-[11px]">买家</div>
            <div className="mt-0.5 font-mono text-slate-700 dark:text-slate-200">{shortHash(order.buyerUserHash)}</div>
          </div>
          <div className="rounded-lg border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2">
            <div className="text-[11px]">卖家</div>
            <div className="mt-0.5 font-mono text-slate-700 dark:text-slate-200">{shortHash(order.sellerUserHash)}</div>
          </div>
        </div>

        {action && (
          <button
            onClick={() => void onAction(action, order.purchaseId)}
            disabled={!currentUserHash}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLabel[action]}
          </button>
        )}
      </div>
    </ModalShellWithClose>
  );
}

function ModalShellWithClose({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/35 backdrop-blur-md backdrop-saturate-150">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-4 md:p-6 w-full max-w-[92vw] sm:max-w-md md:max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
            aria-label="关闭"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>,
    document.body
  );
}
