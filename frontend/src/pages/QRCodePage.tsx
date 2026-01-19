/**
 * YourTJ Credit - 二维码/安全页面
 * 显示收款二维码和钱包安全设置
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Download, Key, QrCode as QrCodeIcon, Copy, Check, Lock } from 'lucide-react';
import { loadWallet, type WalletStorage } from '../utils/wallet-storage';
import { getWordlist } from '../services/wordlistService';
import { exportEncryptedWallet, generateQRCodeData, generateWallet } from '@shared/utils/wallet';
import QRCode from 'qrcode';

export function QRCodePage() {
  const [wallet, setWallet] = useState<WalletStorage | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonic, setMnemonic] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [bindQrDataUrl, setBindQrDataUrl] = useState<string>('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [messageModal, setMessageModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: ''
  });

  useEffect(() => {
    const localWallet = loadWallet();
    if (!localWallet) {
      console.error('No wallet found');
      return;
    }
    setWallet(localWallet);
  }, []);

  // 生成二维码
  useEffect(() => {
    if (wallet) {
      QRCode.toDataURL(wallet.userHash, {
        width: 280,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'M'
      }).then(url => {
        setQrDataUrl(url);
      }).catch(err => {
        console.error('QR Code generation error:', err);
      });
    }
  }, [wallet]);

  // 生成绑定二维码（仅在展示助记词后）
  useEffect(() => {
    if (!wallet || !showMnemonic || !mnemonic) {
      setBindQrDataUrl('');
      return;
    }

    const payload = generateQRCodeData(mnemonic, wallet.userHash);
    QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    }).then(url => {
      setBindQrDataUrl(url);
    }).catch(err => {
      console.error('Bind QR Code generation error:', err);
      setBindQrDataUrl('');
    });
  }, [wallet, showMnemonic, mnemonic]);

  // 复制 userHash
  async function handleCopy() {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.userHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  // 下载二维码
  function handleDownloadQR() {
    if (!qrDataUrl || !wallet) return;

    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `yourtj-wallet-qr-${wallet.userHash.substring(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // 导出加密密钥文件
  async function handleExportKeystore() {
    if (!wallet) return;

    // 获取助记词（需要从 localStorage 获取）
    const localWallet = loadWallet();
    if (!localWallet || !localWallet.mnemonic) {
      setMessageModal({ open: true, title: '导出失败', message: '无法获取助记词信息' });
      return;
    }

    setShowExportModal(true);
    setExportPassword('');
    setExportError('');
    setExporting(false);
  }

  async function handleConfirmExport() {
    if (!wallet) return;

    const localWallet = loadWallet();
    if (!localWallet || !localWallet.mnemonic) {
      setExportError('无法获取助记词信息');
      return;
    }

    if (!exportPassword || exportPassword.length < 6) {
      setExportError('密码至少需要 6 位');
      return;
    }

    setExporting(true);
    setExportError('');

    try {
      const encryptedData = await exportEncryptedWallet(localWallet.mnemonic, wallet.userHash, exportPassword);

      const blob = new Blob([encryptedData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yourtj-wallet-${wallet.userHash.substring(0, 8)}.key`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowExportModal(false);
      setExportPassword('');
      setMessageModal({ open: true, title: '导出成功', message: '密钥文件已导出，请妥善保管密码和文件。' });
    } catch (err) {
      console.error('Export keystore error:', err);
      setExportError('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }

  // 显示助记词（需要 PIN 验证）
  function handleShowMnemonic() {
    const studentId = localStorage.getItem('studentId') || '';
    const localWallet = loadWallet();
    if (!studentId && localWallet?.mnemonic) {
      setMnemonic(localWallet.mnemonic);
      setShowMnemonic(true);
      setShowPinModal(false);
      setMessageModal({
        open: true,
        title: '提示',
        message: '该钱包为扫码绑定导入，未保存学号信息，无法进行 PIN 二次校验；已直接显示助记词。'
      });
      return;
    }

    setShowMnemonic(true);
    setShowPinModal(true);
  }

  // 验证 PIN 并显示助记词
  async function handleVerifyPin() {
    if (!pin || pin.length < 6) {
      setPinError('PIN 码至少需要 6 位');
      return;
    }

    setLoading(true);
    setPinError('');

    try {
      // 从 localStorage 获取学号
      const studentId = localStorage.getItem('studentId') || '';
      if (!studentId) {
        const localWallet = loadWallet();
        if (localWallet?.mnemonic) {
          setMnemonic(localWallet.mnemonic);
          setShowPinModal(false);
          setPin('');
          setLoading(false);
          setMessageModal({
            open: true,
            title: '提示',
            message: '该钱包为扫码绑定导入，未保存学号信息，无法进行 PIN 二次校验；已直接显示助记词。'
          });
          return;
        }
        setPinError('无法获取助记词信息');
        setLoading(false);
        return;
      }

      const wordlist = await getWordlist();
      const keys = await generateWallet(studentId, pin, wordlist);

      // 验证生成的 userHash 是否匹配
      if (keys.userHash !== wallet?.userHash) {
        setPinError('PIN 码错误');
        setLoading(false);
        return;
      }

      setMnemonic(keys.mnemonic);
      setShowPinModal(false);
      setPin('');
    } catch (err) {
      console.error('Verify PIN error:', err);
      setPinError('验证失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  // 隐藏助记词
  function handleHideMnemonic() {
    setShowMnemonic(false);
    setMnemonic('');
    setPin('');
    setPinError('');
  }

  if (!wallet) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 md:pb-0">

      {/* 收款二维码 */}
      <section className="text-center space-y-4">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white shadow-lg">
          <QrCodeIcon size={24} />
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white">收款二维码</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          扫描此二维码向您的钱包转账
        </p>

        {/* 二维码容器 */}
        <div className="bg-white dark:bg-[#1e1e1e] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-lg">
          {qrDataUrl && (
            <div className="flex items-center justify-center mb-4">
              <img src={qrDataUrl} alt="Wallet QR Code" className="w-[280px] h-[280px] rounded-lg" />
            </div>
          )}

          {/* 钱包地址 */}
          <div className="mt-4 p-3 bg-slate-50 dark:bg-white/5 rounded-lg">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">钱包地址</div>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all">
                {wallet.userHash}
              </code>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded transition-colors"
              >
                {copied ? (
                  <Check size={16} className="text-green-600" />
                ) : (
                  <Copy size={16} className="text-slate-500" />
                )}
              </button>
            </div>
          </div>

          {/* 下载按钮 */}
          <button
            onClick={handleDownloadQR}
            className="mt-4 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Download size={18} />
            <span>下载二维码</span>
          </button>
        </div>
      </section>

      {/* 安全设置 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-slate-800 dark:text-white">
          <Key size={20} />
          <h3 className="text-lg font-bold">钱包安全</h3>
        </div>

        {/* 助记词显示 */}
        <div className="bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl p-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold uppercase text-slate-500 tracking-wider">助记词</span>
            <button
              onClick={showMnemonic ? handleHideMnemonic : handleShowMnemonic}
              className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-1.5 rounded-lg transition-colors"
            >
              {showMnemonic ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative min-h-[100px] flex items-center justify-center">
            {showMnemonic && mnemonic ? (
              <div className="w-full">
                <div className="flex flex-wrap gap-2 justify-center">
                  {mnemonic.split('-').map((word, idx) => (
                    <span
                      key={idx}
                      className="bg-gray-100 dark:bg-slate-800 border border-black/5 dark:border-white/5 px-3 py-1 rounded-full text-sm font-mono text-slate-700 dark:text-slate-300"
                    >
                      {idx + 1}. {word}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 bg-slate-100/50 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700">
                <span className="text-sm text-slate-500 font-medium">点击眼睛图标显示</span>
              </div>
            )}
          </div>

          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              注意：助记词是恢复钱包的唯一凭证，请妥善保管，切勿泄露给他人
            </p>
          </div>
        </div>

        {showMnemonic && mnemonic && bindQrDataUrl && (
          <div className="bg-white dark:bg-[#1e1e1e] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-lg text-center">
            <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-2">手机绑定二维码</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              使用手机端“扫码绑定”导入，此二维码包含助记词，请勿外泄
            </p>
            <div className="flex items-center justify-center">
              <img src={bindQrDataUrl} alt="Bind Wallet QR Code" className="w-[280px] h-[280px] rounded-lg" />
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={handleExportKeystore}
            className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 dark:bg-white dark:text-black text-white rounded-xl shadow-lg hover:opacity-90 transition-all active:scale-[0.98]"
          >
            <Download size={18} />
            <span className="font-medium">导出密钥文件</span>
          </button>
        </div>
      </section>

      {/* 安全提示 */}
      <section className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5">
        <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">安全提示</h4>
        <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1.5">
          <li>密钥在本地使用学号和 PIN 码生成，服务器无法获取</li>
          <li>助记词可用于恢复钱包，请务必备份并妥善保管</li>
          <li>导出的密钥文件包含公钥信息，不包含私钥</li>
          <li>切勿将助记词或 PIN 码告诉任何人</li>
        </ul>
      </section>

      {/* PIN 验证模态框 */}
      {showPinModal && (
        createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <Lock size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">验证 PIN 码</h3>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              为了保护您的钱包安全，查看助记词需要验证 PIN 码
            </p>

            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin()}
              placeholder="请输入 PIN 码"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              autoFocus
            />

            {pinError && (
              <p className="text-xs text-red-600 dark:text-red-400 mb-4">{pinError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPinModal(false);
                  setShowMnemonic(false);
                  setPin('');
                  setPinError('');
                }}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleVerifyPin}
                disabled={loading || !pin}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '验证中...' : '确认'}
              </button>
            </div>
          </div>
        </div>,
          document.body
        )
      )}

      {/* 导出密钥文件模态框 */}
      {showExportModal && (
        createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <Key size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">导出密钥文件</h3>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              请设置一个加密密码（至少 6 位），用于保护导出的密钥文件
            </p>

            <input
              type="password"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmExport()}
              placeholder="请输入加密密码"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              autoFocus
            />

            {exportError && <p className="text-xs text-red-600 dark:text-red-400 mb-4">{exportError}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setExportPassword('');
                  setExportError('');
                }}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmExport}
                disabled={exporting || !exportPassword}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? '导出中...' : '确认'}
              </button>
            </div>
          </div>
        </div>,
          document.body
        )
      )}

      {/* 信息提示模态框 */}
      {messageModal.open && (
        createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">{messageModal.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{messageModal.message}</p>
            <button
              onClick={() => setMessageModal({ open: false, title: '', message: '' })}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              确认
            </button>
          </div>
        </div>,
          document.body
        )
      )}
    </div>
  );
}
