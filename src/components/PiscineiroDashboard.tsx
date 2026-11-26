import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Droplets,
  Edit2,
  Flame,
  List,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import {
  createPersonalService,
  deletePersonalService,
  fetchPersonalServices,
  formatCurrencyBRL,
  formatTimeShort,
  getGoogleMapsLink,
  getPhoneCallLink,
  getWhatsAppLink,
  togglePersonalServiceStatus,
  updatePersonalService,
} from '../services/personalServicesService';
import {
  fetchStays,
  formatDateBR,
  getLocalTodayDateStr,
  updateStayPoolStatus,
} from '../services/staysService';
import { AppUserProfile } from '../types/auth';
import {
  getCategoryMeta,
  PersonalService,
  PISCINEIRO_CATEGORIES,
} from '../types/personalService';
import { Stay, StayPoolStatus } from '../types/stay';

export type UnifiedPiscineiroItem =
  | {
      kind: 'chacara';
      id: string;
      date: string;
      time: string;
      stay: Stay;
    }
  | {
      kind: 'personal';
      id: string;
      date: string;
      time: string;
      service: PersonalService;
    };

interface PiscineiroDashboardProps {
  userProfile: AppUserProfile;
  onLogout: () => void;
  onOpenAccessibility?: () => void;
  onBackToAdmin?: () => void;
  onToast?: (msg: string) => void;
}

function getPoolUrgencyMeta(stay: Stay, today: string): {
  label: string;
  tone: 'urgent' | 'warning' | 'info' | 'done';
  sortWeight: number;
} {
  if (stay.pool_status === 'completed') {
    return {
      label: `Piscina Limpa${stay.pool_cleaned_by ? ` • ${stay.pool_cleaned_by}` : ''}`,
      tone: 'done',
      sortWeight: 5,
    };
  }

  if (stay.checkin_date === today) {
    return {
      label: `ENTRADA HOJE ÀS ${stay.checkin_time} — LIMPAR ANTES DO CHECK-IN!`,
      tone: 'urgent',
      sortWeight: 0,
    };
  }

  if (stay.checkout_date === today) {
    return {
      label: `SAÍDA HOJE ÀS ${stay.checkout_time} — LIMPEZA PÓS-ESTADIA`,
      tone: 'urgent',
      sortWeight: 1,
    };
  }

  if (stay.checkin_date <= today && today <= stay.checkout_date) {
    return {
      label: `HÓSPEDES NA CHÁCARA AGORA (Saída ${formatDateBR(stay.checkout_date)})`,
      tone: 'info',
      sortWeight: 2,
    };
  }

  if (stay.checkin_date > today) {
    return {
      label: `PRÓXIMA ENTRADA EM ${formatDateBR(stay.checkin_date)} ÀS ${stay.checkin_time}`,
      tone: 'warning',
      sortWeight: 3,
    };
  }

  return {
    label: `CHECK-OUT REALIZADO EM ${formatDateBR(stay.checkout_date)} — LIMPEZA PENDENTE`,
    tone: 'warning',
    sortWeight: 4,
  };
}

const PRESET_PISCINEIRO_TITLES = [
  'Limpeza & Aspiração',
  'Tratamento Químico / Cloro',
  'Troca de Areia do Filtro',
  'Manutenção Bomba / Motor',
  'Limpeza Pesada / Choque',
  'Visita / Orçamento',
];

export const PiscineiroDashboard: React.FC<PiscineiroDashboardProps> = ({
  userProfile,
  onLogout,
  onOpenAccessibility,
  onBackToAdmin,
  onToast,
}) => {
  const [stays, setStays] = useState<Stay[]>([]);
  const [personalServices, setPersonalServices] = useState<PersonalService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingStayId, setUpdatingStayId] = useState<string | null>(null);
  const [updatingServiceId, setUpdatingServiceId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Tabs & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<
    'pending' | 'chacara' | 'personal' | 'calendar' | 'completed' | 'all'
  >('pending');

  // Calendar Month Navigation
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);

  // Personal Service Form Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<PersonalService | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formClientPhone, setFormClientPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formDate, setFormDate] = useState(() => getLocalTodayDateStr());
  const [formStartTime, setFormStartTime] = useState('08:00');
  const [formEndTime, setFormEndTime] = useState('11:00');
  const [formCategory, setFormCategory] = useState(PISCINEIRO_CATEGORIES[0]?.id || 'limpeza_simples');
  const [formPrice, setFormPrice] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const todayStr = getLocalTodayDateStr();

  // Load both Chácara Stays and Personal Services in parallel
  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [staysData, personalData] = await Promise.all([
        fetchStays().catch(() => []),
        fetchPersonalServices(userProfile.email || 'piscineiro@chacara.com').catch(() => []),
      ]);
      setStays(staysData.filter((s) => s.status !== 'CANCELADA'));
      setPersonalServices(personalData);
    } catch (err) {
      console.error('Erro ao carregar dados unificados do piscineiro:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [userProfile.email]);

  // Android back handlers
  useEffect(() => {
    if (!onBackToAdmin) return;
    const unregister = registerBackHandler('PiscineiroAdminPreview', 45, () => {
      if (isFormOpen) {
        setIsFormOpen(false);
        return true;
      }
      onBackToAdmin();
      return true;
    });
    return unregister;
  }, [onBackToAdmin, isFormOpen]);

  useEffect(() => {
    if (!isFormOpen) return;
    const unregister = registerBackHandler('PiscineiroFormModal', 50, () => {
      setIsFormOpen(false);
      return true;
    });
    return unregister;
  }, [isFormOpen]);

  // --- Metrics ---
  const metrics = useMemo(() => {
    const pendingChacara = stays.filter((s) => s.pool_status === 'pending').length;
    const completedChacara = stays.filter((s) => s.pool_status === 'completed').length;
    const pendingPersonal = personalServices.filter(
      (srv) => srv.status !== 'completed' && srv.status !== 'canceled'
    ).length;
    const completedPersonal = personalServices.filter((srv) => srv.status === 'completed').length;

    const upcomingCheckins = stays
      .filter((s) => s.checkin_date >= todayStr)
      .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date));
    const nextCheckin = upcomingCheckins[0] || null;

    return {
      pendingChacara,
      pendingPersonal,
      totalPending: pendingChacara + pendingPersonal,
      completedTotal: completedChacara + completedPersonal,
      nextCheckin,
    };
  }, [stays, personalServices, todayStr]);

  // --- Chácara Actions ---
  const handleTogglePoolStatus = async (stay: Stay) => {
    const nextStatus: StayPoolStatus = stay.pool_status === 'completed' ? 'pending' : 'completed';
    setUpdatingStayId(stay.id);
    try {
      await updateStayPoolStatus(stay.id, nextStatus, userProfile.full_name || 'Piscineiro');
      setStays((prev) =>
        prev.map((s) =>
          s.id === stay.id
            ? {
                ...s,
                pool_status: nextStatus,
                pool_cleaned_at: nextStatus === 'completed' ? new Date().toISOString() : null,
                pool_cleaned_by: nextStatus === 'completed' ? userProfile.full_name : null,
              }
            : s
        )
      );
      const msg =
        nextStatus === 'completed'
          ? `Piscina confirmada como limpa para ${stay.guest_name}!`
          : `Limpeza da piscina reaberta para ${stay.guest_name}.`;
      setFeedbackToast(msg);
      setTimeout(() => setFeedbackToast(null), 3500);
      onToast?.(msg);
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao atualizar limpeza da piscina.');
    } finally {
      setUpdatingStayId(null);
    }
  };

  // --- Personal Services Actions ---
  const handleOpenNewForm = (presetDate?: string) => {
    setEditingService(null);
    setFormTitle('Limpeza & Aspiração');
    setFormClientName('');
    setFormClientPhone('');
    setFormAddress('');
    setFormDate(presetDate || selectedDateFilter || todayStr);
    setFormStartTime('08:00');
    setFormEndTime('11:00');
    setFormCategory('limpeza_simples');
    setFormPrice('');
    setFormNotes('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (srv: PersonalService) => {
    setEditingService(srv);
    setFormTitle(srv.title);
    setFormClientName(srv.client_name || '');
    setFormClientPhone(srv.client_phone || '');
    setFormAddress(srv.address || '');
    setFormDate(srv.service_date);
    setFormStartTime(srv.start_time ? srv.start_time.slice(0, 5) : '08:00');
    setFormEndTime(srv.end_time ? srv.end_time.slice(0, 5) : '11:00');
    setFormCategory(srv.category || 'limpeza_simples');
    setFormPrice(srv.price !== null && srv.price !== undefined ? String(srv.price) : '');
    setFormNotes(srv.notes || '');
    setIsFormOpen(true);
  };

  const handleSavePersonalService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Informe o título do serviço.');
      return;
    }
    if (!formDate) {
      alert('Informe a data do serviço.');
      return;
    }

    setIsSaving(true);
    try {
      const userEmail = userProfile.email || 'piscineiro@chacara.com';
      const categoryMeta = getCategoryMeta(formCategory, 'piscineiro');

      if (editingService) {
        const updated = await updatePersonalService(
          editingService.id,
          {
            title: formTitle.trim(),
            client_name: formClientName.trim() || null,
            client_phone: formClientPhone.trim() || null,
            address: formAddress.trim() || null,
            service_date: formDate,
            start_time: formStartTime || null,
            end_time: formEndTime || null,
            category: formCategory || 'limpeza_simples',
            color: categoryMeta.color,
            price: null,
            notes: formNotes.trim() || null,
          },
          userEmail
        );

        if (updated) {
          setPersonalServices((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s))
          );
        }
        setFeedbackToast('Serviço atualizado com sucesso!');
      } else {
        const created = await createPersonalService({
          user_email: userEmail,
          staff_role: 'piscineiro',
          title: formTitle.trim(),
          client_name: formClientName.trim() || null,
          client_phone: formClientPhone.trim() || null,
          address: formAddress.trim() || null,
          service_date: formDate,
          start_time: formStartTime || null,
          end_time: formEndTime || null,
          category: formCategory || 'limpeza_simples',
          color: categoryMeta.color,
          price: null,
          status: 'scheduled',
          notes: formNotes.trim() || null,
        });

        if (created) {
          setPersonalServices((prev) => [created, ...prev]);
        }
        setFeedbackToast('Serviço adicionado ao calendário!');
      }

      setTimeout(() => setFeedbackToast(null), 3500);
      setIsFormOpen(false);
    } catch (err) {
      console.error('Erro ao salvar serviço:', err);
      alert('Erro ao salvar serviço. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePersonalStatus = async (srv: PersonalService) => {
    setUpdatingServiceId(srv.id);
    try {
      const userEmail = userProfile.email || 'piscineiro@chacara.com';
      const nextStatus = await togglePersonalServiceStatus(srv.id, srv.status, userEmail);
      setPersonalServices((prev) =>
        prev.map((s) => (s.id === srv.id ? { ...s, status: nextStatus } : s))
      );
      const msg =
        nextStatus === 'completed'
          ? `Serviço "${srv.title}" marcado como concluído!`
          : `Serviço "${srv.title}" reaberto na agenda.`;
      setFeedbackToast(msg);
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch (err) {
      console.error('Erro ao alternar status do serviço:', err);
    } finally {
      setUpdatingServiceId(null);
    }
  };

  const handleDeletePersonal = async (srv: PersonalService) => {
    if (!window.confirm(`Tem certeza que deseja excluir o serviço "${srv.title}"?`)) {
      return;
    }
    setUpdatingServiceId(srv.id);
    try {
      const userEmail = userProfile.email || 'piscineiro@chacara.com';
      await deletePersonalService(srv.id, userEmail);
      setPersonalServices((prev) => prev.filter((s) => s.id !== srv.id));
      setFeedbackToast('Serviço excluído da agenda.');
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch (err) {
      console.error('Erro ao excluir serviço:', err);
    } finally {
      setUpdatingServiceId(null);
    }
  };

  // --- Unified Items List ---
  const unifiedItems = useMemo<UnifiedPiscineiroItem[]>(() => {
    const list: UnifiedPiscineiroItem[] = [];

    // Chácara stays
    for (const stay of stays) {
      list.push({
        kind: 'chacara',
        id: `chacara-${stay.id}`,
        date: stay.checkin_date,
        time: stay.checkin_time || '14:00',
        stay,
      });
    }

    // Personal services
    for (const srv of personalServices) {
      list.push({
        kind: 'personal',
        id: `personal-${srv.id}`,
        date: srv.service_date,
        time: srv.start_time || '08:00',
        service: srv,
      });
    }

    return list;
  }, [stays, personalServices]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    let result = [...unifiedItems];

    // Filter by Tab
    if (filterTab === 'pending') {
      result = result.filter((item) => {
        if (item.kind === 'chacara') {
          return item.stay.pool_status === 'pending';
        }
        return item.service.status !== 'completed' && item.service.status !== 'canceled';
      });
    } else if (filterTab === 'chacara') {
      result = result.filter((item) => item.kind === 'chacara');
    } else if (filterTab === 'personal') {
      result = result.filter((item) => item.kind === 'personal');
    } else if (filterTab === 'completed') {
      result = result.filter((item) => {
        if (item.kind === 'chacara') {
          return item.stay.pool_status === 'completed';
        }
        return item.service.status === 'completed';
      });
    }

    // Filter by Selected Date
    if (selectedDateFilter) {
      result = result.filter((item) => {
        if (item.kind === 'chacara') {
          return (
            item.stay.checkin_date === selectedDateFilter ||
            item.stay.checkout_date === selectedDateFilter ||
            (item.stay.checkin_date <= selectedDateFilter &&
              selectedDateFilter <= item.stay.checkout_date)
          );
        }
        return item.service.service_date === selectedDateFilter;
      });
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((item) => {
        if (item.kind === 'chacara') {
          return (
            item.stay.guest_name.toLowerCase().includes(q) ||
            item.stay.code.toLowerCase().includes(q) ||
            (item.stay.chacara_name && item.stay.chacara_name.toLowerCase().includes(q))
          );
        }
        return (
          item.service.title.toLowerCase().includes(q) ||
          (item.service.client_name && item.service.client_name.toLowerCase().includes(q)) ||
          (item.service.address && item.service.address.toLowerCase().includes(q))
        );
      });
    }

    // Sort order:
    // 1. Pending items for today first
    // 2. Pending future items by date & time
    // 3. Completed items
    return result.sort((a, b) => {
      const isDoneA =
        a.kind === 'chacara'
          ? a.stay.pool_status === 'completed'
          : a.service.status === 'completed';
      const isDoneB =
        b.kind === 'chacara'
          ? b.stay.pool_status === 'completed'
          : b.service.status === 'completed';

      if (isDoneA !== isDoneB) return isDoneA ? 1 : -1;

      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.time.localeCompare(b.time);
    });
  }, [unifiedItems, filterTab, selectedDateFilter, searchQuery]);

  // Calendar month calculation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none max-w-full overflow-x-hidden">
      {/* Toast notification */}
      {feedbackToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-slate-900 border-2 border-sky-400 text-sky-200 shadow-2xl font-black text-sm flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-slate-950/95 border-b-2 border-slate-800/80 px-4 sm:px-6 py-4 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onBackToAdmin ? (
              <button
                type="button"
                onClick={onBackToAdmin}
                className="w-11 h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 border-2 border-slate-800 flex items-center justify-center text-white shrink-0 cursor-pointer"
                title="Voltar ao painel administrativo"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500/20 to-purple-500/20 border-2 border-sky-400/50 flex items-center justify-center text-sky-400 shrink-0 shadow-lg shadow-sky-500/20">
                <Droplets className="w-7 h-7 stroke-[2.5]" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white truncate">
                  Agenda Geral da Piscina
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-500/40">
                  Piscineiro
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Chácara &amp; Serviços Particulares
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-400 truncate">
                Olá, {userProfile.full_name} • Veja piscinas da chácara e manutenções particulares no mesmo lugar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Primary Action Button: Add Personal Service directly */}
            <button
              type="button"
              onClick={() => handleOpenNewForm()}
              title="Adicionar serviço particular na agenda"
              className="px-3.5 h-11 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs flex items-center gap-1.5 shadow-lg shadow-purple-600/30 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span className="hidden sm:inline">Novo Serviço</span>
              <span className="sm:hidden">Novo</span>
            </button>

            <button
              type="button"
              onClick={loadAll}
              disabled={isLoading}
              title="Atualizar estadias e serviços"
              className="w-11 h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 border-2 border-slate-800 flex items-center justify-center text-sky-400 cursor-pointer"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {onOpenAccessibility && (
              <button
                type="button"
                onClick={onOpenAccessibility}
                title="Ajustar tamanho da interface"
                className="w-11 h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 border-2 border-slate-800 flex items-center justify-center text-amber-400 cursor-pointer"
              >
                <Sliders className="w-5 h-5 stroke-[2.5]" />
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              title="Sair da conta"
              className="px-3 h-11 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border-2 border-rose-500/40 flex items-center gap-1.5 text-rose-300 font-black text-xs cursor-pointer"
            >
              <LogOut className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-5 pb-28">
        {/* Quick Add Banner */}
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-slate-900 via-purple-950/30 to-slate-900 border-2 border-purple-500/40 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 w-full sm:w-auto">
            <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 border-2 border-purple-400 shadow-lg shadow-purple-600/30">
              <CalendarIcon className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  Agenda Geral &amp; Clientes Particulares
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-purple-500/25 text-purple-200 border border-purple-400/50">
                  Google Calendar Style
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-300 mt-0.5">
                Suas manutenções particulares e as piscinas da chácara juntas no mesmo calendário.
              </p>
            </div>
          </div>

          <div className="w-full sm:w-auto flex justify-end shrink-0">
            <button
              type="button"
              onClick={() => handleOpenNewForm()}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Adicionar Serviço Particular</span>
            </button>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              setFilterTab('chacara');
              setSelectedDateFilter(null);
            }}
            className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              filterTab === 'chacara' && !selectedDateFilter
                ? 'bg-sky-500/20 border-sky-400 shadow-lg shadow-sky-500/15'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-xs font-black text-sky-300 flex items-center gap-1.5">
              <Droplets className="w-4 h-4" />
              Piscinas Chácara
            </span>
            <p className="text-2xl font-black text-white mt-1">{metrics.pendingChacara}</p>
            <span className="text-[10px] font-bold text-slate-400 block">pendentes p/ limpar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterTab('personal');
              setSelectedDateFilter(null);
            }}
            className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              filterTab === 'personal' && !selectedDateFilter
                ? 'bg-purple-500/20 border-purple-400 shadow-lg shadow-purple-500/15'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-xs font-black text-purple-300 flex items-center gap-1.5">
              <User className="w-4 h-4" />
              Particulares
            </span>
            <p className="text-2xl font-black text-white mt-1">{metrics.pendingPersonal}</p>
            <span className="text-[10px] font-bold text-slate-400 block">serviços agendados</span>
          </button>

          <div className="p-3.5 rounded-2xl border-2 bg-slate-900 border-slate-800 text-left">
            <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
              <LogIn className="w-4 h-4" />
              Próx. Chácara
            </span>
            <p className="text-base sm:text-lg font-black text-white mt-1 truncate">
              {metrics.nextCheckin ? formatDateBR(metrics.nextCheckin.checkin_date) : 'Sem reserva'}
            </p>
            {metrics.nextCheckin && (
              <span className="text-[10px] font-bold text-slate-400 block truncate">
                às {metrics.nextCheckin.checkin_time} ({metrics.nextCheckin.total_guests} pess.)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setFilterTab('completed');
              setSelectedDateFilter(null);
            }}
            className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              filterTab === 'completed' && !selectedDateFilter
                ? 'bg-emerald-500/20 border-emerald-400'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Concluídos
            </span>
            <p className="text-2xl font-black text-white mt-1">{metrics.completedTotal}</p>
            <span className="text-[10px] font-bold text-slate-400 block">chácara + particulares</span>
          </button>
        </div>

        {/* Filter Tabs + Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-900 p-1.5 rounded-2xl border-2 border-slate-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setFilterTab('pending');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterTab === 'pending'
                  ? 'bg-sky-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Para Fazer ({metrics.totalPending})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('chacara');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterTab === 'chacara'
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>Chácara ({stays.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('personal');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterTab === 'personal'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Particulares ({personalServices.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('calendar');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterTab === 'calendar'
                  ? 'bg-gradient-to-r from-sky-500 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendário</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('completed');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterTab === 'completed'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Concluídas</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('all');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-slate-700 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Todas</span>
            </button>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar hóspede, cliente ou código..."
              className="w-full pl-10 pr-8 py-2.5 rounded-2xl bg-slate-900 border-2 border-slate-800 text-xs sm:text-sm font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Selected Date Filter Banner */}
        {selectedDateFilter && (
          <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-sky-500/20 to-purple-500/20 border border-sky-400/50 flex items-center justify-between text-xs font-bold text-sky-200">
            <span>
              Mostrando tarefas e serviços do dia <strong>{formatDateBR(selectedDateFilter)}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenNewForm(selectedDateFilter)}
                className="px-2.5 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Adicionar neste dia</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateFilter(null)}
                className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Limpar data
              </button>
            </div>
          </div>
        )}

        {/* Central Action Button: Adicionar Serviço */}
        <div className="flex justify-center pt-1 pb-1">
          <button
            type="button"
            onClick={() => handleOpenNewForm()}
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-purple-600/35 border-2 border-purple-400 active:scale-95 transition-all cursor-pointer ring-4 ring-purple-500/20"
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <span>+ Adicionar Serviço Particular</span>
          </button>
        </div>

        {/* Monthly Calendar View (Unified: Chácara + Personal) */}
        {filterTab === 'calendar' && (
          <div className="p-4 rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setCurrentDate(new Date(year, month - 1, 1));
                  setSelectedDateFilter(null);
                }}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center">
                <h3 className="text-base sm:text-lg font-black text-white">
                  {monthNames[month]} {year}
                </h3>
                <span className="text-xs text-slate-400 font-semibold">
                  Toque em um dia para ver ou adicionar serviços
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCurrentDate(new Date(year, month + 1, 1));
                  setSelectedDateFilter(null);
                }}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-slate-500">
              <span>Dom</span>
              <span>Seg</span>
              <span>Ter</span>
              <span>Qua</span>
              <span>Qui</span>
              <span>Sex</span>
              <span>Sáb</span>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} className="h-20 sm:h-24 rounded-xl bg-slate-950/30 opacity-30" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isToday = dateStr === todayStr;
                const isSelected = selectedDateFilter === dateStr;

                const dayStays = stays.filter(
                  (s) =>
                    s.checkin_date === dateStr ||
                    s.checkout_date === dateStr ||
                    (s.checkin_date <= dateStr && dateStr <= s.checkout_date)
                );
                const dayServices = personalServices.filter((srv) => srv.service_date === dateStr);

                const hasCheckin = dayStays.some((s) => s.checkin_date === dateStr);
                const hasCheckout = dayStays.some((s) => s.checkout_date === dateStr);
                const hasPendingPool = dayStays.some((s) => s.pool_status === 'pending');
                const hasPersonal = dayServices.length > 0;
                const totalEvents = dayStays.length + dayServices.length;

                return (
                  <div
                    key={dateStr}
                    onClick={() => {
                      if (totalEvents > 0 || isSelected) {
                        setSelectedDateFilter(isSelected ? null : dateStr);
                      } else {
                        // If empty, quick prompt to add personal service on this date
                        handleOpenNewForm(dateStr);
                      }
                    }}
                    className={`h-20 sm:h-24 p-1.5 rounded-2xl border-2 transition-all flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500/25 border-sky-400 ring-2 ring-sky-400/40'
                        : isToday
                        ? 'bg-slate-900 border-amber-400/70'
                        : totalEvents > 0
                        ? 'bg-slate-950/90 border-slate-700 hover:border-sky-400/50'
                        : 'bg-slate-950/40 border-slate-800/60 text-slate-600 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-black ${
                          isSelected
                            ? 'text-sky-200'
                            : isToday
                            ? 'text-amber-300'
                            : 'text-slate-300'
                        }`}
                      >
                        {dayNum}
                      </span>
                      <div className="flex items-center gap-1">
                        {hasPendingPool && (
                          <span
                            className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"
                            title="Piscina da chácara pendente"
                          />
                        )}
                        {hasPersonal && (
                          <span
                            className="w-2 h-2 rounded-full bg-purple-400"
                            title="Serviço particular agendado"
                          />
                        )}
                      </div>
                    </div>

                    <div className="space-y-0.5 overflow-hidden">
                      {hasCheckin && (
                        <div className="text-[9px] font-black px-1 rounded bg-sky-500 text-slate-950 truncate">
                          Entrada Chácara
                        </div>
                      )}
                      {hasCheckout && (
                        <div className="text-[9px] font-black px-1 rounded bg-amber-500/25 text-amber-300 truncate">
                          Saída Chácara
                        </div>
                      )}
                      {dayServices.slice(0, 2).map((srv) => (
                        <div
                          key={srv.id}
                          className="text-[9px] font-bold px-1 rounded bg-purple-500/30 text-purple-200 border border-purple-500/40 truncate"
                        >
                          {srv.start_time ? `${formatTimeShort(srv.start_time)} ` : ''}
                          {srv.title}
                        </div>
                      ))}
                      {dayServices.length > 2 && (
                        <div className="text-[8px] font-bold text-purple-300 px-1 truncate">
                          +{dayServices.length - 2} mais
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unified Items Feed (Chácara Stays + Personal Services) */}
        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-9 h-9 text-sky-400 animate-spin mx-auto" />
            <p className="text-sm font-bold text-slate-400">
              Carregando calendário geral e serviços...
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center rounded-3xl bg-slate-900 border-2 border-slate-800 p-6 space-y-4">
            <CheckCircle2 className="w-11 h-11 text-emerald-400 mx-auto" />
            <h3 className="text-lg font-black text-white">Nenhum compromisso encontrado!</h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              {filterTab === 'pending'
                ? 'Todas as piscinas e serviços particulares agendados estão em dia!'
                : 'Nenhum item corresponde aos filtros selecionados.'}
            </p>
            <button
              type="button"
              onClick={() => handleOpenNewForm()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-lg transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Agendar Novo Serviço Particular</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              if (item.kind === 'chacara') {
                const stay = item.stay;
                const urgency = getPoolUrgencyMeta(stay, todayStr);
                const isDone = stay.pool_status === 'completed';
                const isUpdating = updatingStayId === stay.id;

                return (
                  <div
                    key={item.id}
                    className={`p-4 sm:p-5 rounded-3xl border-2 shadow-xl space-y-4 transition-all ${
                      isDone
                        ? 'bg-emerald-950/20 border-emerald-500/40'
                        : urgency.tone === 'urgent'
                        ? 'bg-sky-950/30 border-sky-400'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    {/* Chácara Header Tag */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wide bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1.5">
                          <Droplets className="w-3.5 h-3.5" />
                          <span>Piscina Chácara Conceição</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-slate-950 text-slate-400 font-mono text-[11px] font-bold border border-slate-800">
                          {stay.code}
                        </span>
                      </div>

                      <span className="text-xs font-bold text-slate-400">
                        {stay.chacara_name || 'Chácara Principal'}
                      </span>
                    </div>

                    {/* Urgency Strip */}
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-xs font-black uppercase tracking-wide flex items-center gap-2 ${
                        isDone
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : urgency.tone === 'urgent'
                          ? 'bg-amber-400 text-slate-950'
                          : urgency.tone === 'info'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      {isDone ? (
                        <Check className="w-4 h-4 stroke-[3] shrink-0" />
                      ) : urgency.tone === 'urgent' ? (
                        <Flame className="w-4 h-4 fill-slate-950 shrink-0" />
                      ) : (
                        <Droplets className="w-4 h-4 shrink-0" />
                      )}
                      <span>{urgency.label}</span>
                    </div>

                    {/* Guest Name & Details */}
                    <div>
                      <h3 className="text-lg font-black text-white">{stay.guest_name}</h3>
                    </div>

                    {/* Period & Guests Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                      <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-400 text-xs">
                          <Clock className="w-4 h-4 text-sky-400" />
                          <span>Entrada e Saída dos Hóspedes</span>
                        </div>
                        <p className="font-black text-white">
                          Entrada: {formatDateBR(stay.checkin_date)} às {stay.checkin_time}
                        </p>
                        <p className="font-bold text-slate-300">
                          Saída: {formatDateBR(stay.checkout_date)} às {stay.checkout_time}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-400 text-xs">
                          <Users className="w-4 h-4 text-purple-400" />
                          <span>Quantidade de Pessoas</span>
                        </div>
                        <p className="font-black text-white text-base">
                          {stay.total_guests} hóspede{stay.total_guests === 1 ? '' : 's'}
                        </p>
                        <span className="text-xs text-slate-400 font-semibold block">
                          {stay.guests_adults} adultos
                          {stay.guests_children > 0 ? ` • ${stay.guests_children} crianças` : ''}
                          {stay.guests_pets > 0 ? ` • ${stay.guests_pets} pet(s)` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Notes */}
                    {stay.special_requests && (
                      <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800/80 text-xs text-slate-300">
                        <strong className="text-sky-300">Observações da Reserva: </strong>
                        {stay.special_requests}
                      </div>
                    )}

                    {/* Big Action Button */}
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleTogglePoolStatus(stay)}
                        className={`w-full sm:w-auto px-5 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-60 ${
                          isDone
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/25'
                        }`}
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Salvando...</span>
                          </>
                        ) : isDone ? (
                          <>
                            <RotateCcw className="w-4 h-4" />
                            <span>Reabrir Limpeza</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                            <span>Confirmar Piscina Limpa</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              }

              // Personal Service Item
              const srv = item.service;
              const isDone = srv.status === 'completed';
              const isUpdating = updatingServiceId === srv.id;
              const categoryMeta = getCategoryMeta(srv.category, 'piscineiro');
              const waLink = getWhatsAppLink(srv.client_phone, srv.client_name);
              const mapsLink = getGoogleMapsLink(srv.address);
              const phoneLink = getPhoneCallLink(srv.client_phone);

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 rounded-3xl border-2 shadow-xl space-y-4 transition-all ${
                    isDone
                      ? 'bg-emerald-950/20 border-emerald-500/40 opacity-80'
                      : 'bg-slate-900 border-purple-500/40 hover:border-purple-400'
                  }`}
                >
                  {/* Header: Badge & Date */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wide bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span>Serviço Particular</span>
                      </span>

                      <span
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold ${categoryMeta.bgClass} ${categoryMeta.textClass} border ${categoryMeta.borderClass}`}
                      >
                        {categoryMeta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-300 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
                      <Clock className="w-3.5 h-3.5 text-purple-400" />
                      <span>{formatDateBR(srv.service_date)}</span>
                      {srv.start_time && (
                        <span className="text-purple-300">
                          • {formatTimeShort(srv.start_time)}
                          {srv.end_time ? ` às ${formatTimeShort(srv.end_time)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Client Name */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3
                        className={`text-lg font-black text-white ${
                          isDone ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {srv.title}
                      </h3>
                      {srv.client_name && (
                        <p className="text-xs sm:text-sm font-bold text-purple-200 mt-0.5 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span>Cliente: {srv.client_name}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Address */}
                  {srv.address && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="truncate">{srv.address}</span>
                    </div>
                  )}

                  {/* Notes */}
                  {srv.notes && (
                    <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800/80 text-xs text-slate-300">
                      <strong className="text-purple-300">Observações: </strong>
                      {srv.notes}
                    </div>
                  )}

                  {/* Quick Client Contact Buttons */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {waLink && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-xs font-bold border border-emerald-500/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    )}

                    {mapsLink && (
                      <a
                        href={mapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 text-xs font-bold border border-sky-500/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Como Chegar</span>
                      </a>
                    )}

                    {phoneLink && (
                      <a
                        href={phoneLink}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Ligar</span>
                      </a>
                    )}
                  </div>

                  {/* Footer Actions: Complete, Edit, Delete */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditForm(srv)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        title="Editar serviço"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePersonal(srv)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/30 text-slate-300 hover:text-rose-300 transition-colors cursor-pointer"
                        title="Excluir serviço"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleTogglePersonalStatus(srv)}
                      className={`px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-60 ${
                        isDone
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                          : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25'
                      }`}
                    >
                      {isUpdating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isDone ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reabrir Serviço</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Marcar Concluído</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Embedded Personal Service Form Modal (Create / Edit) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border-2 border-purple-500/50 rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Form Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-400 text-purple-300 flex items-center justify-center shrink-0">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {editingService ? 'Editar Serviço Particular' : 'Novo Serviço de Piscina'}
                  </h3>
                  <p className="text-xs text-slate-400 font-bold">
                    Cadastre manutenções particulares e clientes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSavePersonalService} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
              {/* 1. Serviço com sugestões de 1 clique */}
              <div>
                <label className="block font-bold text-slate-200 mb-1">Qual é o serviço? *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Limpeza de Piscina, Troca de Areia..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                />
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {PRESET_PISCINEIRO_TITLES.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormTitle(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        formTitle === preset
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Data com botões Hoje e Amanhã */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-200">Data do Serviço *</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormDate(todayStr)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        setFormDate(tomorrow.toISOString().slice(0, 10));
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                    >
                      Amanhã
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                />
              </div>

              {/* 3. Horários: Início e Término */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-200 mb-1">Horário Início *</label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-200 mb-1">Horário Término</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* 4. Cliente ou Local (opcional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Cliente ou Local (opcional)</label>
                  <input
                    type="text"
                    value={formClientName}
                    onChange={(e) => setFormClientName(e.target.value)}
                    placeholder="Ex: Dr. Marcelo, Sítio..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">WhatsApp / Telefone (opcional)</label>
                  <input
                    type="tel"
                    value={formClientPhone}
                    onChange={(e) => setFormClientPhone(e.target.value)}
                    placeholder="Ex: (11) 99999-9999"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs"
                  />
                </div>
              </div>

              {/* Endereço (opcional) */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">Endereço (opcional)</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Ex: Rua das Flores, 123 ou Condomínio Portal do Sol"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black flex items-center gap-1.5 shadow-lg shadow-purple-600/25 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  )}
                  <span>{editingService ? 'Salvar Alterações' : 'Salvar no Calendário'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Central Action Button (FAB) */}
      {!isFormOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <button
            type="button"
            onClick={() => handleOpenNewForm()}
            className="pointer-events-auto px-6 py-3.5 sm:px-8 sm:py-4 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm sm:text-base flex items-center gap-2.5 shadow-2xl shadow-purple-600/60 border-2 border-purple-300 active:scale-95 transition-all cursor-pointer backdrop-blur-md ring-4 ring-purple-500/30"
          >
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <Plus className="w-4 h-4 stroke-[3]" />
            </div>
            <span>Adicionar Serviço</span>
          </button>
        </div>
      )}
    </div>
  );
};
