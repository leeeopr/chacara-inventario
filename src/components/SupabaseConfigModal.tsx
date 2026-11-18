import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { INVENTORY_MIGRATION_SQL } from '../lib/migrationSql';
import {
  clearSupabaseConfig,
  getSupabaseClient,
  getSupabaseConfig,
  isSupabaseConfigured,
  isValidSupabaseUrl,
  saveSupabaseConfig,
} from '../lib/supabase';
import {
  SupabaseDiagnosticResult,
  verifySupabaseSetup,
} from '../services/inventoryService';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => Promise<void>;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [activeTab, setActiveTab] = useState<'connection' | 'sql' | 'auth'>('connection');
  const [diagnostic, setDiagnostic] = useState<SupabaseDiagnosticResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Supabase Auth states
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const cfg = getSupabaseConfig();
    if (cfg.source !== 'unconfigured') {
      setUrlInput(cfg.url);
      setKeyInput(cfg.anonKey);
      runDiagnostic();
      loadCurrentUser();
    } else {
      setUrlInput('');
      setKeyInput('');
      setDiagnostic(null);
    }
  }, [isOpen]);

  const loadCurrentUser = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email || null);
    } catch {
      setUserEmail(null);
    }
  };

  const runDiagnostic = async () => {
    setIsTesting(true);
    setFormError(null);
    try {
      const res = await verifySupabaseSetup();
      setDiagnostic(res);
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUrl = urlInput.trim();
    const cleanKey = keyInput.trim();

    if (!isValidSupabaseUrl(cleanUrl)) {
      setFormError('Informe uma URL válida do Supabase (ex: https://xyzproject.supabase.co).');
      return;
    }
    if (cleanKey.length < 20) {
      setFormError('Informe a chave pública (anon public key) válida do projeto Supabase.');
      return;
    }

    saveSupabaseConfig(cleanUrl, cleanKey);
    await runDiagnostic();
    await loadCurrentUser();
    await onConfigUpdated();
  };

  const handleClearCredentials = async () => {
    clearSupabaseConfig();
    setUrlInput('');
    setKeyInput('');
    setDiagnostic(null);
    setUserEmail(null);
    await onConfigUpdated();
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(INVENTORY_MIGRATION_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    } catch {
      // Fallback copy
      const textarea = document.createElement('textarea');
      textarea.value = INVENTORY_MIGRATION_SQL;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      setAuthError('Configure a URL e a Anon Key do Supabase primeiro.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) throw error;
      setUserEmail(data.user?.email || null);
      setAuthPassword('');
      setAuthMessage('Sessão autenticada com sucesso!');
      await onConfigUpdated();
    } catch (err: any) {
      setAuthError(err?.message || 'Erro ao autenticar no Supabase.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!isSupabaseConfigured()) {
      setAuthError('Configure a URL e a Anon Key do Supabase primeiro.');
      return;
    }
    if (!authEmail.trim() || authPassword.length < 6) {
      setAuthError('Informe um e-mail válido e uma senha com pelo menos 6 caracteres.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) throw error;
      setUserEmail(data.user?.email || null);
      setAuthMessage(
        data.session
          ? 'Conta criada e conectada com sucesso!'
          : 'Conta criada! Verifique seu e-mail caso a confirmação esteja ativa no Supabase.'
      );
      await onConfigUpdated();
    } catch (err: any) {
      setAuthError(err?.message || 'Erro ao criar conta no Supabase.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      setUserEmail(null);
      setAuthMessage('Sessão encerrada.');
      await onConfigUpdated();
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">
                Banco de Dados Supabase & Storage
              </h2>
              <p className="text-xs text-slate-400">
                Conexão em tempo real, Migração SQL (Tabelas + Storage) e Autenticação
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 border-b border-slate-800 flex items-center gap-2 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('connection')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'connection'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>1. Credenciais & Diagnóstico</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'sql'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>2. Script SQL (Tabelas + Storage)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('auth')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'auth'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>3. Autenticação</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {activeTab === 'connection' && (
            <>
              <form onSubmit={handleSaveAndTest} className="space-y-4">
                {formError && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Supabase Project URL *
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://seu-projeto.supabase.co"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Supabase Anon / Public Key *
                  </label>
                  <textarea
                    rows={3}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-white font-mono resize-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {isSupabaseConfigured() ? (
                    <button
                      type="button"
                      onClick={handleClearCredentials}
                      className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpar Credenciais</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    {isSupabaseConfigured() && (
                      <button
                        type="button"
                        onClick={runDiagnostic}
                        disabled={isTesting}
                        className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                        <span>Retestar</span>
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={isTesting}
                      className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      {isTesting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verificando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Salvar e Testar Conexão</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>

              {/* Diagnostic Result Card */}
              {diagnostic && (
                <div
                  className={`p-4 rounded-2xl border space-y-3 ${
                    diagnostic.connected && diagnostic.tablesReady
                      ? 'bg-emerald-950/25 border-emerald-500/40'
                      : diagnostic.connected
                      ? 'bg-amber-950/25 border-amber-500/40'
                      : 'bg-rose-950/25 border-rose-500/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {diagnostic.connected && diagnostic.tablesReady ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs space-y-1">
                      <p className="font-bold text-white text-sm">
                        {diagnostic.connected && diagnostic.tablesReady
                          ? 'Supabase Conectado e Operacional'
                          : diagnostic.connected
                          ? 'Conectado! Falta executar o Script SQL de Criação das Tabelas'
                          : 'Não foi possível conectar ao Supabase'}
                      </p>
                      <p className="text-slate-300 leading-relaxed">{diagnostic.message}</p>
                    </div>
                  </div>

                  {diagnostic.tablesReady && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
                        <span className="block text-lg font-black text-emerald-400">
                          {diagnostic.itemsCount}
                        </span>
                        <span className="text-[11px] text-slate-400">Itens no Banco</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
                        <span className="block text-lg font-black text-white">
                          {diagnostic.roomsCount}
                        </span>
                        <span className="text-[11px] text-slate-400">Cômodos</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
                        <span className="block text-lg font-black text-sky-400">
                          {diagnostic.categoriesCount}
                        </span>
                        <span className="text-[11px] text-slate-400">Categorias</span>
                      </div>
                    </div>
                  )}

                  {diagnostic.connected && !diagnostic.tablesReady && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('sql')}
                      className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-2"
                    >
                      <Terminal className="w-4 h-4" />
                      <span>Ver e Copiar Script SQL de Configuração</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-slate-300">
                  Copie e execute este SQL no <strong>SQL Editor</strong> do seu projeto Supabase
                  para criar `rooms`, `inventory_categories`, `inventory_items`, políticas RLS e o
                  bucket `inventory-photos`:
                </p>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shrink-0"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>SQL Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Script SQL</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-emerald-300 font-mono overflow-x-auto max-h-80 leading-relaxed">
                {INVENTORY_MIGRATION_SQL}
              </pre>
            </div>
          )}

          {activeTab === 'auth' && (
            <div className="space-y-4">
              {userEmail ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-6 h-6 text-emerald-400" />
                    <div>
                      <p className="text-xs text-slate-400">Proprietário autenticado como</p>
                      <p className="text-sm font-bold text-white">{userEmail}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={authLoading}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 text-xs font-bold flex items-center gap-1.5"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sair da Conta</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSignIn} className="space-y-3">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Opcional: Caso seu projeto Supabase utilize políticas RLS restritas a usuários
                    autenticados (`authenticated`), faça login ou crie sua conta de proprietário
                    abaixo.
                  </p>

                  {authError && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                      {authError}
                    </div>
                  )}

                  {authMessage && (
                    <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                      {authMessage}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">E-mail</label>
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="proprietario@chacara.com"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Senha</label>
                      <input
                        type="password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleSignUp}
                      disabled={authLoading}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                    >
                      Criar Conta
                    </button>
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Entrar</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/95 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
