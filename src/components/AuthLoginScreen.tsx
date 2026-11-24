import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Droplets,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Sliders,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react';
import { signInWithEmail, signUpWithRole } from '../services/authService';
import { AppUserProfile, UserRole } from '../types/auth';

interface AuthLoginScreenProps {
  onLoginSuccess: (profile: AppUserProfile) => void;
  onOpenAccessibility?: () => void;
  onOpenSupabaseConfig?: () => void;
}

const QUICK_ROLES: Array<{
  role: UserRole;
  title: string;
  subtitle: string;
  defaultEmail: string;
  accentClass: string;
  activeBorder: string;
  iconBg: string;
}> = [
  {
    role: 'faxineira',
    title: 'Faxineira',
    subtitle: 'Checklist, saídas e faxinas',
    defaultEmail: 'faxineira@chacara.com',
    accentClass: 'text-amber-300',
    activeBorder: 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/30',
    iconBg: 'bg-amber-500 text-slate-950',
  },
  {
    role: 'piscineiro',
    title: 'Piscineiro',
    subtitle: 'Calendário de piscinas',
    defaultEmail: 'piscineiro@chacara.com',
    accentClass: 'text-sky-300',
    activeBorder: 'border-sky-400 bg-sky-500/15 ring-2 ring-sky-400/30',
    iconBg: 'bg-sky-500 text-slate-950',
  },
  {
    role: 'admin',
    title: 'Proprietário',
    subtitle: 'Gestão completa e equipe',
    defaultEmail: 'admin@chacara.com',
    accentClass: 'text-emerald-300',
    activeBorder: 'border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-400/30',
    iconBg: 'bg-emerald-500 text-slate-950',
  },
];

export const AuthLoginScreen: React.FC<AuthLoginScreenProps> = ({
  onLoginSuccess,
  onOpenAccessibility,
  onOpenSupabaseConfig,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [selectedRole, setSelectedRole] = useState<UserRole>('faxineira');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('faxineira@chacara.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSelectQuickRole = (role: UserRole, defaultEmail: string) => {
    setSelectedRole(role);
    setErrorMsg(null);
    setSuccessMsg(null);
    if (mode === 'login') {
      setEmail(defaultEmail);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const profile = await signInWithEmail(email, password);
        onLoginSuccess(profile);
      } else {
        const result = await signUpWithRole(email, password, fullName, selectedRole);
        if (result.requiresEmailConfirmation || !result.profile) {
          setSuccessMsg(
            'Cadastro criado! Confirme seu e-mail para ativar ou entre com sua nova senha.'
          );
          setMode('login');
        } else {
          onLoginSuccess(result.profile);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível entrar. Verifique e-mail e senha.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-6 select-none overflow-y-auto">
      <div className="max-w-xl w-full mx-auto my-auto space-y-6 py-4">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <img
            src="/logo.png"
            alt="Logo Chácara"
            className="w-20 h-20 rounded-3xl object-cover shadow-2xl shadow-emerald-500/25 border-2 border-slate-800"
          />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Chácara Equipe &amp; Vistoria
            </h1>
            <p className="text-sm font-bold text-slate-400 mt-1">
              Selecione seu perfil e entre com sua conta do Supabase Auth
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-900 border-2 border-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-4 h-4 stroke-[2.5]" />
            <span>Entrar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
              setSuccessMsg(null);
              setEmail('');
              setPassword('');
            }}
            className={`py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mode === 'register'
                ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4 stroke-[2.5]" />
            <span>Cadastrar Acesso</span>
          </button>
        </div>

        {/* Main Card */}
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-2xl space-y-5">
          {/* Quick Profile Selector */}
          <div className="space-y-2.5">
            <span className="block text-xs font-black uppercase tracking-wider text-slate-400">
              {mode === 'login' ? '1. Escolha quem está entrando' : '1. Função da nova conta'}
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {QUICK_ROLES.map((item) => {
                const isSelected = selectedRole === item.role;
                return (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => handleSelectQuickRole(item.role, item.defaultEmail)}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer active:scale-[0.98] flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 ${
                      isSelected
                        ? item.activeBorder
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? item.iconBg : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.role === 'faxineira' && <Sparkles className="w-5 h-5" />}
                      {item.role === 'piscineiro' && <Droplets className="w-5 h-5" />}
                      {item.role === 'admin' && <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <span
                        className={`block text-sm font-black ${
                          isSelected ? item.accentClass : 'text-white'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="block text-[11px] font-semibold text-slate-400 leading-tight mt-0.5">
                        {item.subtitle}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm font-bold flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-bold flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                  Nome Completo *
                </label>
                <div className="relative">
                  <User className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: Maria da Silva"
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-950 border-2 border-slate-800 focus:border-amber-400 focus:outline-none text-base font-bold text-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                E-mail de Acesso *
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@chacara.com"
                  autoCapitalize="none"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-950 border-2 border-slate-800 focus:border-emerald-400 focus:outline-none text-base font-bold text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                Senha *
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full pl-11 pr-12 py-3.5 rounded-2xl bg-slate-950 border-2 border-slate-800 focus:border-emerald-400 focus:outline-none text-base font-bold text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2.5 shadow-xl active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 ${
                mode === 'login'
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/25'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{mode === 'login' ? 'Entrando...' : 'Criando acesso...'}</span>
                </>
              ) : (
                <>
                  {mode === 'login' ? (
                    <LogIn className="w-5 h-5 stroke-[2.5]" />
                  ) : (
                    <UserPlus className="w-5 h-5 stroke-[2.5]" />
                  )}
                  <span>
                    {mode === 'login' ? 'Entrar no Aplicativo' : 'Criar Conta e Entrar'}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Discreet Utility Footer */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {onOpenAccessibility && (
            <button
              type="button"
              onClick={onOpenAccessibility}
              className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-amber-300 flex items-center gap-2 cursor-pointer"
            >
              <Sliders className="w-4 h-4" />
              <span>Tamanho da Fonte / Tela</span>
            </button>
          )}

          {onOpenSupabaseConfig && (
            <button
              type="button"
              onClick={onOpenSupabaseConfig}
              className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <Database className="w-4 h-4" />
              <span>Conexão Supabase</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
