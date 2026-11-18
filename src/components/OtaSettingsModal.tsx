import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Github,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import {
  checkForUpdate,
  getAppInfo,
  getOtaRepo,
  setOtaRepo,
} from '../services/otaUpdateService';
import { AppInfo, UpdateInfo } from '../types/ota';

interface OtaSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateAvailable: (info: UpdateInfo) => void;
  onToast: (msg: string) => void;
}

export const OtaSettingsModal: React.FC<OtaSettingsModalProps> = ({
  isOpen,
  onClose,
  onUpdateAvailable,
  onToast,
}) => {
  const [repoInput, setRepoInput] = useState<string>(() => getOtaRepo());
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [checkStatus, setCheckStatus] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRepoInput(getOtaRepo());
      getAppInfo().then(setAppInfo);
      setCheckStatus(null);
      setErrorStatus(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveRepo = () => {
    const trimmed = repoInput.trim();
    if (!trimmed) {
      setErrorStatus('Informe o repositório no formato usuario/repositorio');
      return;
    }
    setOtaRepo(trimmed);
    onToast(`Repositório de atualização salvo: ${trimmed}`);
    setErrorStatus(null);
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    setCheckStatus(null);
    setErrorStatus(null);

    try {
      const updateInfo = await checkForUpdate(true);
      if (!updateInfo) {
        setCheckStatus('Nenhuma atualização disponível no momento.');
      } else if (updateInfo.hasUpdate) {
        onClose();
        onUpdateAvailable(updateInfo);
      } else {
        setCheckStatus(
          `Você já está usando a versão mais recente (v${updateInfo.currentVersion})!`
        );
      }
    } catch (err: any) {
      console.error('Manual OTA check error:', err);
      setErrorStatus(err?.message || 'Falha ao verificar atualizações no GitHub.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-7 space-y-6 text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Atualizações do Aplicativo</h3>
              <p className="text-xs text-slate-400">
                Sistema Over-The-Air (OTA) via GitHub Releases
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current App Info */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            Informações do Dispositivo
          </span>
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <span className="text-slate-500 block">Versão Instalada:</span>
              <span className="text-white font-bold font-mono text-sm">
                v{appInfo?.versionName || '1.0'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Código da Build:</span>
              <span className="text-slate-300 font-bold font-mono">
                {appInfo?.versionCode ?? 1}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 block">Identificador do Pacote:</span>
              <span className="text-slate-400 font-mono text-[11px]">
                {appInfo?.packageName || 'br.com.chacara.inventario'}
              </span>
            </div>
          </div>
        </div>

        {/* GitHub Repository Configuration */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Github className="w-4 h-4 text-slate-300" />
              Repositório GitHub Releases
            </label>
            <a
              href={`https://github.com/${repoInput}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>Ver no GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="ex: leeeopr/chacara-inventario"
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white font-mono placeholder-slate-600"
            />
            <button
              type="button"
              onClick={handleSaveRepo}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
              title="Salvar repositório"
            >
              <Save className="w-4 h-4" />
              <span>Salvar</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            O aplicativo busca releases com tag semântica (ex:{' '}
            <code className="text-slate-300">v1.0.1</code>) contendo o arquivo{' '}
            <code className="text-slate-300">.apk</code> nos anexos (assets).
          </p>
        </div>

        {/* Feedback notices */}
        {checkStatus && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs font-bold text-emerald-300 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{checkStatus}</span>
          </div>
        )}

        {errorStatus && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{errorStatus}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleManualCheck}
            disabled={isChecking}
            className="w-full py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
          >
            {isChecking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verificando no GitHub...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 stroke-[2.5]" />
                <span>Verificar Atualizações Agora</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
