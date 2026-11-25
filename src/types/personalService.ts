export type PersonalServiceStatus = 'scheduled' | 'in_progress' | 'completed' | 'canceled';

export interface ServiceCategoryOption {
  id: string;
  label: string;
  color: string; // Tailwind-compatible or HEX
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export interface PersonalService {
  id: string;
  user_id?: string | null;
  user_email: string;
  staff_role: 'admin' | 'faxineira' | 'piscineiro';
  title: string;
  client_name?: string | null;
  client_phone?: string | null;
  address?: string | null;
  service_date: string; // YYYY-MM-DD
  start_time?: string | null; // HH:mm:ss or HH:mm
  end_time?: string | null; // HH:mm:ss or HH:mm
  category: string;
  color?: string | null;
  price?: number | null;
  status: PersonalServiceStatus;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const FAXINEIRA_CATEGORIES: ServiceCategoryOption[] = [
  {
    id: 'faxina_residencial',
    label: 'Faxina Residencial',
    color: '#3b82f6',
    bgClass: 'bg-blue-500/20',
    textClass: 'text-blue-300',
    borderClass: 'border-blue-500/40',
  },
  {
    id: 'faxina_pesada',
    label: 'Faxina Pesada / Geral',
    color: '#8b5cf6',
    bgClass: 'bg-purple-500/20',
    textClass: 'text-purple-300',
    borderClass: 'border-purple-500/40',
  },
  {
    id: 'pos_obra',
    label: 'Faxina Pós-Obra',
    color: '#f59e0b',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-300',
    borderClass: 'border-amber-500/40',
  },
  {
    id: 'passadoria',
    label: 'Passadoria de Roupas',
    color: '#ec4899',
    bgClass: 'bg-pink-500/20',
    textClass: 'text-pink-300',
    borderClass: 'border-pink-500/40',
  },
  {
    id: 'comercial',
    label: 'Comercial / Escritório',
    color: '#06b6d4',
    bgClass: 'bg-cyan-500/20',
    textClass: 'text-cyan-300',
    borderClass: 'border-cyan-500/40',
  },
  {
    id: 'diaria_completa',
    label: 'Diária Completa',
    color: '#10b981',
    bgClass: 'bg-emerald-500/20',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/40',
  },
  {
    id: 'outro',
    label: 'Outro Serviço',
    color: '#64748b',
    bgClass: 'bg-slate-500/20',
    textClass: 'text-slate-300',
    borderClass: 'border-slate-500/40',
  },
];

export const PISCINEIRO_CATEGORIES: ServiceCategoryOption[] = [
  {
    id: 'limpeza_simples',
    label: 'Limpeza & Aspiração',
    color: '#0284c7',
    bgClass: 'bg-sky-500/20',
    textClass: 'text-sky-300',
    borderClass: 'border-sky-500/40',
  },
  {
    id: 'tratamento_quimico',
    label: 'Tratamento Químico (Cloro/pH)',
    color: '#06b6d4',
    bgClass: 'bg-cyan-500/20',
    textClass: 'text-cyan-300',
    borderClass: 'border-cyan-500/40',
  },
  {
    id: 'limpeza_pesada',
    label: 'Limpeza Pesada / Choque',
    color: '#3b82f6',
    bgClass: 'bg-blue-500/20',
    textClass: 'text-blue-300',
    borderClass: 'border-blue-500/40',
  },
  {
    id: 'manutencao_bomba',
    label: 'Manutenção Bomba / Filtro',
    color: '#f59e0b',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-300',
    borderClass: 'border-amber-500/40',
  },
  {
    id: 'troca_areia',
    label: 'Troca de Areia do Filtro',
    color: '#8b5cf6',
    bgClass: 'bg-purple-500/20',
    textClass: 'text-purple-300',
    borderClass: 'border-purple-500/40',
  },
  {
    id: 'visita_orcamento',
    label: 'Visita / Orçamento',
    color: '#10b981',
    bgClass: 'bg-emerald-500/20',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/40',
  },
  {
    id: 'outro',
    label: 'Outro Serviço',
    color: '#64748b',
    bgClass: 'bg-slate-500/20',
    textClass: 'text-slate-300',
    borderClass: 'border-slate-500/40',
  },
];

export function getCategoriesForRole(role?: string): ServiceCategoryOption[] {
  if (role === 'piscineiro') return PISCINEIRO_CATEGORIES;
  if (role === 'faxineira') return FAXINEIRA_CATEGORIES;
  // Admin gets combined list
  return [...FAXINEIRA_CATEGORIES, ...PISCINEIRO_CATEGORIES.filter((c) => c.id !== 'outro')];
}

export function getCategoryMeta(categoryId: string, role?: string): ServiceCategoryOption {
  const list = getCategoriesForRole(role);
  const found = list.find((c) => c.id === categoryId);
  if (found) return found;
  return {
    id: categoryId || 'outro',
    label: categoryId || 'Serviço',
    color: '#3b82f6',
    bgClass: 'bg-blue-500/20',
    textClass: 'text-blue-300',
    borderClass: 'border-blue-500/40',
  };
}
