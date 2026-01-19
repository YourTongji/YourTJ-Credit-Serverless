/**
 * AuthScreen 组件
 * 钱包登录/注册页面，支持4种导入模式：
 * 1. 学号+PIN登录（登录/注册）
 * 2. 助记词独立导入（不需要学号+PIN）
 * 3. 二维码扫描导入（手机版）
 * 4. 密钥文件导入（加密文件恢复）
 */

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Scan, ArrowRight, Eye, EyeOff, Key, FileKey, QrCode, Upload } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { restoreWalletFromMnemonic, importEncryptedWallet, parseQRCodeData } from '@shared/utils/wallet';
import { getWordlist } from '../services/wordlistService';
import { saveWallet } from '../utils/wallet-storage';
import type { Html5Qrcode } from 'html5-qrcode';
import termsMarkdown from '../legal/terms.md?raw';

type MarkdownBlock =
  | { type: 'h'; level: 1 | 2 | 3; text: string }
  | { type: 'hr' }
  | { type: 'ul'; indent: number; items: string[] }
  | { type: 'ol'; indent: number; items: Array<{ n: number; text: string }> }
  | { type: 'p'; text: string };

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const leadingSpaces = (raw.match(/^\s*/)?.[0]?.length ?? 0);
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const m = trimmed.match(/^(#{1,3})\s+(.*)$/);
      if (m) {
        const level = Math.min(3, m[1].length) as 1 | 2 | 3;
        blocks.push({ type: 'h', level, text: (m[2] || '').trim() });
        i += 1;
        continue;
      }
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (/^-\s+/.test(trimmed) || /^\s+-\s+/.test(raw)) {
      const items: string[] = [];
      const indent = Math.min(2, Math.floor(leadingSpaces / 2));
      while (i < lines.length) {
        const t = (lines[i] ?? '').trim();
        if (!t) break;
        if (!/^-\s+/.test(t)) break;
        items.push(t.replace(/^-+\s+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'ul', indent, items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed) || /^\s*\d+\.\s+/.test(raw)) {
      const items: Array<{ n: number; text: string }> = [];
      const indent = Math.min(2, Math.floor(leadingSpaces / 2));
      while (i < lines.length) {
        const t = (lines[i] ?? '').trim();
        if (!t) break;
        if (!/^\d+\.\s+/.test(t)) break;
        const m = t.match(/^(\d+)\.\s+(.*)$/);
        if (!m) break;
        items.push({ n: Number(m[1]), text: String(m[2] || '').trim() });
        i += 1;
      }
      blocks.push({ type: 'ol', indent, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const current = (lines[i] ?? '').trimEnd();
      const currentTrimmed = current.trim();
      if (!currentTrimmed) break;
      if (/^#{1,3}\s+/.test(currentTrimmed)) break;
      if (/^(-{3,}|\*{3,})\s*$/.test(currentTrimmed)) break;
      if (/^-\s+/.test(currentTrimmed)) break;
      if (/^\d+\.\s+/.test(currentTrimmed)) break;
      paragraphLines.push(currentTrimmed);
      i += 1;
    }
    blocks.push({ type: 'p', text: paragraphLines.join('\n') });
  }

  return blocks;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const s = String(text || '');
  const nodes: React.ReactNode[] = [];
  let buffer = '';
  let bold = false;
  let italic = false;
  let key = 0;

  function flush() {
    if (!buffer) return;
    let node: React.ReactNode = buffer;
    if (italic) node = <em key={`em-${key}`}>{node}</em>;
    if (bold) node = <strong key={`strong-${key}`}>{node}</strong>;
    nodes.push(node);
    buffer = '';
    key += 1;
  }

  for (let i = 0; i < s.length; i++) {
    if (s[i] === '*' && s[i + 1] === '*') {
      flush();
      bold = !bold;
      i += 1;
      continue;
    }
    if (s[i] === '*') {
      flush();
      italic = !italic;
      continue;
    }
    buffer += s[i];
  }
  flush();
  return nodes;
}

function isCenteredHeaderLine(text: string): boolean {
  const plain = String(text || '').replace(/\*/g, '').trim();
  return plain.startsWith('版本日期') && plain.includes('生效日期');
}

function isCenteredDisclaimerLine(text: string): boolean {
  const plain = String(text || '').replace(/\*/g, '').trim();
  return plain === 'YourTJ 社区运营团队保留对本声明的最终解释权。';
}

function renderWithColonLabel(text: string): React.ReactNode {
  const value = String(text || '');
  const idx = value.indexOf('：');
  if (idx <= 0) return <>{renderInlineMarkdown(value)}</>;
  const leftRaw = value.slice(0, idx).trim();
  const right = value.slice(idx + 1).trimStart();
  const leftPlain = leftRaw.replace(/\*/g, '').trim();

  // 仅对“短标签：内容”做标题化，避免误伤长句
  if (!leftPlain || leftPlain.length > 10 || /\s/.test(leftPlain)) return <>{renderInlineMarkdown(value)}</>;

  return (
    <>
      <span className="font-semibold text-slate-900 dark:text-white">{renderInlineMarkdown(leftRaw)}</span>
      <span className="text-slate-500 dark:text-slate-400">：</span>
      <span>{renderInlineMarkdown(right)}</span>
    </>
  );
}

const TERMS_BLOCKS = parseMarkdownBlocks(termsMarkdown);

function MarkdownView({ blocks }: { blocks: MarkdownBlock[] }) {
  return (
    <div className="space-y-3 [transform:translateZ(0)]">
      {blocks.map((b, idx) => {
        if (b.type === 'hr') {
          return <hr key={`hr-${idx}`} className="border-black/10 dark:border-white/10" />;
        }

        if (b.type === 'h') {
          const cls =
            b.level === 1
              ? 'text-sm md:text-base font-bold text-slate-900 dark:text-white text-center'
              : b.level === 2
                ? 'text-sm font-semibold text-slate-900 dark:text-white'
                : 'text-xs font-semibold text-slate-800 dark:text-slate-100';
          return (
            <div key={`h-${idx}`} className={cls}>
              {renderInlineMarkdown(b.text)}
            </div>
          );
        }

        if (b.type === 'ul') {
          const pl = b.indent > 0 ? 'pl-9' : 'pl-5';
          return (
            <ul
              key={`ul-${idx}`}
              className={`list-disc ${pl} space-y-1 text-xs text-slate-700 dark:text-slate-200 leading-relaxed break-words`}
            >
              {b.items.map((item, j) => (
                <li key={`ul-${idx}-${j}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        if (b.type === 'ol') {
          const pl = b.indent > 0 ? 'pl-9' : 'pl-5';
          const start = b.items.length > 0 ? b.items[0].n : 1;
          return (
            <ol
              key={`ol-${idx}`}
              start={start}
              className={`list-decimal ${pl} space-y-1 text-xs text-slate-700 dark:text-slate-200 leading-relaxed break-words`}
            >
              {b.items.map((item, j) => (
                <li key={`ol-${idx}-${j}`} value={item.n}>
                  {renderWithColonLabel(item.text)}
                </li>
              ))}
            </ol>
          );
        }

        const lines = b.text.split('\n').filter(Boolean);
        const centeredHeader = lines.length === 1 && isCenteredHeaderLine(lines[0]);
        const centeredDisclaimer = lines.length === 1 && isCenteredDisclaimerLine(lines[0]);
        return (
          <div
            key={`p-${idx}`}
            className={`text-xs leading-relaxed break-words space-y-1 ${
              centeredHeader
                ? 'text-center text-slate-600 dark:text-slate-300'
                : centeredDisclaimer
                  ? 'text-center text-slate-400 dark:text-slate-500'
                  : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {lines.map((line, j) => (
              <p
                key={`p-${idx}-${j}`}
                className={centeredHeader || centeredDisclaimer ? '' : 'indent-[2em]'}
              >
                {centeredDisclaimer ? line.replace(/\*/g, '').trim() : renderInlineMarkdown(line)}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface AuthScreenProps {
  onLogin: (studentId: string, pin: string) => Promise<void>;
}

type AuthMode = 'login' | 'mnemonic' | 'qrcode' | 'file';

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [studentId, setStudentId] = useState('');
  const [pin, setPin] = useState('');
  const [mnemonicWords, setMnemonicWords] = useState(['', '', '']);  // 三个独立的词
  const [filePassword, setFilePassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [showFilePassword, setShowFilePassword] = useState(false);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const word1Ref = useRef<HTMLInputElement>(null);
  const word2Ref = useRef<HTMLInputElement>(null);
  const word3Ref = useRef<HTMLInputElement>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const qrReaderId = 'yourtj-credit-qr-reader';
  const TERMS_ACCEPTED_KEY = 'yourtj_terms_accepted_v1';
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(() => {
    try {
      return localStorage.getItem(TERMS_ACCEPTED_KEY) === '1';
    } catch {
      return false;
    }
  });

  // 检测是否为移动设备
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const stopQrScanner = React.useCallback(async () => {
    const scanner = qrScannerRef.current;
    if (!scanner) return;

    try {
      await scanner.stop();
    } catch {}

    try {
      await scanner.clear();
    } catch {}

    qrScannerRef.current = null;
  }, []);

  React.useEffect(() => {
    if (mode !== 'qrcode') {
      setIsScanning(false);
      void stopQrScanner();
    }

    return () => {
      void stopQrScanner();
    };
  }, [mode, stopQrScanner]);

  // 处理学号+PIN登录
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !pin) return;

    if (!termsAccepted) {
      setTermsOpen(true);
      setError('请先阅读并同意用户协议与免责声明');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await onLogin(studentId, pin);
    } catch (error: any) {
      setError(error.message || '登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理助记词独立导入
  const handleMnemonicImport = async (e: React.FormEvent) => {
    e.preventDefault();

    // 组合三个词
    const mnemonic = mnemonicWords.map(w => w.trim()).join('-').trim();

    if (!mnemonic || mnemonicWords.some(word => !word.trim())) {
      setError('请输入完整的3个助记词');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // 获取词库
      const wordlist = await getWordlist();

      // 从助记词恢复钱包
      const walletInfo = await restoreWalletFromMnemonic(mnemonic, wordlist);

      // 注册或获取钱包
      const { registerWallet } = await import('../services/api');
      await registerWallet(walletInfo.userHash, { userSecret: walletInfo.userSecret });

      // 保存到本地存储
      saveWallet(walletInfo);

      // 触发登录成功（使用空学号和PIN）
      window.location.reload();
    } catch (error: any) {
      setError(error.message || '助记词导入失败，请检查输入');
    } finally {
      setIsLoading(false);
    }
  };

  function parseMnemonicText(text: string): string[] | null {
    const normalized = text
      .trim()
      .replace(/[，,]/g, '-')
      .replace(/\s+/g, '-');

    const parts = normalized
      .split('-')
      .map(p => p.trim())
      .filter(Boolean);

    return parts.length === 3 ? parts : null;
  }

  function focusMnemonicIndex(index: number) {
    if (index === 0) word1Ref.current?.focus();
    if (index === 1) word2Ref.current?.focus();
    if (index === 2) word3Ref.current?.focus();
  }

  // 处理助记词输入框的变化
  const handleMnemonicWordChange = (index: number, value: string) => {
    const newWords = [...mnemonicWords];
    newWords[index] = value;
    setMnemonicWords(newWords);
  };

  const handleMnemonicPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const parsed = parseMnemonicText(text);
    if (!parsed) return;

    e.preventDefault();
    setMnemonicWords(parsed);
    focusMnemonicIndex(2);
  };

  // 处理退格键
  const handleMnemonicKeyDown = (index: number, e: React.KeyboardEvent) => {
    const isComposing = Boolean((e.nativeEvent as any)?.isComposing);
    if (isComposing) return;

    if ((e.key === '-' || e.key === ' ' || e.key === 'Enter') && index < 2) {
      e.preventDefault();
      focusMnemonicIndex(index + 1);
      return;
    }

    if (e.key === 'Backspace' && !mnemonicWords[index] && index > 0) {
      if (index === 1 && word1Ref.current) {
        word1Ref.current.focus();
      } else if (index === 2 && word2Ref.current) {
        word2Ref.current.focus();
      }
    }
  };

  // 处理二维码扫描导入
  const handleQRCodeScan = async () => {
    if (!isMobile) {
      setError('请在手机端使用扫码绑定');
      return;
    }

    if (isScanning) {
      setIsScanning(false);
      await stopQrScanner();
      return;
    }

    try {
      setError('');
      setIsLoading(true);

      const { Html5Qrcode } = await import('html5-qrcode');
      await stopQrScanner();

      const scanner = new Html5Qrcode(qrReaderId);
      qrScannerRef.current = scanner;
      setIsScanning(true);

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
        async (decodedText) => {
          setIsLoading(true);

          const parsedData = parseQRCodeData(decodedText);
          if (!parsedData) {
            setError('无效的二维码格式');
            setIsScanning(false);
            await stopQrScanner();
            setIsLoading(false);
            return;
          }

          try {
            const wordlist = await getWordlist();
            const walletInfo = await restoreWalletFromMnemonic(parsedData.mnemonic, wordlist);
            if (walletInfo.userHash !== parsedData.userHash) {
              setError('二维码内容校验失败');
              setIsScanning(false);
              await stopQrScanner();
              setIsLoading(false);
              return;
            }

            const { registerWallet } = await import('../services/api');
            await registerWallet(walletInfo.userHash, { userSecret: walletInfo.userSecret });

            saveWallet(walletInfo);
            window.location.reload();
          } catch (err: any) {
            setError(err?.message || '二维码导入失败');
            setIsScanning(false);
            await stopQrScanner();
          } finally {
            setIsLoading(false);
          }
        },
        () => {}
      );

      setIsLoading(false);
    } catch (error: any) {
      setError(error.message || '二维码扫描失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理密钥文件导入
  const handleFileImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePassword) {
      setError('请输入文件密码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const fileInput = fileInputRef.current;
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        setError('请选择密钥文件');
        setIsLoading(false);
        return;
      }

      const file = fileInput.files[0];
      const encryptedData = await file.text();

      // 解密文件
      const walletInfo = await importEncryptedWallet(encryptedData, filePassword);

      // 从助记词恢复完整钱包信息
      const wordlist = await getWordlist();
      const fullWalletInfo = await restoreWalletFromMnemonic(walletInfo.mnemonic, wordlist);
      if (fullWalletInfo.userHash !== walletInfo.userHash) {
        throw new Error('密钥文件校验失败');
      }

      // 注册或获取钱包
      const { registerWallet } = await import('../services/api');
      await registerWallet(fullWalletInfo.userHash, { userSecret: fullWalletInfo.userSecret });

      // 保存到本地存储
      saveWallet(fullWalletInfo);

      window.location.reload();
    } catch (error: any) {
      setError(error.message || '文件导入失败，请检查密码');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#f0f2f5] dark:bg-[#050505]">

      {/* Dynamic Ambient Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-cyan-400/10 rounded-full blur-[80px] animate-bounce" style={{ animationDuration: '8s' }} />
      </div>

      <div className="w-full max-w-[400px] p-6 relative z-10 perspective-1000">

        {/* Glass Card */}
        <div className="
          relative overflow-hidden
          bg-white/60 dark:bg-[#1a1a1a]/60
          backdrop-blur-2xl saturate-150
          border border-white/40 dark:border-white/10
          shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]
          rounded-[30px] p-8 md:p-10
          transition-all duration-300
        ">

          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-blue-500/30 blur-2xl rounded-full" />
              <BrandLogo className="w-24 h-24 relative drop-shadow-2xl" variant="color" />
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
              YourTJ
            </h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              身份与积分钱包
            </p>

            {/* Mode Toggle */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6 bg-slate-100 dark:bg-black/20 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  mode === 'login'
                    ? 'bg-white dark:bg-white/10 text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                登录/注册
              </button>
              <button
                type="button"
                onClick={() => setMode('mnemonic')}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                  mode === 'mnemonic'
                    ? 'bg-white dark:bg-white/10 text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Key size={12} />
                助记词
              </button>
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setMode('qrcode')}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                    mode === 'qrcode'
                      ? 'bg-white dark:bg-white/10 text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <QrCode size={12} />
                  扫码
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode('file')}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                  mode === 'file'
                    ? 'bg-white dark:bg-white/10 text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <FileKey size={12} />
                文件
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* 登录/注册模式 */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div className="space-y-4">
                {/* Student ID */}
                <div className={`
                  relative px-4 py-3 rounded-2xl bg-white/50 dark:bg-black/20
                  border transition-all duration-200
                  ${focusedField === 'id'
                    ? 'border-blue-500 ring-4 ring-blue-500/10 shadow-lg'
                    : 'border-slate-200/60 dark:border-white/10 hover:border-blue-400/50'}
                `}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                    学号
                  </label>
                  <input
                    type="text"
                    value={studentId}
                    onFocus={() => setFocusedField('id')}
                    onBlur={() => setFocusedField(null)}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="w-full bg-transparent border-none p-1 text-lg font-mono text-slate-900 dark:text-white placeholder-slate-300 focus:ring-0 outline-none"
                    autoComplete="username"
                  />
                </div>

                {/* PIN */}
                <div className={`
                  relative px-4 py-3 rounded-2xl bg-white/50 dark:bg-black/20
                  border transition-all duration-200
                  ${focusedField === 'pin'
                    ? 'border-blue-500 ring-4 ring-blue-500/10 shadow-lg'
                    : 'border-slate-200/60 dark:border-white/10 hover:border-blue-400/50'}
                `}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                    安全PIN码
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showPin ? "text" : "password"}
                      value={pin}
                      onFocus={() => setFocusedField('pin')}
                      onBlur={() => setFocusedField(null)}
                      onChange={(e) => setPin(e.target.value)}
                      className="w-full bg-transparent border-none p-1 text-lg font-mono tracking-[0.3em] text-slate-900 dark:text-white placeholder-slate-300 focus:ring-0 outline-none pr-10"
                      placeholder="••••••"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-0 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Terms Gate */}
              <div className="px-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        termsAccepted ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/20'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                      {termsAccepted ? '已同意《用户协议与免责声明》' : '请阅读并同意《用户协议与免责声明》'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTermsOpen(true)}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors whitespace-nowrap"
                  >
                    {termsAccepted ? '查看' : '阅读'}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="
                    relative w-full h-14 overflow-hidden rounded-2xl
                    bg-gradient-to-r from-blue-600 to-indigo-600
                    text-white font-semibold text-base
                    shadow-[0_10px_20px_-10px_rgba(59,130,246,0.5)]
                    hover:shadow-[0_15px_25px_-10px_rgba(59,130,246,0.6)]
                    transition-all active:scale-[0.98]
                    disabled:opacity-70 disabled:cursor-not-allowed
                    group
                  "
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                  <div className="relative flex items-center justify-center gap-2 h-full">
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>验证中...</span>
                      </>
                    ) : (
                      <>
                        <span>解锁钱包</span>
                        <ArrowRight className="w-5 h-5 opacity-70 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </div>
                </button>
              </div>
            </form>
          )}

          {/* 助记词导入模式 */}
          {mode === 'mnemonic' && (
            <form onSubmit={handleMnemonicImport} className="space-y-5">
              <div className="space-y-4">
                {/* Mnemonic Input - 三个独立的输入框 */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                    助记词（3个词）
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {/* 第一个词 */}
                    <div className={`
                      relative px-3 py-3 rounded-xl bg-white/50 dark:bg-black/20
                      border transition-all duration-200
                      ${focusedField === 'word1'
                        ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg'
                        : 'border-slate-200/60 dark:border-white/10 hover:border-blue-400/50'}
                    `}>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-center">
                        第1词
                      </div>
                      <input
                        ref={word1Ref}
                        type="text"
                        value={mnemonicWords[0]}
                        onFocus={() => setFocusedField('word1')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => handleMnemonicWordChange(0, e.target.value)}
                        onPaste={handleMnemonicPaste}
                        onKeyDown={(e) => handleMnemonicKeyDown(0, e)}
                        placeholder="同济"
                        className="w-full bg-transparent border-none p-0 text-center text-base font-medium text-slate-900 dark:text-white placeholder-slate-300 focus:ring-0 outline-none"
                      />
                    </div>

                    {/* 第二个词 */}
                    <div className={`
                      relative px-3 py-3 rounded-xl bg-white/50 dark:bg-black/20
                      border transition-all duration-200
                      ${focusedField === 'word2'
                        ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg'
                        : 'border-slate-200/60 dark:border-white/10 hover:border-blue-400/50'}
                    `}>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-center">
                        第2词
                      </div>
                      <input
                        ref={word2Ref}
                        type="text"
                        value={mnemonicWords[1]}
                        onFocus={() => setFocusedField('word2')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => handleMnemonicWordChange(1, e.target.value)}
                        onPaste={handleMnemonicPaste}
                        onKeyDown={(e) => handleMnemonicKeyDown(1, e)}
                        placeholder="四平"
                        className="w-full bg-transparent border-none p-0 text-center text-base font-medium text-slate-900 dark:text-white placeholder-slate-300 focus:ring-0 outline-none"
                      />
                    </div>

                    {/* 第三个词 */}
                    <div className={`
                      relative px-3 py-3 rounded-xl bg-white/50 dark:bg-black/20
                      border transition-all duration-200
                      ${focusedField === 'word3'
                        ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg'
                        : 'border-slate-200/60 dark:border-white/10 hover:border-blue-400/50'}
                    `}>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-center">
                        第3词
                      </div>
                      <input
                        ref={word3Ref}
                        type="text"
                        value={mnemonicWords[2]}
                        onFocus={() => setFocusedField('word3')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => handleMnemonicWordChange(2, e.target.value)}
                        onPaste={handleMnemonicPaste}
                        onKeyDown={(e) => handleMnemonicKeyDown(2, e)}
                        placeholder="嘉定"
                        className="w-full bg-transparent border-none p-0 text-center text-base font-medium text-slate-900 dark:text-white placeholder-slate-300 focus:ring-0 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="
                    relative w-full h-14 overflow-hidden rounded-2xl
                    bg-gradient-to-r from-blue-600 to-indigo-600
                    text-white font-semibold text-base
                    shadow-[0_10px_20px_-10px_rgba(59,130,246,0.5)]
                    hover:shadow-[0_15px_25px_-10px_rgba(59,130,246,0.6)]
                    transition-all active:scale-[0.98]
                    disabled:opacity-70 disabled:cursor-not-allowed
                    group
                  "
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                  <div className="relative flex items-center justify-center gap-2 h-full">
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>导入中...</span>
                      </>
                    ) : (
                      <>
                        <span>导入钱包</span>
                        <ArrowRight className="w-5 h-5 opacity-70 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </div>
                </button>
              </div>

              {/* Help Text */}
              <div className="pt-2 px-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  直接使用助记词导入，无需学号和 PIN 码
                </p>
              </div>
            </form>
          )}

          {/* 二维码扫描模式 */}
          {mode === 'qrcode' && (
            <div className="space-y-5">
              {/* QR Code Scanner */}
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-black/20">
                <div id={qrReaderId} className="w-full h-full" />
                {!isScanning && (
                  <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                    <QrCode size={80} className="text-slate-400" />
                  </div>
                )}
              </div>

              {/* Scan Button */}
              <button
                type="button"
                onClick={handleQRCodeScan}
                disabled={isLoading}
                className="
                  relative w-full h-14 overflow-hidden rounded-2xl
                  bg-gradient-to-r from-blue-600 to-indigo-600
                  text-white font-semibold text-base
                  shadow-[0_10px_20px_-10px_rgba(59,130,246,0.5)]
                  hover:shadow-[0_15px_25px_-10px_rgba(59,130,246,0.6)]
                  transition-all active:scale-[0.98]
                  disabled:opacity-70 disabled:cursor-not-allowed
                  group
                "
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <div className="relative flex items-center justify-center gap-2 h-full">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>准备中...</span>
                    </>
                  ) : (
                    <>
                      <Scan className="w-5 h-5" />
                      <span>{isScanning ? '停止扫描' : '开始扫描'}</span>
                    </>
                  )}
                </div>
              </button>

              {/* Help Text */}
              <div className="pt-2 px-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  扫描电脑端生成的钱包绑定二维码快速导入
                </p>
              </div>
            </div>
          )}

          {/* 密钥文件导入模式 */}
          {mode === 'file' && (
            <form onSubmit={handleFileImport} className="space-y-5">
              <div className="space-y-4">
                {/* File Input */}
                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.key"
                    className="hidden"
                    onChange={() => setError('')}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="
                      w-full px-4 py-6 rounded-2xl
                      bg-white/50 dark:bg-black/20
                      border-2 border-dashed border-slate-300 dark:border-white/10
                      hover:border-blue-400 dark:hover:border-blue-500
                      transition-all duration-200
                      flex flex-col items-center gap-2
                    "
                  >
                    <Upload size={32} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {fileInputRef.current?.files?.[0]?.name || '选择密钥文件'}
                    </span>
                    <span className="text-xs text-slate-400">
                      支持 .txt 和 .key 格式
                    </span>
                  </button>
                </div>

                {/* Password Input */}
                <div className={`
                  relative px-4 py-3 rounded-2xl bg-white/50 dark:bg-black/20
                  border transition-all duration-200
                  ${focusedField === 'filePassword'
                    ? 'border-blue-500 ring-4 ring-blue-500/10 shadow-lg'
                    : 'border-slate-200/60 dark:border-white/10 hover:border-blue-400/50'}
                `}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                    文件密码
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showFilePassword ? "text" : "password"}
                      value={filePassword}
                      onFocus={() => setFocusedField('filePassword')}
                      onBlur={() => setFocusedField(null)}
                      onChange={(e) => setFilePassword(e.target.value)}
                      className="w-full bg-transparent border-none p-1 text-lg font-mono tracking-[0.3em] text-slate-900 dark:text-white placeholder-slate-300 focus:ring-0 outline-none pr-10"
                      placeholder="••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFilePassword(!showFilePassword)}
                      className="absolute right-0 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showFilePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="
                    relative w-full h-14 overflow-hidden rounded-2xl
                    bg-gradient-to-r from-blue-600 to-indigo-600
                    text-white font-semibold text-base
                    shadow-[0_10px_20px_-10px_rgba(59,130,246,0.5)]
                    hover:shadow-[0_15px_25px_-10px_rgba(59,130,246,0.6)]
                    transition-all active:scale-[0.98]
                    disabled:opacity-70 disabled:cursor-not-allowed
                    group
                  "
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                  <div className="relative flex items-center justify-center gap-2 h-full">
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>解密中...</span>
                      </>
                    ) : (
                      <>
                        <span>导入钱包</span>
                        <ArrowRight className="w-5 h-5 opacity-70 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </div>
                </button>
              </div>

              {/* Help Text */}
              <div className="pt-2 px-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  使用加密文件和密码恢复钱包
                </p>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-[11px] text-slate-400 max-w-[280px] mx-auto leading-relaxed opacity-60">
          密钥在本地使用您的学号和PIN码生成。没有个人数据上传到任何服务器。
        </p>
        <p className="mt-3 text-center text-[11px] text-slate-400 opacity-60">
          {'©'} {new Date().getFullYear()} YOURTJ社区
        </p>
      </div>
    </div>
    {termsOpen && typeof document !== 'undefined' &&
      createPortal(
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/45 ${
            isMobile ? '' : 'backdrop-blur-sm'
          }`}
        >
          <div className="w-full max-w-[92vw] sm:max-w-2xl bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-black/5 dark:border-white/10 overflow-hidden">
            <div className="px-4 md:px-6 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-slate-900 dark:text-white">用户协议与免责声明</div>
              <button
                type="button"
                onClick={() => setTermsOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                关闭
              </button>
            </div>

            <div className="px-4 md:px-6 py-4 max-h-[65vh] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [transform:translateZ(0)]">
              <MarkdownView blocks={TERMS_BLOCKS} />
            </div>

            <div className="px-4 md:px-6 py-4 border-t border-black/5 dark:border-white/10 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem(TERMS_ACCEPTED_KEY);
                  } catch {}
                  setTermsAccepted(false);
                  setTermsOpen(false);
                }}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                不同意
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem(TERMS_ACCEPTED_KEY, '1');
                  } catch {}
                  setTermsAccepted(true);
                  setTermsOpen(false);
                  setError('');
                }}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
              >
                已阅读并同意
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    }
    </>
  );
};
