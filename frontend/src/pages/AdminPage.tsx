/**
 * 管理后台页面
 * 入口：/#/admin
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, LogOut, RefreshCw, Search, Shield, Ticket, Wallet2, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import {
  adminAdjustUser,
  adminChangePassword,
  adminCreateRedeemCode,
  adminDisableRedeemCode,
  adminGetReport,
  adminGetWebhookConfig,
  adminGetUser,
  adminHandleReport,
  adminListRecovery,
  adminListRedeemCodes,
  adminListReports,
  adminLogin,
  adminRecoverCase,
  adminTestWebhook,
  adminUpdateWebhookConfig
} from '../services/api';
import { ModalPortal } from '../components/ModalPortal';

type TabKey = 'txReports' | 'contentReports' | 'recovery' | 'users' | 'redeem' | 'settings';

function SegmentSelect<T extends string>({
  value,
  onChange,
  options
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-[#111]/50 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-transparent text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-white/10'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function shortHash(value: string | null | undefined): string {
  const s = String(value || '');
  if (!s) return '—';
  if (s.length <= 8) return s;
  return `${s.slice(0, 8)}…`;
}

function formatTimeSec(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN');
}

function badgeClass(status: string): string {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border';
  if (status === 'pending')
    return `${base} bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20`;
  if (status === 'reviewing')
    return `${base} bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:border-blue-500/20`;
  if (status === 'resolved')
    return `${base} bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20`;
  if (status === 'rejected')
    return `${base} bg-slate-50 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-200 dark:border-white/10`;
  return `${base} bg-slate-50 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-200 dark:border-white/10`;
}

function readStoredAdminToken(): string | null {
  try {
    return localStorage.getItem('adminToken');
  } catch {
    return null;
  }
}

function writeStoredAdminToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem('adminToken');
    else localStorage.setItem('adminToken', token);
  } catch {
    // ignore
  }
}

export function AdminPage() {
  const location = useLocation();
  const [token, setToken] = useState<string | null>(() => readStoredAdminToken());
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>('txReports');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [deepLink, setDeepLink] = useState<{
    tab?: TabKey;
    kind?: 'transaction' | 'content';
    reportId?: string;
  } | null>(null);

  const [loginPassword, setLoginPassword] = useState('');

  // 数据
  const [txReports, setTxReports] = useState<any[]>([]);
  const [contentReports, setContentReports] = useState<any[]>([]);
  const [recoveryCases, setRecoveryCases] = useState<any[]>([]);
  const [redeemCodes, setRedeemCodes] = useState<any[]>([]);

  // 处理交易举报
  const [selectedTxReport, setSelectedTxReport] = useState<any | null>(null);
  const [txAction, setTxAction] = useState<'resolve' | 'reject' | 'compensate'>('resolve');
  const [txNote, setTxNote] = useState('');
  const [victimUserHash, setVictimUserHash] = useState('');
  const [offenderUserHash, setOffenderUserHash] = useState('');
  const [compensateAmount, setCompensateAmount] = useState('0');

  // 处理内容举报
  const [selectedContentReport, setSelectedContentReport] = useState<any | null>(null);
  const [contentAction, setContentAction] = useState<
    'resolve' | 'reject' | 'take_down' | 'restore' | 'change_price' | 'cancel_task'
  >('resolve');
  const [contentNote, setContentNote] = useState('');
  const [newPrice, setNewPrice] = useState('0');

  // 扣回单（右侧详情）
  const [selectedRecoveryCase, setSelectedRecoveryCase] = useState<any | null>(null);

  // 移动端详情弹窗
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // 卡号处理
  const [queryUserHash, setQueryUserHash] = useState('');
  const [userInfo, setUserInfo] = useState<any | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // 兑换码
  const [newCode, setNewCode] = useState('');
  const [newCodeTitle, setNewCodeTitle] = useState('');
  const [newCodeValue, setNewCodeValue] = useState('10');
  const [newCodeMaxUses, setNewCodeMaxUses] = useState('');
  const [newCodeExpiresAt, setNewCodeExpiresAt] = useState('');

  // 设置
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecretInput, setWebhookSecretInput] = useState('');
  const [webhookHasSecret, setWebhookHasSecret] = useState(false);
  const [webhookLoaded, setWebhookLoaded] = useState(false);

  const tabs = useMemo(
    () =>
      [
        { key: 'txReports', label: '交易申诉/举报', icon: Shield },
        { key: 'contentReports', label: '任务/商品举报', icon: Shield },
        { key: 'recovery', label: '扣回单', icon: RefreshCw },
        { key: 'users', label: '卡号处理', icon: Wallet2 },
        { key: 'redeem', label: '兑换码', icon: Ticket },
        { key: 'settings', label: '设置', icon: KeyRound }
      ] as Array<{ key: TabKey; label: string; icon: any }>,
    []
  );

  useEffect(() => {
    writeStoredAdminToken(token);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (tab !== 'settings') return;
    if (webhookLoaded) return;

    setBusy(true);
    adminGetWebhookConfig(token)
      .then((cfg) => {
        setWebhookUrl(String(cfg?.webhookUrl || ''));
        setWebhookHasSecret(Boolean(cfg?.hasSecret));
        setWebhookLoaded(true);
      })
      .catch((e) => {
        showErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token, webhookLoaded]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const tabParam = params.get('tab');
    const reportId = params.get('reportId');

    const allowedTabs: TabKey[] = ['txReports', 'contentReports', 'recovery', 'users', 'redeem', 'settings'];
    const desiredTab = tabParam && allowedTabs.includes(tabParam as TabKey) ? (tabParam as TabKey) : null;

    if (desiredTab) setTab(desiredTab);

    if (reportId) {
      setDeepLink({
        tab: desiredTab || undefined,
        kind: desiredTab === 'contentReports' ? 'content' : 'transaction',
        reportId
      });
    } else {
      setDeepLink(null);
    }
  }, [location.search]);

  function clearReportIdParam() {
    try {
      const href = String(window.location?.href || '');
      if (!href) return;
      const url = new URL(href);

      // HashRouter: query often lives in hash, e.g. /#/admin?tab=...&reportId=...
      if (url.hash && url.hash.includes('?')) {
        const [hashPath, hashQuery = ''] = url.hash.split('?');
        const params = new URLSearchParams(hashQuery);
        if (!params.has('reportId')) return;
        params.delete('reportId');
        url.hash = params.toString() ? `${hashPath}?${params.toString()}` : hashPath;
        window.history.replaceState(null, '', url.toString());
        return;
      }

      if (url.searchParams.has('reportId')) {
        url.searchParams.delete('reportId');
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // ignore
    }
  }

  function showOk(text: string) {
    setToast({ type: 'ok', text });
    window.setTimeout(() => setToast(null), 2600);
  }
  function showErr(text: string) {
    setToast({ type: 'err', text });
    window.setTimeout(() => setToast(null), 3600);
  }

  async function doSaveWebhook() {
    if (!token) return;
    setBusy(true);
    try {
      const payload: { webhookUrl?: string; secret?: string } = { webhookUrl: webhookUrl.trim() };
      const secret = webhookSecretInput.trim();
      if (secret) payload.secret = secret;
      const next = await adminUpdateWebhookConfig(payload, token);
      setWebhookUrl(String(next?.webhookUrl || ''));
      setWebhookHasSecret(Boolean(next?.hasSecret));
      setWebhookSecretInput('');
      showOk('Webhook 设置已保存');
    } catch (e) {
      showErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doClearWebhookSecret() {
    if (!token) return;
    setBusy(true);
    try {
      const next = await adminUpdateWebhookConfig({ secret: '' }, token);
      setWebhookUrl(String(next?.webhookUrl || ''));
      setWebhookHasSecret(Boolean(next?.hasSecret));
      setWebhookSecretInput('');
      showOk('签名密钥已清除');
    } catch (e) {
      showErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doTestWebhook() {
    if (!token) return;
    setBusy(true);
    try {
      const result = await adminTestWebhook(token);
      if (result.ok) showOk('测试卡片已发送（请到飞书群查看）');
      else showErr(`测试发送失败：${result.error || result.responseSnippet || 'unknown error'}`);
    } catch (e) {
      showErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const toastNode = toast ? (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[220] w-[min(520px,calc(100vw-24px))]">
      <div
        className={`text-sm rounded-xl px-4 py-3 border shadow-lg backdrop-blur-xl ${
          toast.type === 'ok'
            ? 'bg-emerald-50/90 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20'
            : 'bg-rose-50/90 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-500/20'
        }`}
      >
        {toast.text}
      </div>
    </div>
  ) : null;

  function deriveTxParties(r: any): { victim: string; offender: string } {
    const from = String(r?.from_user_hash || r?.fromUserHash || '').trim();
    const to = String(r?.to_user_hash || r?.toUserHash || '').trim();
    const reporter = String(r?.reporter_user_hash || r?.reporterUserHash || '').trim();

    const victim = reporter || from || to;
    const offender = victim === from ? to : victim === to ? from : from || to;
    return { victim, offender };
  }

  function selectTxReport(r: any, opts?: { openMobile?: boolean }) {
    setSelectedTxReport(r);
    setSelectedContentReport(null);
    setSelectedRecoveryCase(null);
    setTxAction('resolve');
    setTxNote(r?.admin_note || '');
    const { victim, offender } = deriveTxParties(r);
    setVictimUserHash(victim);
    setOffenderUserHash(offender);
    setCompensateAmount(String(r?.tx_amount ?? r?.amount ?? 0));
    if (opts?.openMobile) setMobileDetailOpen(true);
  }

  async function refreshCurrent() {
    if (!token) return;
    try {
      setBusy(true);
      if (tab === 'txReports') {
        const list = await adminListReports({ kind: 'transaction', page: 1, limit: 50 }, token);
        setTxReports(list.data || []);
      } else if (tab === 'contentReports') {
        const list = await adminListReports({ kind: 'content', page: 1, limit: 50 }, token);
        setContentReports(list.data || []);
      } else if (tab === 'recovery') {
        const rows = await adminListRecovery({}, token);
        setRecoveryCases(Array.isArray(rows) ? rows : rows?.data || []);
      } else if (tab === 'redeem') {
        const rows = await adminListRedeemCodes(token);
        setRedeemCodes(Array.isArray(rows) ? rows : rows?.data || []);
      }
    } catch (e) {
      showErr(e instanceof Error ? e.message : '刷新失败');
      if (String((e as any)?.message || '').includes('401')) setToken(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void refreshCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  useEffect(() => {
    async function run() {
      if (!token || !deepLink?.reportId) return;

      const kind = deepLink.kind || (tab === 'contentReports' ? 'content' : 'transaction');
      if (tab !== 'txReports' && tab !== 'contentReports') return;
      if (kind === 'content' && tab !== 'contentReports') return;
      if (kind === 'transaction' && tab !== 'txReports') return;

      try {
        const r = await adminGetReport({ kind, reportId: deepLink.reportId }, token);
        if (kind === 'transaction') {
          const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
          selectTxReport(r, { openMobile: isMobile });
        } else {
          setSelectedContentReport(r);
          setSelectedTxReport(null);
          setSelectedRecoveryCase(null);
        }
        clearReportIdParam();
      } catch (e) {
        showErr(e instanceof Error ? e.message : '无法定位该记录');
      } finally {
        setDeepLink(null);
      }
    }

    void run();
  }, [token, tab, deepLink]);

  async function doLogin() {
    try {
      setBusy(true);
      const result = await adminLogin(loginPassword);
      setToken(result.token);
      setLoginPassword('');
      showOk('登录成功');
    } catch (e) {
      showErr(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  function doLogout() {
    setToken(null);
    setSelectedTxReport(null);
    setSelectedContentReport(null);
    setUserInfo(null);
    showOk('已退出');
  }

  async function doHandleTxReport() {
    if (!token || !selectedTxReport) return;
    try {
      setBusy(true);
      const reportId = selectedTxReport.report_id || selectedTxReport.reportId;
      if (!reportId) throw new Error('reportId 缺失');

      if (txAction === 'compensate') {
        const amount = Number(compensateAmount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('补偿金额无效');
        if (!victimUserHash.trim() || !offenderUserHash.trim()) throw new Error('请填写双方卡号');

        await adminHandleReport(
          {
            kind: 'transaction',
            reportId,
            action: 'compensate',
            victimUserHash: victimUserHash.trim(),
            offenderUserHash: offenderUserHash.trim(),
            amount,
            adminNote: txNote || ''
          },
          token
        );
      } else {
        await adminHandleReport({ kind: 'transaction', reportId, action: txAction, adminNote: txNote || '' }, token);
      }

      showOk('已处理');
      clearReportIdParam();
      setMobileDetailOpen(false);
      setSelectedTxReport(null);
      await refreshCurrent();
    } catch (e) {
      showErr(e instanceof Error ? e.message : '处理失败');
    } finally {
      setBusy(false);
    }
  }

  async function doHandleContentReport() {
    if (!token || !selectedContentReport) return;
    try {
      setBusy(true);
      const reportId = selectedContentReport.report_id || selectedContentReport.reportId;
      const targetType = selectedContentReport.target_type || selectedContentReport.targetType;
      if (!reportId) throw new Error('reportId 缺失');

      const payload: any = { kind: 'content', reportId, action: contentAction, adminNote: contentNote || '' };
      if (contentAction === 'change_price') {
        if (String(targetType) !== 'product') throw new Error('改价仅支持商品');
        const price = Number(newPrice);
        if (!Number.isFinite(price) || price <= 0) throw new Error('新价格无效');
        payload.newPrice = price;
      }

      await adminHandleReport(payload, token);
      showOk('已处理');
      clearReportIdParam();
      setMobileDetailOpen(false);
      setSelectedContentReport(null);
      await refreshCurrent();
    } catch (e) {
      showErr(e instanceof Error ? e.message : '处理失败');
    } finally {
      setBusy(false);
    }
  }

  async function doRecover(caseId: string) {
    if (!token) return;
    try {
      setBusy(true);
      await adminRecoverCase({ caseId }, token);
      showOk('已扣回');
      await refreshCurrent();
    } catch (e) {
      showErr(e instanceof Error ? e.message : '扣回失败');
    } finally {
      setBusy(false);
    }
  }

  async function doQueryUser() {
    if (!token) return;
    try {
      setBusy(true);
      const result = await adminGetUser({ userHash: queryUserHash.trim() }, token);
      setUserInfo(result);
    } catch (e) {
      showErr(e instanceof Error ? e.message : '查询失败');
    } finally {
      setBusy(false);
    }
  }

  async function doAdjustUser() {
    if (!token) return;
    try {
      setBusy(true);
      const delta = Number(adjustDelta);
      if (!Number.isFinite(delta) || delta === 0) throw new Error('请输入有效的加减数值');
      await adminAdjustUser({ userHash: queryUserHash.trim(), delta, reason: adjustReason || undefined }, token);
      showOk('已写入流水');
      setAdjustDelta('');
      await doQueryUser();
    } catch (e) {
      showErr(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function doCreateRedeem() {
    if (!token) return;
    try {
      setBusy(true);
      const value = Number(newCodeValue);
      if (!Number.isFinite(value) || value <= 0) throw new Error('兑换值无效');

      const maxUses = newCodeMaxUses.trim() ? Number(newCodeMaxUses) : undefined;
      if (newCodeMaxUses.trim() && (!Number.isFinite(maxUses) || (maxUses as number) <= 0)) {
        throw new Error('最多使用次数无效');
      }

      let expiresAt: number | undefined;
      if (newCodeExpiresAt.trim()) {
        // Expect: YYYY-MM-DD HH:mm:ss (24h, leading zeros)
        const m = newCodeExpiresAt.trim().match(
          /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
        );
        if (!m) throw new Error('有效期格式需为 YYYY-MM-DD HH:mm:ss');
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        const hh = Number(m[4]);
        const mm = Number(m[5]);
        const ss = Number(m[6]);
        const dt = new Date(y, mo - 1, d, hh, mm, ss);
        // Validate exact match (avoid JS Date auto-fix like 2026-13-99)
        if (
          dt.getFullYear() !== y ||
          dt.getMonth() !== mo - 1 ||
          dt.getDate() !== d ||
          dt.getHours() !== hh ||
          dt.getMinutes() !== mm ||
          dt.getSeconds() !== ss
        ) {
          throw new Error('有效期日期无效');
        }
        expiresAt = Math.floor(dt.getTime() / 1000);
      }

      await adminCreateRedeemCode(
        {
          code: newCode.trim(),
          title: newCodeTitle.trim() || undefined,
          value,
          maxUses,
          expiresAt
        },
        token
      );

      showOk('已创建兑换码');
      setNewCode('');
      setNewCodeTitle('');
      await refreshCurrent();
    } catch (e) {
      showErr(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  async function doDisableRedeem(codeHash: string) {
    if (!token) return;
    try {
      setBusy(true);
      await adminDisableRedeemCode({ codeHash }, token);
      showOk('已禁用');
      await refreshCurrent();
    } catch (e) {
      showErr(e instanceof Error ? e.message : '禁用失败');
    } finally {
      setBusy(false);
    }
  }

  async function doChangePassword() {
    if (!token) return;
    try {
      setBusy(true);
      await adminChangePassword({ newPassword: newAdminPassword }, token);
      setNewAdminPassword('');
      showOk('密码已更新');
    } catch (e) {
      showErr(e instanceof Error ? e.message : '更新失败');
    } finally {
      setBusy(false);
    }
  }

  const isTxTab = tab === 'txReports';
  const isContentTab = tab === 'contentReports';
  const isRecoveryTab = tab === 'recovery';
  const isUsersTab = tab === 'users';
  const isRedeemTab = tab === 'redeem';
  const isSettingsTab = tab === 'settings';
  const showRightPane = isTxTab || isContentTab || isRecoveryTab;

  function clearSelection() {
    setSelectedTxReport(null);
    setSelectedContentReport(null);
    setSelectedRecoveryCase(null);
    setMobileDetailOpen(false);
  }

  useEffect(() => {
    setMobileDetailOpen(false);
    setSelectedRecoveryCase(null);
    setSelectedTxReport(null);
    setSelectedContentReport(null);
  }, [tab]);

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4 flex items-center justify-center">
        {toastNode}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-white/30 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-xl p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white dark:text-slate-900" />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">管理后台</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">默认初始密码：admin</div>
            </div>
          </div>

          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">管理密码</label>
          <input
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            type="password"
            placeholder="请输入管理密码"
            className="w-full px-4 py-3 rounded-xl bg-white/80 dark:bg-[#111]/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            onClick={() => void doLogin()}
            disabled={busy || !loginPassword}
            className="mt-4 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                登录中…
              </span>
            ) : (
              '进入管理后台'
            )}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {toastNode}
      <div className="mx-auto max-w-6xl p-3 md:p-4">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4">
          <aside className="md:w-[280px] flex-shrink-0">
            <div className="rounded-2xl border border-white/30 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-xl p-3">
              <div className="flex items-center justify-between px-2 py-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  <div className="text-sm font-bold text-slate-800 dark:text-white">后台</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void refreshCurrent()}
                    className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
                    aria-label="刷新"
                  >
                    <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-slate-300 ${busy ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={doLogout}
                    className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
                    aria-label="退出"
                  >
                    <LogOut className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 md:grid-cols-1 gap-2">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`w-full px-3 py-2 rounded-xl text-left text-sm font-medium transition-colors border ${
                      tab === t.key
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white/60 dark:bg-white/5 text-slate-700 dark:text-slate-200 border-black/5 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <t.icon className="w-4 h-4" />
                      <span className="truncate">{t.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0 relative">
            <div className={showRightPane ? 'lg:pr-[440px]' : ''}>
              <div className="rounded-2xl border border-white/30 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-bold text-slate-900 dark:text-white">{tabs.find((t) => t.key === tab)?.label}</div>
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    处理中…
                  </div>
                )}
              </div>

              {isTxTab ? (
                <div className="space-y-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    交易举报处理：支持驳回、结案、先补偿申诉/举报用户（生成扣回单，后续再从对方扣回，可扣成负数）。
                  </div>
                  <div className="space-y-2">
                    {txReports.map((r) => (
                      <button
                        key={r.report_id || r.reportId}
                        onClick={() => {
                          const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
                          selectTxReport(r, { openMobile: isMobile });
                        }}
                        className="w-full text-left rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {r.tx_title || '交易'}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                              <span className={badgeClass(r.status)}>{r.status}</span>
                              <span className="font-mono">tx:{shortHash(r.tx_id)}</span>
                              <span className="font-mono">¥{r.tx_amount ?? '—'}</span>
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-400">{formatTimeSec(r.created_at)}</div>
                        </div>
                      </button>
                    ))}
                    {txReports.length === 0 && (
                      <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">暂无记录</div>
                    )}
                  </div>

                  {false && selectedTxReport && (
                    <div className="mt-4 rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4">
                      <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                        处理：{selectedTxReport.report_id || selectedTxReport.reportId}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">操作</label>
                          <SegmentSelect
                            value={txAction}
                            onChange={setTxAction as any}
                            options={[
                              { value: 'resolve', label: '结案' },
                              { value: 'reject', label: '驳回' },
                              { value: 'compensate', label: '补偿' }
                            ]}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">处理备注（可选）</label>
                          <input
                            value={txNote}
                            onChange={(e) => setTxNote(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                            placeholder="会写入举报记录"
                          />
                        </div>
                      </div>

                      {txAction === 'compensate' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">申诉/举报用户卡号</label>
                            <input
                              value={victimUserHash}
                              onChange={(e) => setVictimUserHash(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm font-mono"
                              placeholder="user_hash"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">被扣回用户卡号</label>
                            <input
                              value={offenderUserHash}
                              onChange={(e) => setOffenderUserHash(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm font-mono"
                              placeholder="user_hash"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">补偿金额</label>
                            <input
                              value={compensateAmount}
                              onChange={(e) => setCompensateAmount(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                              inputMode="numeric"
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col md:flex-row gap-2 mt-4">
                        <button
                          onClick={() => void doHandleTxReport()}
                          disabled={busy}
                          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
                        >
                          提交处理
                        </button>
                        <button
                          onClick={() => setSelectedTxReport(null)}
                          className="flex-1 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {isContentTab ? (
                    <div className="space-y-3">
                      <div className="text-xs text-slate-500 dark:text-slate-400">任务/商品举报：支持下架、恢复、改价、任务取消等。</div>
                      <div className="space-y-2">
                        {contentReports.map((r) => (
                          <button
                            key={r.report_id || r.reportId}
                            onClick={() => {
                              setSelectedContentReport(r);
                              setSelectedTxReport(null);
                              setSelectedRecoveryCase(null);
                              setContentAction('resolve');
                              setContentNote(r.admin_note || '');
                              setNewPrice(String(r.target_price ?? 0));
                              setMobileDetailOpen(true);
                            }}
                            className="w-full text-left rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  {r.target_title || `${r.target_type}:${shortHash(r.target_id)}`}
                                </div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                                  <span className={badgeClass(r.status)}>{r.status}</span>
                                  <span className="font-mono">{r.target_type}:{shortHash(r.target_id)}</span>
                                  {r.target_type === 'product' && <span className="font-mono">¥{r.target_price ?? '—'}</span>}
                                </div>
                              </div>
                              <div className="text-[11px] text-slate-400">{formatTimeSec(r.created_at)}</div>
                            </div>
                          </button>
                        ))}
                        {contentReports.length === 0 && (
                          <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">暂无记录</div>
                        )}
                      </div>

                      {false && selectedContentReport && (
                        <div className="mt-4 rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4">
                          <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                            处理：{selectedContentReport.report_id || selectedContentReport.reportId}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">操作</label>
                              <SegmentSelect
                                value={contentAction as any}
                                onChange={setContentAction as any}
                                options={[
                                  { value: 'resolve', label: '结案' },
                                  { value: 'reject', label: '驳回' },
                                  { value: 'take_down', label: '下架' }
                                ]}
                              />
                              <div className="mt-2">
                                <SegmentSelect
                                  value={contentAction as any}
                                  onChange={setContentAction as any}
                                  options={[
                                    { value: 'restore', label: '恢复' },
                                    { value: 'change_price', label: '改价' },
                                    { value: 'cancel_task', label: '取消任务' }
                                  ]}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">处理备注（可选）</label>
                              <input
                                value={contentNote}
                                onChange={(e) => setContentNote(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                                placeholder="会写入举报记录"
                              />
                            </div>
                          </div>

                          {contentAction === 'change_price' && (
                            <div className="mt-3">
                              <label className="block text-xs text-slate-500 mb-1">新价格</label>
                              <input
                                value={newPrice}
                                onChange={(e) => setNewPrice(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                                inputMode="numeric"
                              />
                            </div>
                          )}

                          <div className="flex flex-col md:flex-row gap-2 mt-4">
                            <button
                              onClick={() => void doHandleContentReport()}
                              disabled={busy}
                              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
                            >
                              提交处理
                            </button>
                            <button
                              onClick={() => setSelectedContentReport(null)}
                              className="flex-1 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    isRecoveryTab ? (
                      <div className="space-y-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">扣回单：补偿后生成，可从对方扣成负数。</div>
                        <div className="space-y-2">
                          {recoveryCases.map((c) => (
                            <div
                              key={c.case_id || c.caseId}
                              onClick={() => {
                                setSelectedRecoveryCase(c);
                                setSelectedTxReport(null);
                                setSelectedContentReport(null);
                                setMobileDetailOpen(true);
                              }}
                              className="rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors px-3 py-3 cursor-pointer"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{c.case_id || c.caseId}</div>
                                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                                    <span className={badgeClass(c.status)}>{c.status}</span>
                                    <span className="font-mono">¥{c.amount}</span>
                                    <span className="font-mono">申诉/举报用户:{shortHash(c.victim_user_hash)}</span>
                                    <span className="font-mono">对方:{shortHash(c.offender_user_hash)}</span>
                                  </div>
                                </div>
                                <div className="text-[11px] text-slate-400">{formatTimeSec(c.created_at)}</div>
                              </div>
                              {false && c.status === 'open' && (
                                <button
                                  onClick={() => void doRecover(c.case_id || c.caseId)}
                                  disabled={busy}
                                  className="mt-3 w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors disabled:opacity-50"
                                >
                                  执行扣回
                                </button>
                              )}
                            </div>
                          ))}
                          {recoveryCases.length === 0 && (
                            <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">暂无记录</div>
                          )}
                        </div>
                      </div>
                    ) : isUsersTab ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2">
                            <label className="block text-xs text-slate-500 mb-1">卡号（user_hash）</label>
                            <input
                              value={queryUserHash}
                              onChange={(e) => setQueryUserHash(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm font-mono"
                              placeholder="输入 64 位卡号"
                            />
                          </div>
                          <div className="flex items-end">
                            <button
                              onClick={() => void doQueryUser()}
                              disabled={busy || !queryUserHash.trim()}
                              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
                            >
                              <span className="inline-flex items-center justify-center gap-2">
                                <Search className="w-4 h-4" />
                                查询
                              </span>
                            </button>
                          </div>
                        </div>

                        {userInfo && (
                          <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4">
                            <div className="text-sm font-bold text-slate-900 dark:text-white">余额：{userInfo.wallet?.balance ?? '—'}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              创建：{formatTimeSec(userInfo.wallet?.created_at)} · 最近：{formatTimeSec(userInfo.wallet?.last_active_at)}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">加/减积分（可负数）</label>
                                <input
                                  value={adjustDelta}
                                  onChange={(e) => setAdjustDelta(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                                  placeholder="例如：100 或 -50"
                                  inputMode="numeric"
                                />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs text-slate-500 mb-1">原因（可选）</label>
                                <input
                                  value={adjustReason}
                                  onChange={(e) => setAdjustReason(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                                  placeholder="写入流水备注"
                                />
                              </div>
                            </div>

                            <button
                              onClick={() => void doAdjustUser()}
                              disabled={busy || !adjustDelta.trim()}
                              className="mt-3 w-full py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-semibold transition-colors disabled:opacity-50"
                            >
                              写入流水并更新余额
                            </button>

                            <div className="mt-4">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">最近 50 条流水</div>
                              <div className="space-y-2">
                                {(userInfo.transactions || []).map((t: any) => (
                                  <div
                                    key={t.tx_id || t.txId}
                                    className="rounded-xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-2"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{t.title}</div>
                                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                                          <span className="font-mono">{t.type_name}</span>
                                          <span className="font-mono">¥{t.amount}</span>
                                          <span className="font-mono">tx:{shortHash(t.tx_id)}</span>
                                        </div>
                                      </div>
                                      <div className="text-[11px] text-slate-400">{formatTimeSec(t.created_at)}</div>
                                    </div>
                                  </div>
                                ))}
                                {(userInfo.transactions || []).length === 0 && (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">暂无记录</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : isRedeemTab ? (
                      <div className="space-y-4">
                          <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4">
                            <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">创建兑换码</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">兑换码（明文）</label>
                              <input
                                value={newCode}
                                onChange={(e) => setNewCode(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm font-mono"
                                placeholder="例如：SPRING2026"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">标题（可选）</label>
                              <input
                                value={newCodeTitle}
                                onChange={(e) => setNewCodeTitle(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                                placeholder="例如：迎新奖励"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">兑换值</label>
                              <input
                                value={newCodeValue}
                                onChange={(e) => setNewCodeValue(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                                inputMode="numeric"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">最多使用次数（可选）</label>
                              <input
                                value={newCodeMaxUses}
                                onChange={(e) => setNewCodeMaxUses(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                                inputMode="numeric"
                                placeholder="留空=不限"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs text-slate-500 mb-1">有效期（可选）</label>
                              <input
                                value={newCodeExpiresAt}
                                onChange={(e) => setNewCodeExpiresAt(e.target.value)}
                                inputMode="numeric"
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                                placeholder="YYYY-MM-DD HH:mm:ss（例如 2026-12-31 23:59:59）"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => void doCreateRedeem()}
                            disabled={busy || !newCode.trim()}
                            className="mt-3 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
                          >
                            创建
                          </button>
                        </div>

                        <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4">
                          <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">已创建的兑换码</div>
                          <div className="space-y-2">
                            {redeemCodes.map((c) => (
                              <div
                                key={c.code_hash}
                                className="rounded-xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{c.title || '兑换码'}</div>
                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                                      <span className={c.enabled ? badgeClass('resolved') : badgeClass('rejected')}>{c.enabled ? '启用' : '禁用'}</span>
                                      <span className="font-mono">{c.code_hint}</span>
                                      <span className="font-mono">¥{c.value}</span>
                                      <span className="font-mono">
                                        {c.used_count}/{c.max_uses || '∞'}
                                      </span>
                                    </div>
                                    {c.expires_at && <div className="mt-1 text-[11px] text-slate-400">到期：{formatTimeSec(c.expires_at)}</div>}
                                  </div>
                                  <button
                                    onClick={() => void doDisableRedeem(c.code_hash)}
                                    disabled={busy || !c.enabled}
                                    className="px-3 py-2 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
                                  >
                                    禁用
                                  </button>
                                </div>
                              </div>
                            ))}
                            {redeemCodes.length === 0 && (
                              <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">暂无记录</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : isSettingsTab ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4">
                          <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">修改管理密码（热更新）</div>
                          <label className="block text-xs text-slate-500 mb-1">新密码</label>
                          <input
                            value={newAdminPassword}
                            onChange={(e) => setNewAdminPassword(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                            type="password"
                            placeholder="4-64 位"
                          />
                          <button
                            onClick={() => void doChangePassword()}
                            disabled={busy || newAdminPassword.length < 4}
                            className="mt-3 w-full py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-semibold transition-colors disabled:opacity-50"
                          >
                            更新密码
                          </button>
                        </div>

                        <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4">
                          <div className="text-sm font-bold text-slate-900 dark:text-white mb-1">Webhook 通知（飞书机器人）</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                            保存后立即生效；未配置时会回退到 Vercel 环境变量（如 FEISHU_WEBHOOK_URL）。
                          </div>

                          <label className="block text-xs text-slate-500 mb-1">Webhook 地址</label>
                          <input
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                            placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                          />

                          <label className="mt-3 block text-xs text-slate-500 mb-1">签名密钥（可选）</label>
                          <input
                            value={webhookSecretInput}
                            onChange={(e) => setWebhookSecretInput(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                            type="password"
                            placeholder={webhookHasSecret ? '已设置（留空不修改，输入新值可覆盖）' : '未设置（留空不启用签名）'}
                            autoComplete="off"
                          />

                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                              onClick={() => void doSaveWebhook()}
                              disabled={busy}
                              className="py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-semibold transition-colors disabled:opacity-50"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => void doTestWebhook()}
                              disabled={busy || !webhookUrl.trim()}
                              className="py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
                            >
                              发送测试
                            </button>
                            <button
                              onClick={() => void doClearWebhookSecret()}
                              disabled={busy || !webhookHasSecret}
                              className="py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-rose-700 dark:text-rose-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
                            >
                              清除密钥
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-600 dark:text-slate-300">请选择左侧功能继续操作。</div>
                    )
                  )}
                </div>
              )}

              </div>
            </div>

            {showRightPane && (
              <aside className="hidden lg:block fixed top-6 right-6 w-[420px]">
                <div className="rounded-2xl border border-white/30 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">审批详情</div>
                    <button
                      onClick={clearSelection}
                      className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
                      aria-label="关闭"
                    >
                      <X className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                  </div>

                  {isTxTab ? (
                    selectedTxReport ? (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {selectedTxReport.tx_title || '交易'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                            <span className={badgeClass(selectedTxReport.status)}>{selectedTxReport.status}</span>
                            <span className="font-mono">tx:{shortHash(selectedTxReport.tx_id)}</span>
                            <span className="font-mono">¥{selectedTxReport.tx_amount ?? '—'}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <div className="flex items-center justify-between gap-2">
                              <span>付款方(from)</span>
                              <span className="font-mono">
                                {shortHash((selectedTxReport as any).from_user_hash || (selectedTxReport as any).fromUserHash)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>收款方(to)</span>
                              <span className="font-mono">
                                {shortHash((selectedTxReport as any).to_user_hash || (selectedTxReport as any).toUserHash)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>申诉/举报用户</span>
                              <span className="font-mono">
                                {shortHash(
                                  (selectedTxReport as any).reporter_user_hash || (selectedTxReport as any).reporterUserHash
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                            <div className="font-medium">理由</div>
                            <div className="mt-0.5">{selectedTxReport.reason}</div>
                          </div>
                          {selectedTxReport.description && (
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              <div className="font-medium text-slate-600 dark:text-slate-300">描述</div>
                              <div className="mt-0.5 whitespace-pre-wrap">{selectedTxReport.description}</div>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">操作</label>
                            <SegmentSelect
                              value={txAction}
                              onChange={setTxAction as any}
                              options={[
                                { value: 'resolve', label: '结案' },
                                { value: 'reject', label: '驳回' },
                                { value: 'compensate', label: '补偿' }
                              ]}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">处理备注（可选）</label>
                            <input
                              value={txNote}
                              onChange={(e) => setTxNote(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                              placeholder="会写入举报记录"
                            />
                          </div>
                        </div>

                        {txAction === 'compensate' && (
                          <div className="grid grid-cols-1 gap-3">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">申诉/举报用户卡号（默认=举报人）</label>
                              <input
                                value={victimUserHash}
                                onChange={(e) => setVictimUserHash(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">被扣回用户卡号（默认=交易另一方）</label>
                              <input
                                value={offenderUserHash}
                                onChange={(e) => setOffenderUserHash(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">补偿金额</label>
                              <input
                                value={compensateAmount}
                                onChange={(e) => setCompensateAmount(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                                inputMode="numeric"
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={() => void doHandleTxReport()}
                            disabled={busy}
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
                          >
                            提交处理
                          </button>
                          <button
                            onClick={clearSelection}
                            className="flex-1 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">点击左侧记录查看详情</div>
                    )
                  ) : isContentTab ? (
                    selectedContentReport ? (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {selectedContentReport.target_title ||
                              `${selectedContentReport.target_type}:${shortHash(selectedContentReport.target_id)}`}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                            <span className={badgeClass(selectedContentReport.status)}>{selectedContentReport.status}</span>
                            <span className="font-mono">
                              {selectedContentReport.target_type}:{shortHash(selectedContentReport.target_id)}
                            </span>
                          </div>
                          <div className="mt-2 rounded-lg border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 p-2">
                            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">对象信息</div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400">类型</span>
                                <span className="font-mono">{selectedContentReport.target_type || '—'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400">状态</span>
                                <span className="font-mono">{selectedContentReport.target_status || '—'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2 col-span-2">
                                <span className="text-slate-400">编号</span>
                                <span className="font-mono">{shortHash(selectedContentReport.target_id)}</span>
                              </div>
                              {(selectedContentReport.target_owner_user_hash || selectedContentReport.product_seller_user_hash) && (
                                <div className="flex items-center justify-between gap-2 col-span-2">
                                  <span className="text-slate-400">发布者</span>
                                  <span className="font-mono">
                                    {shortHash(selectedContentReport.target_owner_user_hash || selectedContentReport.product_seller_user_hash)}
                                  </span>
                                </div>
                              )}
                              {String(selectedContentReport.target_type) === 'product' && (
                                <>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-400">价格</span>
                                    <span className="font-mono">¥{selectedContentReport.target_price ?? '—'}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-400">库存</span>
                                    <span className="font-mono">{selectedContentReport.target_stock ?? '—'}</span>
                                  </div>
                                </>
                              )}
                              {String(selectedContentReport.target_type) === 'task' && selectedContentReport.task_reward_amount != null && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-slate-400">悬赏</span>
                                  <span className="font-mono">¥{selectedContentReport.task_reward_amount}</span>
                                </div>
                              )}
                              {String(selectedContentReport.target_type) === 'task' && selectedContentReport.task_acceptor_user_hash && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-slate-400">接单者</span>
                                  <span className="font-mono">{shortHash(selectedContentReport.task_acceptor_user_hash)}</span>
                                </div>
                              )}
                            </div>
                            {(selectedContentReport.target_title || selectedContentReport.target_description) && (
                              <div className="mt-2 rounded-lg border border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#111]/30 p-2">
                                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                                  标题与描述
                                </div>
                                {selectedContentReport.target_title && (
                                  <div className="text-[12px] font-semibold text-slate-900 dark:text-white truncate">
                                    {selectedContentReport.target_title}
                                  </div>
                                )}
                                {selectedContentReport.target_description && (
                                  <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-6 whitespace-pre-wrap">
                                    {selectedContentReport.target_description}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                            <div className="font-medium">理由</div>
                            <div className="mt-0.5">{selectedContentReport.reason}</div>
                          </div>
                          {selectedContentReport.description && (
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              <div className="font-medium text-slate-600 dark:text-slate-300">描述</div>
                              <div className="mt-0.5 whitespace-pre-wrap">{selectedContentReport.description}</div>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">操作</label>
                            <SegmentSelect
                              value={contentAction as any}
                              onChange={setContentAction as any}
                              options={[
                                { value: 'resolve', label: '结案' },
                                { value: 'reject', label: '驳回' },
                                { value: 'take_down', label: '下架' }
                              ]}
                            />
                            <div className="mt-2">
                              <SegmentSelect
                                value={contentAction as any}
                                onChange={setContentAction as any}
                                options={[
                                  { value: 'restore', label: '恢复' },
                                  { value: 'change_price', label: '改价' },
                                  { value: 'cancel_task', label: '取消任务' }
                                ]}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">处理备注（可选）</label>
                            <input
                              value={contentNote}
                              onChange={(e) => setContentNote(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                              placeholder="会写入举报记录"
                            />
                          </div>
                        </div>

                        {contentAction === 'change_price' && (
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">新价格</label>
                            <input
                              value={newPrice}
                              onChange={(e) => setNewPrice(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                              inputMode="numeric"
                            />
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={() => void doHandleContentReport()}
                            disabled={busy}
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
                          >
                            提交处理
                          </button>
                          <button
                            onClick={clearSelection}
                            className="flex-1 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">点击左侧记录查看详情</div>
                    )
                  ) : isRecoveryTab ? (
                    selectedRecoveryCase ? (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">{selectedRecoveryCase.case_id || selectedRecoveryCase.caseId}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                            <span className={badgeClass(selectedRecoveryCase.status)}>{selectedRecoveryCase.status}</span>
                            <span className="font-mono">¥{selectedRecoveryCase.amount}</span>
                            <span className="font-mono">申诉/举报用户:{shortHash(selectedRecoveryCase.victim_user_hash)}</span>
                            <span className="font-mono">对方:{shortHash(selectedRecoveryCase.offender_user_hash)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => void doRecover(selectedRecoveryCase.case_id || selectedRecoveryCase.caseId)}
                          disabled={busy || selectedRecoveryCase.status !== 'open'}
                          className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors disabled:opacity-50"
                        >
                          执行扣回
                        </button>
                        <button
                          onClick={clearSelection}
                          className="w-full py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
                        >
                          关闭
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">点击左侧扣回单查看详情</div>
                    )
                  ) : null}
                </div>
              </aside>
            )}

            {showRightPane && mobileDetailOpen && (selectedTxReport || selectedContentReport || selectedRecoveryCase) && (
              <ModalPortal>
              <div className="lg:hidden fixed inset-0 bg-black/30 backdrop-blur-xl backdrop-saturate-150 flex items-center justify-center p-4 z-[200]">
                <div className="w-full max-w-[92vw] sm:max-w-md rounded-2xl border border-white/30 dark:border-white/10 bg-white/80 dark:bg-[#1e1e1e]/80 backdrop-blur-xl shadow-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">审批详情</div>
                    <button
                      onClick={clearSelection}
                      className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
                      aria-label="关闭"
                    >
                      <X className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                  </div>
                  {/* 复用右侧面板内容：移动端只显示已选项 */}
                  {isTxTab && selectedTxReport && (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {selectedTxReport.tx_title || '交易'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                        <span className={badgeClass(selectedTxReport.status)}>{selectedTxReport.status}</span>
                        <span className="font-mono">tx:{shortHash(selectedTxReport.tx_id)}</span>
                            <span className="font-mono">¥{selectedTxReport.tx_amount ?? '—'}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <div className="flex items-center justify-between gap-2">
                              <span>付款方(from)</span>
                              <span className="font-mono">
                                {shortHash((selectedTxReport as any).from_user_hash || (selectedTxReport as any).fromUserHash)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>收款方(to)</span>
                              <span className="font-mono">
                                {shortHash((selectedTxReport as any).to_user_hash || (selectedTxReport as any).toUserHash)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>申诉/举报用户</span>
                              <span className="font-mono">
                                {shortHash(
                                  (selectedTxReport as any).reporter_user_hash || (selectedTxReport as any).reporterUserHash
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{selectedTxReport.reason}</div>
                      {selectedTxReport.description && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{selectedTxReport.description}</div>
                      )}
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">操作</label>
                          <SegmentSelect
                            value={txAction}
                            onChange={setTxAction as any}
                            options={[
                              { value: 'resolve', label: '结案' },
                              { value: 'reject', label: '驳回' },
                              { value: 'compensate', label: '补偿' }
                            ]}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">处理备注（可选）</label>
                          <input
                            value={txNote}
                            onChange={(e) => setTxNote(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                          />
                        </div>
                      </div>
                      {txAction === 'compensate' && (
                        <div className="grid grid-cols-1 gap-3">
                          <input
                            value={victimUserHash}
                            onChange={(e) => setVictimUserHash(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm font-mono"
                            placeholder="申诉/举报用户卡号（默认=举报人）"
                          />
                          <input
                            value={offenderUserHash}
                            onChange={(e) => setOffenderUserHash(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm font-mono"
                            placeholder="被扣回用户卡号（默认=交易另一方）"
                          />
                          <input
                            value={compensateAmount}
                            onChange={(e) => setCompensateAmount(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                            inputMode="numeric"
                            placeholder="补偿金额"
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => void doHandleTxReport()}
                          disabled={busy}
                          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
                        >
                          提交
                        </button>
                        <button
                          onClick={clearSelection}
                          className="flex-1 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                  )}

                  {isContentTab && selectedContentReport && (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {selectedContentReport.target_title ||
                          `${selectedContentReport.target_type}:${shortHash(selectedContentReport.target_id)}`}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                        <span className={badgeClass(selectedContentReport.status)}>{selectedContentReport.status}</span>
                        <span className="font-mono">
                          {selectedContentReport.target_type}:{shortHash(selectedContentReport.target_id)}
                        </span>
                      </div>
                      <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">对象信息</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">类型</span>
                            <span className="font-mono">{selectedContentReport.target_type || '—'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">状态</span>
                            <span className="font-mono">{selectedContentReport.target_status || '—'}</span>
                          </div>
                          {(selectedContentReport.target_owner_user_hash || selectedContentReport.product_seller_user_hash) && (
                            <div className="flex items-center justify-between gap-2 col-span-2">
                              <span className="text-slate-400">发布者</span>
                              <span className="font-mono">
                                {shortHash(selectedContentReport.target_owner_user_hash || selectedContentReport.product_seller_user_hash)}
                              </span>
                            </div>
                          )}
                          {String(selectedContentReport.target_type) === 'product' && (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400">价格</span>
                                <span className="font-mono">¥{selectedContentReport.target_price ?? '—'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400">库存</span>
                                <span className="font-mono">{selectedContentReport.target_stock ?? '—'}</span>
                              </div>
                            </>
                          )}
                          {String(selectedContentReport.target_type) === 'task' && selectedContentReport.task_reward_amount != null && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-slate-400">悬赏</span>
                              <span className="font-mono">¥{selectedContentReport.task_reward_amount}</span>
                            </div>
                          )}
                          {String(selectedContentReport.target_type) === 'task' && selectedContentReport.task_acceptor_user_hash && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-slate-400">接单者</span>
                              <span className="font-mono">{shortHash(selectedContentReport.task_acceptor_user_hash)}</span>
                            </div>
                          )}
                        </div>
                        {(selectedContentReport.target_title || selectedContentReport.target_description) && (
                          <div className="mt-3 rounded-lg border border-black/5 dark:border-white/10 bg-white/80 dark:bg-[#111]/30 p-2">
                            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">标题与描述</div>
                            {selectedContentReport.target_title && (
                              <div className="text-[12px] font-semibold text-slate-900 dark:text-white truncate">
                                {selectedContentReport.target_title}
                              </div>
                            )}
                            {selectedContentReport.target_description && (
                              <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-8 whitespace-pre-wrap">
                                {selectedContentReport.target_description}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{selectedContentReport.reason}</div>
                      {selectedContentReport.description && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{selectedContentReport.description}</div>
                      )}
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">操作</label>
                          <SegmentSelect
                            value={contentAction as any}
                            onChange={setContentAction as any}
                            options={[
                              { value: 'resolve', label: '结案' },
                              { value: 'reject', label: '驳回' },
                              { value: 'take_down', label: '下架' }
                            ]}
                          />
                          <div className="mt-2">
                            <SegmentSelect
                              value={contentAction as any}
                              onChange={setContentAction as any}
                              options={[
                                { value: 'restore', label: '恢复' },
                                { value: 'change_price', label: '改价' },
                                { value: 'cancel_task', label: '取消任务' }
                              ]}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">处理备注（可选）</label>
                          <input
                            value={contentNote}
                            onChange={(e) => setContentNote(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                          />
                        </div>
                      </div>
                      {contentAction === 'change_price' && (
                        <input
                          value={newPrice}
                          onChange={(e) => setNewPrice(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/60 text-sm"
                          inputMode="numeric"
                          placeholder="新价格"
                        />
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => void doHandleContentReport()}
                          disabled={busy}
                          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
                        >
                          提交
                        </button>
                        <button
                          onClick={clearSelection}
                          className="flex-1 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                  )}

                  {isRecoveryTab && selectedRecoveryCase && (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{selectedRecoveryCase.case_id || selectedRecoveryCase.caseId}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                        <span className={badgeClass(selectedRecoveryCase.status)}>{selectedRecoveryCase.status}</span>
                        <span className="font-mono">¥{selectedRecoveryCase.amount}</span>
                      </div>
                      <button
                        onClick={() => void doRecover(selectedRecoveryCase.case_id || selectedRecoveryCase.caseId)}
                        disabled={busy || selectedRecoveryCase.status !== 'open'}
                        className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors disabled:opacity-50"
                      >
                        执行扣回
                      </button>
                      <button
                        onClick={clearSelection}
                        className="w-full py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 font-semibold hover:bg-white/90 dark:hover:bg-white/15 transition-colors"
                      >
                        关闭
                      </button>
                    </div>
                  )}
                </div>
              </div>
              </ModalPortal>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
