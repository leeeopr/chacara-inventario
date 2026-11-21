import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileCode2,
  HardDriveDownload,
  Loader2,
  MessageCircle,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import {
  canRequestPackageInstalls,
  downloadApk,
  installApk,
  openInstallSettings,
} from '../services/otaUpdateService';
import { DownloadProgress, UpdateInfo } from '../types/ota';

interface OtaUpdateModalProps {
  isOpen: boolean;
  updateInfo: UpdateInfo | null;
  onClose: () => void;
  onUpdateSuccess?: () => void;
}

export const OtaUpdateModal: React.FC<OtaUpdateModalProps> = ({
  isOpen,
  updateInfo,
  onClose,
  onUpdateSuccess,
}) => {
  const [downloadState, setDownloadState] = useState<
    'idle' | 'downloading' | 'need_permission' | 'installing' | 'error'
  >('idle');
  const [progress, setProgress] = useState<DownloadProgress>({
    percent: 0,
    bytes: 0,
    total: 0,
  });
  const [downloadedFilePath, setDownloadedFilePath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // WhatsApp fallback dispatch states
  const [isSendingWa, setIsSendingWa] = useState(false);
  const [waStatus, setWaStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [waMessage, setWaMessage] = useState<string | null>(null);

  if (!isOpen || !updateInfo) return null;

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleStartUpdate = async () => {
    if (!updateInfo.apkUrl) {
      setErrorMessage('Nenhum arquivo APK foi encontrado nesta release do GitHub.');
      setDownloadState('error');
      return;
    }

    setDownloadState('downloading');
    setProgress({ percent: 0, bytes: 0, total: updateInfo.apkSize || 0 });
    setErrorMessage(null);

    try {
      const fileName = updateInfo.apkName || `chacara-v${updateInfo.remoteVersion}.apk`;
      const filePath = await downloadApk(
        updateInfo.apkUrl,
        fileName,
        (p) => setProgress(p)
      );

      setDownloadedFilePath(filePath);
      await proceedToInstall(filePath);
    } catch (err: any) {
      console.error('OTA download failed:', err);
      setErrorMessage(err?.message || 'Falha ao baixar o arquivo de atualização.');
      setDownloadState('error');
    }
  };

  const proceedToInstall = async (filePath: string) => {
    setDownloadState('installing');
    try {
      // Check install unknown packages permission
      const hasPermission = await canRequestPackageInstalls();
      if (!hasPermission) {
        setDownloadState('need_permission');
        return;
      }

      const result = await installApk(filePath);
      if (result.needPermission) {
        setDownloadState('need_permission');
        return;
      }

      if (onUpdateSuccess) {
        onUpdateSuccess();
      }
    } catch (err: any) {
      console.error('OTA installation dispatch failed:', err);
      setErrorMessage(err?.message || 'Falha ao abrir instalador do Android.');
      setDownloadState('error');
    }
  };

  const handleOpenSettingsAndRetry = async () => {
    try {
      await openInstallSettings();
    } catch (err: any) {
      console.error('Failed to open settings:', err);
    }
  };

  const handleRetryInstallAfterPermission = async () => {
    if (downloadedFilePath) {
      await proceedToInstall(downloadedFilePath);
    } else {
      handleStartUpdate();
    }
  };

  const handleSendApkViaWhatsApp = async () => {
    setIsSendingWa(true);
    setWaStatus('sending');
    setWaMessage(null);

    const targetPhone = '5511968326792';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('http://localhost:3080/send-apk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const result = await response.json();
      if (result.success) {
        setWaStatus('success');
        setWaMessage(
          'APK enviado com sucesso para o seu WhatsApp (11 96832-6792)! Verifique suas mensagens para instalar.'
        );
      } else {
        throw new Error(result.error || 'Servidor WhatsApp retornou erro.');
      }
    } catch (err: any) {
      console.warn('Serviço Baileys local indisponível, usando fallback:', err);
      setWaStatus('error');
      setWaMessage(
        'Servidor local Baileys não conectado. Abrindo seu WhatsApp com o comando "apk"...'
      );
      // Fallback nativo: abrir WhatsApp com o comando "apk"
      const waUrl = `https://wa.me/${targetPhone}?text=apk`;
      window.open(waUrl, '_system');
    } finally {
      setIsSendingWa(false);
    }
  };

  const isDownloading = downloadState === 'downloading';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-slate-900 border-2 border-emerald-500/40 rounded-3xl shadow-2xl p-6 sm:p-7 space-y-6 text-slate-100 relative overflow-hidden"
      >
        {/* Decorative background glow */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-13 h-13 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/10">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
                Atualização do Sistema
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Nova Versão Disponível
              </h2>
            </div>
          </div>

          {!isDownloading && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Version comparison card */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold uppercase text-slate-500">Versão Atual</span>
            <p className="text-base font-extrabold text-slate-300">
              v{updateInfo.currentVersion}
            </p>
          </div>

          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
            <ArrowRight className="w-4 h-4" />
          </div>

          <div className="space-y-0.5 text-right">
            <span className="text-[11px] font-bold uppercase text-emerald-400">Nova Versão</span>
            <p className="text-base font-black text-emerald-400">
              v{updateInfo.remoteVersion}
            </p>
          </div>
        </div>

        {/* Release Title & Notes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileCode2 className="w-4 h-4 text-emerald-400" />
              O que há de novo ({updateInfo.releaseTitle}):
            </span>
            {updateInfo.apkSize ? (
              <span className="text-xs font-bold text-slate-400">
                {formatBytes(updateInfo.apkSize)}
              </span>
            ) : null}
          </div>

          <div className="max-h-48 overflow-y-auto p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 text-sm text-slate-300 leading-relaxed space-y-2 whitespace-pre-wrap font-sans">
            {updateInfo.releaseNotes.trim() ? (
              updateInfo.releaseNotes
            ) : (
              <span className="italic text-slate-500">
                Melhorias gerais de desempenho, estabilidade e novas funcionalidades da chácara.
              </span>
            )}
          </div>
        </div>

        {/* Dynamic States: Downloading, Permission Needed, Error, or Idle */}
        {downloadState === 'downloading' && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-emerald-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Baixando atualização...
              </span>
              <span className="text-emerald-400 font-mono text-sm font-black">
                {progress.percent}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-3.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800 p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 shadow-sm shadow-emerald-500/50"
                style={{ width: `${Math.max(5, progress.percent)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
              <span>{formatBytes(progress.bytes)} transferidos</span>
              <span>
                {progress.total > 0 ? formatBytes(progress.total) : 'Calculando tamanho...'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 text-center italic">
              Não feche o aplicativo enquanto o download estiver em andamento.
            </p>
          </div>
        )}

        {downloadState === 'need_permission' && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 space-y-3 animate-fadeIn">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-black text-amber-300">
                  Permissão Necessária no Android
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Para instalar a atualização, o Android exige que você autorize a opção{' '}
                  <strong className="text-white">"Permitir desta fonte"</strong> para este aplicativo.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleOpenSettingsAndRetry}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20"
              >
                <Settings className="w-4 h-4 stroke-[3]" />
                <span>Abrir Configurações</span>
              </button>
              <button
                type="button"
                onClick={handleRetryInstallAfterPermission}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Já autorizei, Instalar</span>
              </button>
            </div>
          </div>
        )}

        {downloadState === 'installing' && (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-3 animate-fadeIn">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-black text-emerald-300">
                Abrindo instalador nativo do Android...
              </p>
              <p className="text-xs text-slate-400">
                Toque em "Instalar" ou "Atualizar" na tela do Android para finalizar.
              </p>
            </div>
          </div>
        )}

        {downloadState === 'error' && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3 animate-fadeIn">
            <div className="flex items-center gap-2 text-rose-400 font-black text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Não foi possível atualizar automaticamente</span>
            </div>
            <p className="text-xs text-rose-200">{errorMessage}</p>

            {waMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                  waStatus === 'success'
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                }`}
              >
                {waStatus === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <MessageCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{waMessage}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleStartUpdate}
                className="py-2.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar Novamente</span>
              </button>

              <button
                type="button"
                onClick={handleSendApkViaWhatsApp}
                disabled={isSendingWa}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                {isSendingWa ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enviando no WhatsApp...</span>
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-4 h-4 fill-slate-950" />
                    <span>Receber APK no WhatsApp</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons (when idle) */}
        {downloadState === 'idle' && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onClose}
                className="order-2 sm:order-1 py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-extrabold text-sm transition-colors text-center"
              >
                Mais Tarde
              </button>

              <button
                type="button"
                onClick={handleStartUpdate}
                disabled={!updateInfo.apkUrl}
                className="order-1 sm:order-2 flex-1 py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <HardDriveDownload className="w-5 h-5 stroke-[2.5]" />
                <span>Atualizar Agora</span>
              </button>
            </div>

            {waMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                  waStatus === 'success'
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                }`}
              >
                {waStatus === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <MessageCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{waMessage}</span>
              </div>
            )}

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={handleSendApkViaWhatsApp}
                disabled={isSendingWa}
                className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ou receber arquivo APK no WhatsApp (11 96832-6792)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
