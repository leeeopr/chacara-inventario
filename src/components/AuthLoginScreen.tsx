import React, { useState } from 'react';
import {
  AlertCircle,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Sliders,
} from 'lucide-react';
import { signInWithEmail } from '../services/authService';
import { AppUserProfile } from '../types/auth';

interface AuthLoginScreenProps {
  onLoginSuccess: (profile: AppUserProfile) => void;
  onOpenAccessibility?: () => void;
  onOpenSupabaseConfig?: () => void;
}

export const AuthLoginScreen: React.FC<AuthLoginScreenProps> = ({
  onLoginSuccess,
  onOpenAccessibility,
  onOpenSupabaseConfig,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const profile = await signInWithEmail(email, password);
      onLoginSuccess(profile);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível entrar. Verifique e-mail e senha.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-6 select-none overflow-y-auto">
      <div className="max-w-md w-full mx-auto my-auto space-y-6 py-6">
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
              Entre com seu e-mail e senha para acessar
            </p>
          </div>
        </div>

        {/* Direct Login Card */}
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-2xl space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm font-bold flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                E-mail
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
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-950 border-2 border-slate-800 focus:border-emerald-400 focus:outline-none text-base font-bold text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                Senha
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
                  autoComplete="current-password"
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
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2.5 shadow-xl active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 stroke-[2.5]" />
                  <span>Entrar</span>
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
