// ============================================================================
// Auth Service - Supabase Auth integration with Staff Role Profiles
// Supports Admin (Proprietário), Faxineira, and Piscineiro roles
// ============================================================================

import { User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { AppUserProfile, UserRole } from '../types/auth';

const LS_AUTH_PROFILE_KEY = 'chacara_auth_profile_v1';

function inferRoleFromEmailOrMeta(user: User): UserRole {
  const metaRole = user.user_metadata?.role;
  if (metaRole === 'admin' || metaRole === 'faxineira' || metaRole === 'piscineiro') {
    return metaRole;
  }
  const email = (user.email || '').toLowerCase();
  if (email.includes('piscin')) return 'piscineiro';
  if (email.includes('faxin')) return 'faxineira';
  if (email.includes('admin') || email === 'lpr1000lpr07@gmail.com') return 'admin';
  return 'faxineira';
}

function saveCachedProfile(profile: AppUserProfile | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (profile) {
      localStorage.setItem(LS_AUTH_PROFILE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(LS_AUTH_PROFILE_KEY);
    }
  } catch {}
}

function getCachedProfile(): AppUserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_AUTH_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppUserProfile;
  } catch {
    return null;
  }
}

async function resolveOrSyncStaffProfile(user: User, preferredRole?: UserRole, preferredName?: string): Promise<AppUserProfile> {
  const supabase = getSupabaseClient();
  const cleanEmail = (user.email || '').trim().toLowerCase();
  const fallbackRole = preferredRole || inferRoleFromEmailOrMeta(user);
  const fallbackName =
    preferredName?.trim() ||
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (cleanEmail.split('@')[0] || 'Usuário');

  try {
    // 1. Try lookup by user_id or email in staff_profiles
    const { data: existing, error } = await supabase
      .from('staff_profiles')
      .select('*')
      .or(`user_id.eq.${user.id},email.eq.${cleanEmail}`)
      .limit(1)
      .maybeSingle();

    if (!error && existing) {
      const profile: AppUserProfile = {
        id: existing.id,
        user_id: existing.user_id || user.id,
        email: existing.email || cleanEmail,
        full_name: existing.full_name || fallbackName,
        role:
          existing.role === 'admin' || existing.role === 'faxineira' || existing.role === 'piscineiro'
            ? existing.role
            : fallbackRole,
        is_active: existing.is_active !== false,
      };
      saveCachedProfile(profile);
      return profile;
    }

    // 2. If not found, create/upsert profile record
    const { data: upserted, error: upsertError } = await supabase
      .from('staff_profiles')
      .upsert(
        {
          user_id: user.id,
          email: cleanEmail,
          full_name: fallbackName,
          role: fallbackRole,
          is_active: true,
        },
        { onConflict: 'email' }
      )
      .select('*')
      .single();

    if (!upsertError && upserted) {
      const profile: AppUserProfile = {
        id: upserted.id,
        user_id: upserted.user_id || user.id,
        email: upserted.email || cleanEmail,
        full_name: upserted.full_name || fallbackName,
        role:
          upserted.role === 'admin' || upserted.role === 'faxineira' || upserted.role === 'piscineiro'
            ? upserted.role
            : fallbackRole,
        is_active: upserted.is_active !== false,
      };
      saveCachedProfile(profile);
      return profile;
    }
  } catch (err) {
    console.warn('Falha ao consultar staff_profiles no Supabase, usando perfil de sessão:', err);
  }

  // Fallback offline / cache
  const cached = getCachedProfile();
  if (cached && cached.email.toLowerCase() === cleanEmail) {
    return cached;
  }

  const localProfile: AppUserProfile = {
    id: user.id,
    user_id: user.id,
    email: cleanEmail,
    full_name: fallbackName,
    role: fallbackRole,
    is_active: true,
  };
  saveCachedProfile(localProfile);
  return localProfile;
}

function translateAuthError(message?: string): string {
  const msg = (message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos. Verifique os dados e tente novamente.';
  }
  if (msg.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado. Verifique sua caixa de entrada ou peça ao administrador.';
  }
  if (msg.includes('user already registered') || msg.includes('already exists')) {
    return 'Este e-mail já está cadastrado. Use a aba Entrar.';
  }
  if (msg.includes('password') && msg.includes('least')) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Sem conexão com a internet no momento. Conecte-se para autenticar.';
  }
  return message || 'Erro ao autenticar no aplicativo.';
}

/**
 * Checks if there is an active Supabase Auth session and returns the user profile.
 */
export async function getCurrentUserProfile(): Promise<AppUserProfile | null> {
  if (!isSupabaseConfigured()) {
    return getCachedProfile();
  }

  try {
    const supabase = getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      saveCachedProfile(null);
      return null;
    }

    return await resolveOrSyncStaffProfile(session.user);
  } catch (err) {
    console.warn('Erro ao restaurar sessão auth, verificando cache:', err);
    return getCachedProfile();
  }
}

/**
 * Signs in with email & password via Supabase Auth and loads staff profile.
 */
export async function signInWithEmail(email: string, password: string): Promise<AppUserProfile> {
  if (!isSupabaseConfigured()) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error('Preencha e-mail e senha para entrar.');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (error || !data.user) {
    throw new Error(translateAuthError(error?.message));
  }

  const profile = await resolveOrSyncStaffProfile(data.user);
  if (!profile.is_active) {
    await supabase.auth.signOut();
    saveCachedProfile(null);
    throw new Error('Este acesso está desativado. Fale com o proprietário da chácara.');
  }

  return profile;
}

/**
 * Registers a new user in Supabase Auth with a specific role (faxineira, piscineiro, or admin).
 */
export async function signUpWithRole(
  email: string,
  password: string,
  fullName: string,
  role: UserRole
): Promise<{ profile: AppUserProfile | null; requiresEmailConfirmation: boolean }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim();

  if (!cleanName) {
    throw new Error('Informe o nome completo.');
  }
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Informe um e-mail válido.');
  }
  if (!password || password.length < 6) {
    throw new Error('A senha deve ter no mínimo 6 caracteres.');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: cleanName,
        role,
      },
    },
  });

  if (error) {
    throw new Error(translateAuthError(error.message));
  }

  if (!data.user) {
    throw new Error('Não foi possível criar a conta.');
  }

  // Upsert staff profile explicitly (in addition to DB trigger)
  const profile = await resolveOrSyncStaffProfile(data.user, role, cleanName);

  if (!data.session) {
    saveCachedProfile(null);
    return { profile, requiresEmailConfirmation: true };
  }

  return { profile, requiresEmailConfirmation: false };
}

/**
 * Signs out the current user from Supabase Auth and clears local cache.
 */
export async function signOutAppUser(): Promise<void> {
  saveCachedProfile(null);
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Erro ao encerrar sessão no Supabase:', err);
  }
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Proprietário / Admin';
    case 'faxineira':
      return 'Faxineira';
    case 'piscineiro':
      return 'Piscineiro';
  }
}

export function getRoleBadgeColor(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'faxineira':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'piscineiro':
      return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
  }
}
