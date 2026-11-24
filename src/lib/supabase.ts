import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const STORAGE_BUCKET = 'inventory-photos';

export const DEFAULT_SUPABASE_URL = 'https://jhsbdqrsyvljafqdeswg.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impoc2JkcXJzeXZsamFmcWRlc3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4NDUzMzksImV4cCI6MjExMDQyMTMzOX0.H0e6nziwnVuG2fIJPeHXKPycfDz5ySPSxJWBJkAD1yY';

const LS_SUPABASE_URL_KEY = 'chacara_supabase_url';
const LS_SUPABASE_ANON_KEY = 'chacara_supabase_anon_key';

export function isValidSupabaseUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): {
  url: string;
  anonKey: string;
  source: 'env' | 'local' | 'default' | 'unconfigured';
} {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (typeof window !== 'undefined') {
    const localUrl = localStorage.getItem(LS_SUPABASE_URL_KEY);
    const localKey = localStorage.getItem(LS_SUPABASE_ANON_KEY);
    if (localUrl && localKey && isValidSupabaseUrl(localUrl) && localKey.trim().length > 20) {
      return {
        url: localUrl.trim().replace(/\/+$/, ''),
        anonKey: localKey.trim(),
        source: 'local',
      };
    }
  }

  if (
    envUrl &&
    envKey &&
    isValidSupabaseUrl(envUrl) &&
    !envUrl.includes('seu-projeto') &&
    !envUrl.includes('placeholder') &&
    envKey.trim().length > 20 &&
    !envKey.includes('sua-chave')
  ) {
    return {
      url: envUrl.trim().replace(/\/+$/, ''),
      anonKey: envKey.trim(),
      source: 'env',
    };
  }

  if (isValidSupabaseUrl(DEFAULT_SUPABASE_URL) && DEFAULT_SUPABASE_ANON_KEY.length > 20) {
    return {
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY,
      source: 'default',
    };
  }

  return {
    url: 'https://placeholder.supabase.co',
    anonKey: 'placeholder-anon-key',
    source: 'unconfigured',
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig().source !== 'unconfigured';
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = anonKey.trim();
  localStorage.setItem(LS_SUPABASE_URL_KEY, cleanUrl);
  localStorage.setItem(LS_SUPABASE_ANON_KEY, cleanKey);
  clientInstance = null;
  currentConfigSignature = '';
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(LS_SUPABASE_URL_KEY);
  localStorage.removeItem(LS_SUPABASE_ANON_KEY);
  clientInstance = null;
  currentConfigSignature = '';
}

let clientInstance: SupabaseClient | null = null;
let currentConfigSignature = '';

export function getSupabaseClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  const signature = `${url}::${anonKey}`;

  if (!clientInstance || currentConfigSignature !== signature) {
    currentConfigSignature = signature;
    clientInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return clientInstance;
}

export function getInventoryImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const trimmed = String(imagePath).trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  if (!isSupabaseConfigured()) return null;
  const client = getSupabaseClient();
  const cleanPath = trimmed.replace(/^\/+/, '');
  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(cleanPath);
  return data?.publicUrl || null;
}
