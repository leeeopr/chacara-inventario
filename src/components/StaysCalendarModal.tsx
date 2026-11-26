import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Droplets,
  Edit2,
  Eye,
  Filter,
  Flame,
  Home,
  Layers,
  List,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
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
  getStayTemporalStatus,
  markStayEverythingCompleted,
  reopenStayEverything,
  updateStayCleaningStatus,
  updateStayPoolStatus,
} from '../services/staysService';
import { UserRole } from '../types/auth';
import {
  getCategoriesForRole,
  getCategoryMeta,
  PersonalService,
} from '../types/personalService';
import { Stay, StayCleaningStatus, StayPoolStatus } from '../types/stay';

export type UnifiedAgendaItem =
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

interface StaysCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartChecklistForStay: (stay: Stay) => void;
  onViewHistoryForStay?: (sessionId: string) => void;
  userRole?: UserRole;
  userName?: string;
  userEmail?: string;
  onStaysUpdated?: () => void;
  initialOpenServiceForm?: boolean;
}

export const StaysCalendarModal: React.FC<StaysCalendarModalProps> = ({
  isOpen,
  onClose,
  onStartChecklistForStay,
  onViewHistoryForStay,
  userRole = 'admin',
  userName = 'Proprietário',
  userEmail = 'admin@chacara.com',
  onStaysUpdated,
  initialOpenServiceForm = false,
}) => {
  const [stays, setStays] = useState<Stay[]>([]);
  const [personalServices, setPersonalServices] = useState<PersonalService[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Card update states
  const [updatingCleaningId, setUpdatingCleaningId] = useState<string | null>(null);
  const [updatingPoolId, setUpdatingPoolId] = useState<string | null>(null);
  const [updatingEverythingId, setUpdatingEverythingId] = useState<string | null>(null);
  const [isBatchCompleting, setIsBatchCompleting] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Search & Filter Tabs
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
  const [formEndTime, setFormEndTime] = useState('12:00');
  const [formCategory, setFormCategory] = useState('geral');
  const [formPrice, setFormPrice] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const todayStr = getLocalTodayDateStr();
  const categories = useMemo(() => getCategoriesForRole(userRole), [userRole]);

  // Load both Chácara Stays and Personal Services in parallel
  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [staysData, personalData] = await Promise.all([
        fetchStays().catch(() => []),
        fetchPersonalServices(userEmail || 'default@chacara.com').catch(() => []),
      ]);
      setStays(staysData);
      setPersonalServices(personalData);
    } catch (err) {
      console.error('Erro ao sincronizar agenda unificada:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAll();
      if (initialOpenServiceForm) {
        handleOpenNewForm();
      }
    }
  }, [isOpen, userEmail, initialOpenServiceForm]);

  // Android Back Handler
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerBackHandler('StaysCalendarModal', 60, () => {
      if (isFormOpen) {
        setIsFormOpen(false);
        return true;
      }
      onClose();
      return true;
    });
    return unregister;
  }, [isOpen, isFormOpen, onClose]);

  // --- Chácara Actions ---
  const handleToggleCleaning = async (stay: Stay) => {
    const nextStatus: StayCleaningStatus =
      stay.cleaning_status === 'completed' ? 'pending' : 'completed';
    setUpdatingCleaningId(stay.id);
    try {
      await updateStayCleaningStatus(stay.id, nextStatus, userName || 'Faxineira');
      setStays((prev) =>
        prev.map((s) =>
          s.id === stay.id
            ? {
                ...s,
                cleaning_status: nextStatus,
                cleaning_completed_at: nextStatus === 'completed' ? new Date().toISOString() : null,
                cleaning_completed_by: nextStatus === 'completed' ? userName : null,
              }
            : s
        )
      );
      onStaysUpdated?.();
    } catch (err) {
      console.error('Erro ao atualizar faxina:', err);
    } finally {
      setUpdatingCleaningId(null);
    }
  };

  const handleTogglePool = async (stay: Stay) => {
    const nextStatus: StayPoolStatus =
      stay.pool_status === 'completed' ? 'pending' : 'completed';
    setUpdatingPoolId(stay.id);
    try {
      await updateStayPoolStatus(stay.id, nextStatus, userName || 'Proprietário');
      setStays((prev) =>
        prev.map((s) =>
          s.id === stay.id
            ? {
                ...s,
                pool_status: nextStatus,
                pool_cleaned_at: nextStatus === 'completed' ? new Date().toISOString() : null,
                pool_cleaned_by: nextStatus === 'completed' ? userName : null,
              }
            : s
        )
      );
      onStaysUpdated?.();
    } catch (err) {
      console.error('Erro ao atualizar piscina:', err);
    } finally {
      setUpdatingPoolId(null);
    }
  };

  const handleMarkEverythingCompleted = async (stay: Stay) => {
    if (userRole !== 'admin') return;
    setUpdatingEverythingId(stay.id);
    try {
      await markStayEverythingCompleted(stay, userName || 'Proprietário');
      const nowIso = new Date().toISOString();
      setStays((prev) =>
        prev.map((s) =>
          s.id === stay.id
            ? {
                ...s,
                checklist_status: 'completed',
                checklist_completed_at: nowIso,
                checklist_inspector_name: userName || 'Proprietário',
                cleaning_status: 'completed',
                cleaning_completed_at: nowIso,
                cleaning_completed_by: userName || 'Proprietário',
                pool_status: 'completed',
                pool_cleaned_at: nowIso,
                pool_cleaned_by: userName || 'Proprietário',
              }
            : s
        )
      );
      setFeedbackToast(`Estadia ${stay.code} marcada como 100% concluída!`);
      setTimeout(() => setFeedbackToast(null), 3500);
      onStaysUpdated?.();
    } catch (err) {
      console.error('Erro ao marcar tudo concluído:', err);
      alert('Erro ao marcar tudo concluído. Tente novamente.');
    } finally {
      setUpdatingEverythingId(null);
    }
  };

  const handleReopenEverything = async (stay: Stay) => {
    if (userRole !== 'admin') return;
    if (!window.confirm(`Deseja reabrir as pendências da estadia ${stay.code}?`)) return;
    setUpdatingEverythingId(stay.id);
    try {
      await reopenStayEverything(stay);
      setStays((prev) =>
        prev.map((s) =>
          s.id === stay.id
            ? {
                ...s,
                checklist_status: 'pending',
                checklist_completed_at: null,
                checklist_inspector_name: null,
                cleaning_status: 'pending',
                cleaning_completed_at: null,
                cleaning_completed_by: null,
                pool_status: 'pending',
                pool_cleaned_at: null,
                pool_cleaned_by: null,
              }
            : s
        )
      );
      setFeedbackToast(`Pendências da estadia ${stay.code} reabertas.`);
      setTimeout(() => setFeedbackToast(null), 3500);
      onStaysUpdated?.();
    } catch (err) {
      console.error('Erro ao reabrir estadia:', err);
    } finally {
      setUpdatingEverythingId(null);
    }
  };

  const pastPendingStays = useMemo(() => {
    return stays.filter(
      (s) =>
        s.status !== 'CANCELADA' &&
        s.checkout_date <= todayStr &&
        (s.checklist_status === 'pending' ||
          s.cleaning_status === 'pending' ||
          s.pool_status === 'pending')
    );
  }, [stays, todayStr]);

  const handleBatchCompletePastStays = async () => {
    if (userRole !== 'admin' || pastPendingStays.length === 0) return;
    const confirmed = window.confirm(
      `Deseja marcar todas as ${pastPendingStays.length} estadias passadas pendentes como CONCLUÍDAS (Vistoria, Faxina e Piscina)?`
    );
    if (!confirmed) return;

    setIsBatchCompleting(true);
    try {
      for (const stay of pastPendingStays) {
        await markStayEverythingCompleted(stay, userName || 'Proprietário');
      }
      const nowIso = new Date().toISOString();
      const updatedIds = new Set(pastPendingStays.map((s) => s.id));
      setStays((prev) =>
        prev.map((s) =>
          updatedIds.has(s.id)
            ? {
                ...s,
                checklist_status: 'completed',
                checklist_completed_at: nowIso,
                checklist_inspector_name: userName || 'Proprietário',
                cleaning_status: 'completed',
                cleaning_completed_at: nowIso,
                cleaning_completed_by: userName || 'Proprietário',
                pool_status: 'completed',
                pool_cleaned_at: nowIso,
                pool_cleaned_by: userName || 'Proprietário',
              }
            : s
        )
      );
      setFeedbackToast(`${pastPendingStays.length} estadias passadas foram concluídas!`);
      setTimeout(() => setFeedbackToast(null), 4000);
      onStaysUpdated?.();
    } catch (err) {
      console.error('Erro ao concluir lote:', err);
    } finally {
      setIsBatchCompleting(false);
    }
  };

  const presetTitles = useMemo(() => {
    if (userRole === 'piscineiro') {
      return ['Limpeza & Aspiração', 'Tratamento com Cloro', 'Troca de Areia', 'Manutenção Bomba', 'Outro Serviço'];
    }
    if (userRole === 'faxineira') {
      return ['Faxina', 'Faxina Pesada', 'Passadoria', 'Diarista', 'Outro Serviço'];
    }
    return ['Faxina', 'Limpeza Piscina', 'Manutenção Geral', 'Outro Serviço'];
  }, [userRole]);

  // --- Personal Services Actions ---
  const handleOpenNewForm = (presetDate?: string, presetHour?: string) => {
    setEditingService(null);
    const dateVal = presetDate || selectedDateFilter || todayStr;
    const startHour = presetHour ? presetHour.slice(0, 5) : '08:00';
    const [h, m] = startHour.split(':').map(Number);
    const endHourNum = Math.min(h + 3, 23);
    const endHour = `${String(endHourNum).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;

    setFormTitle(
      userRole === 'faxineira'
        ? 'Faxina'
        : userRole === 'piscineiro'
        ? 'Limpeza de Piscina'
        : 'Serviço'
    );
    setFormClientName('');
    setFormClientPhone('');
    setFormAddress('');
    setFormDate(dateVal);
    setFormStartTime(startHour);
    setFormEndTime(endHour);
    setFormCategory('geral');
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
    setFormEndTime(srv.end_time ? srv.end_time.slice(0, 5) : '12:00');
    setFormCategory(srv.category || 'geral');
    setFormPrice('');
    setFormNotes(srv.notes || '');
    setIsFormOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
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
      if (editingService) {
        const updated = await updatePersonalService(
          editingService.id,
          {
            title: formTitle.trim(),
            client_name: formClientName.trim() || null,
            client_phone: formClientPhone.trim() || null,
            address: formAddress.trim() || null,
            service_date: formDate,
            start_time: formStartTime,
            end_time: formEndTime,
            category: formCategory || 'geral',
            price: null,
            notes: formNotes.trim() || null,
          },
          userEmail || 'default@chacara.com'
        );
        setPersonalServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        setFeedbackToast('Serviço atualizado com sucesso!');
        setTimeout(() => setFeedbackToast(null), 3000);
      } else {
        const created = await createPersonalService({
          user_email: userEmail || 'default@chacara.com',
          staff_role: userRole,
          title: formTitle.trim(),
          client_name: formClientName.trim() || null,
          client_phone: formClientPhone.trim() || null,
          address: formAddress.trim() || null,
          service_date: formDate,
          start_time: formStartTime,
          end_time: formEndTime,
          category: formCategory || 'geral',
          color: '#8b5cf6',
          price: null,
          status: 'scheduled',
          notes: formNotes.trim() || null,
        });
        setPersonalServices((prev) => [...prev, created]);
        setFeedbackToast('Novo serviço agendado!');
        setTimeout(() => setFeedbackToast(null), 3000);
      }
      setIsFormOpen(false);
    } catch (err) {
      console.error('Erro ao salvar serviço:', err);
      alert('Falha ao salvar o serviço.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePersonalStatus = async (srv: PersonalService) => {
    try {
      const next = await togglePersonalServiceStatus(
        srv.id,
        srv.status,
        userEmail || 'default@chacara.com'
      );
      setPersonalServices((prev) =>
        prev.map((s) => (s.id === srv.id ? { ...s, status: next } : s))
      );
      setFeedbackToast(next === 'completed' ? 'Serviço concluído!' : 'Serviço reaberto.');
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch (err) {
      console.error('Erro ao alternar status do serviço:', err);
    }
  };

  const handleDeletePersonalService = async (srv: PersonalService) => {
    if (!window.confirm(`Excluir o agendamento "${srv.title}"?`)) return;
    try {
      await deletePersonalService(srv.id, userEmail || 'default@chacara.com');
      setPersonalServices((prev) => prev.filter((s) => s.id !== srv.id));
      setFeedbackToast('Serviço excluído.');
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch (err) {
      console.error('Erro ao excluir:', err);
    }
  };

  // --- Metrics Summary ---
  const metrics = useMemo(() => {
    const activeStays = stays.filter((s) => s.status !== 'CANCELADA');
    const pendingChecklists = stays.filter((s) => s.checklist_status === 'pending').length;
    const pendingCleanings = activeStays.filter(
      (s) => s.checkout_date <= todayStr && s.cleaning_status === 'pending'
    ).length;
    const pendingPersonal = personalServices.filter((s) => s.status === 'scheduled').length;
    const completedChacara = stays.filter(
      (s) =>
        (s.checklist_status === 'completed' || s.checklist_status === 'with_issues') &&
        s.cleaning_status === 'completed' &&
        s.pool_status === 'completed'
    ).length;
    const completedPersonal = personalServices.filter((s) => s.status === 'completed').length;
    const totalEarnings = personalServices
      .filter((s) => s.status === 'completed' && s.price)
      .reduce((sum, s) => sum + (s.price || 0), 0);

    return {
      totalStays: stays.length,
      pendingChecklists,
      pendingCleanings,
      pendingPersonal,
      completedTotal: completedChacara + completedPersonal,
      totalEarnings,
    };
  }, [stays, personalServices, todayStr]);

  // --- Unified Items List (Chácara Stays + Personal Services) ---
  const unifiedItems = useMemo(() => {
    const items: UnifiedAgendaItem[] = [];

    // 1. Add Chácara Stays
    for (const stay of stays) {
      items.push({
        kind: 'chacara',
        id: `chacara-${stay.id}`,
        date: stay.checkout_date,
        time: stay.checkout_time || '12:00',
        stay,
      });
    }

    // 2. Add Personal Services
    for (const srv of personalServices) {
      items.push({
        kind: 'personal',
        id: `personal-${srv.id}`,
        date: srv.service_date,
        time: srv.start_time || '08:00',
        service: srv,
      });
    }

    // Sort chronologically (closest date & time first)
    return items.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.time.localeCompare(b.time);
    });
  }, [stays, personalServices]);

  // Filtered Items based on Tab & Search & Date Filter
  const filteredItems = useMemo(() => {
    let list = [...unifiedItems];

    // Filter by Tab
    if (filterTab === 'pending') {
      list = list.filter((item) => {
        if (item.kind === 'chacara') {
          return (
            item.stay.checklist_status === 'pending' ||
            (item.stay.status !== 'CANCELADA' &&
              item.stay.checkout_date <= todayStr &&
              (item.stay.cleaning_status === 'pending' || item.stay.pool_status === 'pending'))
          );
        }
        return item.service.status === 'scheduled';
      });
    } else if (filterTab === 'chacara') {
      list = list.filter((item) => item.kind === 'chacara');
    } else if (filterTab === 'personal') {
      list = list.filter((item) => item.kind === 'personal');
    } else if (filterTab === 'completed') {
      list = list.filter((item) => {
        if (item.kind === 'chacara') {
          return (
            (item.stay.checklist_status === 'completed' ||
              item.stay.checklist_status === 'with_issues') &&
            item.stay.cleaning_status === 'completed' &&
            item.stay.pool_status === 'completed'
          );
        }
        return item.service.status === 'completed';
      });
    }

    // Filter by specific day clicked on calendar
    if (selectedDateFilter) {
      list = list.filter((item) => {
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

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        if (item.kind === 'chacara') {
          return (
            item.stay.guest_name.toLowerCase().includes(q) ||
            item.stay.code.toLowerCase().includes(q) ||
            (item.stay.guest_phone && item.stay.guest_phone.includes(q))
          );
        }
        return (
          item.service.title.toLowerCase().includes(q) ||
          (item.service.client_name && item.service.client_name.toLowerCase().includes(q)) ||
          (item.service.address && item.service.address.toLowerCase().includes(q)) ||
          (item.service.client_phone && item.service.client_phone.includes(q))
        );
      });
    }

    return list;
  }, [unifiedItems, filterTab, selectedDateFilter, searchQuery, todayStr]);

  if (!isOpen) return null;

  // Calendar Month Calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDateFilter(null);
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDateFilter(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[94vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  Agenda Geral: Chácara &amp; Serviços
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-extrabold text-[10px] border border-indigo-500/30">
                  {userRole === 'faxineira'
                    ? 'Faxineira • Chácara + Meus Serviços'
                    : userRole === 'piscineiro'
                    ? 'Piscineiro • Chácara + Meus Clientes'
                    : 'Proprietário • Visão Unificada'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Saídas da chácara, vistorias e seus serviços do dia a dia no mesmo calendário.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Action to create personal service right here */}
            <button
              type="button"
              onClick={() => handleOpenNewForm()}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs flex items-center gap-1.5 shadow-lg shadow-purple-600/25 transition-all cursor-pointer active:scale-95 shrink-0"
              title="Adicionar serviço particular na agenda"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Serviço</span>
            </button>
            <button
              type="button"
              onClick={loadAll}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="Atualizar agenda"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 p-3 sm:p-4 bg-slate-950/40 border-b border-slate-800/80 shrink-0">
          {/* 1. Checklists Chácara */}
          <div
            onClick={() => {
              setFilterTab('pending');
              setSelectedDateFilter(null);
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === 'pending' && !selectedDateFilter
                ? 'bg-amber-500/20 border-amber-500/60 ring-1 ring-amber-500/50 shadow-lg'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-amber-400">
              <span className="flex items-center gap-1.5 truncate">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Checklists Chácara
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[11px] font-black">
                {metrics.pendingChecklists}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-white mt-1">
              {metrics.pendingChecklists}
            </p>
          </div>

          {/* 2. Faxinas Chácara */}
          <div
            onClick={() => {
              setFilterTab('chacara');
              setSelectedDateFilter(null);
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === 'chacara' && !selectedDateFilter
                ? 'bg-indigo-500/20 border-indigo-400 ring-1 ring-indigo-500/50 shadow-lg'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
              <span className="flex items-center gap-1.5 truncate">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                Faxinas Chácara
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-[11px] font-black">
                {metrics.pendingCleanings}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-white mt-1">
              {metrics.pendingCleanings}
            </p>
          </div>

          {/* 3. Meus Serviços Particulares Agendados */}
          <div
            onClick={() => {
              setFilterTab('personal');
              setSelectedDateFilter(null);
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === 'personal' && !selectedDateFilter
                ? 'bg-purple-500/20 border-purple-400 ring-1 ring-purple-500/50 shadow-lg'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-purple-300">
              <span className="flex items-center gap-1.5 truncate">
                <User className="w-3.5 h-3.5 shrink-0" />
                Serviços Particulares
              </span>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-[11px] font-black">
                {metrics.pendingPersonal}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-white mt-1">
              {metrics.pendingPersonal}
            </p>
          </div>

          {/* 4. Concluídos (Chácara + Particulares) */}
          <div
            onClick={() => {
              setFilterTab('completed');
              setSelectedDateFilter(null);
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === 'completed' && !selectedDateFilter
                ? 'bg-emerald-500/20 border-emerald-500/60 ring-1 ring-emerald-500/50'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
              <span className="flex items-center gap-1.5 truncate">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Concluídos
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-[11px] font-black">
                {metrics.completedTotal}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-white mt-1">
              {metrics.completedTotal}
            </p>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/30 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setFilterTab('pending');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                filterTab === 'pending'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Pendências ({metrics.pendingChecklists + metrics.pendingCleanings + metrics.pendingPersonal})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('chacara');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                filterTab === 'chacara'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Chácara</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('personal');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                filterTab === 'personal'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Particulares</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('calendar');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                filterTab === 'calendar'
                  ? 'bg-slate-800 text-white ring-1 ring-slate-700'
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
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
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
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                filterTab === 'all'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Todas</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar hóspede, cliente, código..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Selected date chip indicator if any */}
        {selectedDateFilter && (
          <div className="px-4 sm:px-6 py-2 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between text-xs font-bold text-indigo-300">
            <span>
              Filtrando agenda do dia <strong>{formatDateBR(selectedDateFilter)}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenNewForm(selectedDateFilter)}
                className="px-2.5 py-1 rounded-lg bg-indigo-500 text-white text-[11px] font-black flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3 h-3" />
                <span>Adicionar Neste Dia</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateFilter(null)}
                className="px-2 py-0.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 text-[11px] font-bold"
              >
                Limpar filtro
              </button>
            </div>
          </div>
        )}

        {/* Central Action Button: Adicionar Serviço */}
        <div className="px-4 sm:px-6 pt-3 pb-1 flex justify-center shrink-0">
          <button
            type="button"
            onClick={() => handleOpenNewForm()}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-purple-600/35 border-2 border-purple-400 active:scale-95 transition-all cursor-pointer ring-4 ring-purple-500/20"
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <span>+ Adicionar Serviço Particular</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 pb-28">
          {/* Calendar Month View */}
          {filterTab === 'calendar' && (
            <div className="p-4 rounded-3xl bg-slate-950/80 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-center">
                  <h3 className="text-base font-black text-white">
                    {monthNames[month]} {year}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-semibold">
                    Toque em um dia para ver estadias da chácara e seus serviços particulares
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-extrabold uppercase text-slate-500 pb-1">
                <span>Dom</span>
                <span>Seg</span>
                <span>Ter</span>
                <span>Qua</span>
                <span>Qui</span>
                <span>Sex</span>
                <span>Sáb</span>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-16 sm:h-20 rounded-xl bg-slate-900/20 opacity-30" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const isSelected = selectedDateFilter === dateStr;

                  // Find Chácara stays affecting this day
                  const dayStays = stays.filter(
                    (s) =>
                      s.checkin_date === dateStr ||
                      s.checkout_date === dateStr ||
                      (s.checkin_date <= dateStr && dateStr <= s.checkout_date)
                  );
                  const hasCheckin = dayStays.some((s) => s.checkin_date === dateStr);
                  const hasCheckout = dayStays.some((s) => s.checkout_date === dateStr);

                  // Find Personal services on this day
                  const dayPersonal = personalServices.filter((s) => s.service_date === dateStr);

                  const hasPendingTask =
                    dayStays.some((s) => s.checklist_status === 'pending') ||
                    dayStays.some((s) => s.status !== 'CANCELADA' && s.checkout_date <= todayStr && s.cleaning_status === 'pending') ||
                    dayPersonal.some((s) => s.status === 'scheduled');

                  return (
                    <div
                      key={dateStr}
                      onClick={() => {
                        setSelectedDateFilter(isSelected ? null : dateStr);
                      }}
                      className={`h-16 sm:h-20 p-1 sm:p-2 rounded-2xl border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-indigo-500/25 border-indigo-400 ring-2 ring-indigo-400/50 shadow-lg'
                          : dayStays.length > 0 || dayPersonal.length > 0
                          ? 'bg-slate-900/90 border-slate-700 hover:border-indigo-500/40 cursor-pointer'
                          : 'bg-slate-950/40 border-slate-800/60 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-black ${isSelected ? 'text-indigo-300' : 'text-slate-300'}`}>
                          {dayNum}
                        </span>
                        {hasPendingTask && (
                          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                        )}
                      </div>

                      {/* Day pills */}
                      <div className="space-y-0.5 overflow-hidden">
                        {hasCheckin && (
                          <div className="text-[9px] font-black px-1 rounded bg-emerald-500/20 text-emerald-300 truncate">
                            Entrada Chácara
                          </div>
                        )}
                        {hasCheckout && (
                          <div className="text-[9px] font-black px-1 rounded bg-amber-500/25 text-amber-200 truncate">
                            Saída Chácara
                          </div>
                        )}
                        {dayPersonal.slice(0, 1).map((ps) => (
                          <div
                            key={ps.id}
                            className="text-[9px] font-bold px-1 rounded bg-purple-500/25 text-purple-200 truncate"
                          >
                            {formatTimeShort(ps.start_time)} {ps.title}
                          </div>
                        ))}
                        {dayPersonal.length > 1 && (
                          <div className="text-[8px] font-bold text-slate-500 pl-0.5">
                            +{dayPersonal.length - 1} particular
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Batch Complete Past Stays Banner (STRICTLY FOR ADMIN / PROPRIETÁRIO) */}
          {userRole === 'admin' && pastPendingStays.length > 0 && filterTab === 'pending' && (
            <div className="p-3.5 sm:p-4 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-emerald-950/40 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-white">
                      Estadias Anteriores com Pendências ({pastPendingStays.length})
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-extrabold text-[10px] border border-amber-500/30">
                      Exclusivo Proprietário
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Você pode marcar estadias passadas da chácara como 100% concluídas (Vistoria, Faxina e Piscina) de uma vez.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isBatchCompleting}
                onClick={handleBatchCompletePastStays}
                className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer active:scale-95 disabled:opacity-60 shrink-0"
              >
                {isBatchCompleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 stroke-[3]" />
                )}
                <span>Concluir Todas as Anteriores ({pastPendingStays.length})</span>
              </button>
            </div>
          )}

          {/* Unified Items Stream */}
          {isLoading ? (
            <div className="text-center py-16 space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-400">Carregando agenda unificada...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 space-y-3 bg-slate-950/40 rounded-3xl border border-slate-800/60 p-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h3 className="text-base font-black text-white">Nenhum compromisso nesta seleção</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {filterTab === 'pending'
                  ? 'Tudo em dia! Não há pendências na chácara nem nos seus serviços particulares no momento.'
                  : 'Nenhum item encontrado com os filtros selecionados.'}
              </p>
              <button
                type="button"
                onClick={() => handleOpenNewForm()}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs inline-flex items-center gap-1.5 shadow-md shadow-purple-600/25 cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4" />
                <span>Agendar Novo Serviço</span>
              </button>
            </div>
          ) : (
            filteredItems.map((item) => {
              // -------------------------------------------------------------
              // CASE 1: CHÁCARA CONCEIÇÃO STAY
              // -------------------------------------------------------------
              if (item.kind === 'chacara') {
                const stay = item.stay;
                const temporal = getStayTemporalStatus(stay.checkin_date, stay.checkout_date);

                return (
                  <div
                    key={item.id}
                    className={`p-4 sm:p-5 rounded-3xl border transition-all duration-200 flex flex-col gap-4 shadow-xl ${
                      stay.checklist_status === 'pending'
                        ? 'bg-amber-950/15 border-amber-500/40 hover:border-amber-400'
                        : stay.checklist_status === 'with_issues'
                        ? 'bg-rose-950/15 border-rose-500/40'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Top Bar: Kind Badge, Code, Guest Name, Status */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-xs flex items-center gap-1">
                          <Home className="w-3.5 h-3.5" />
                          Chácara Conceição
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-amber-300 font-mono font-black text-xs tracking-wider">
                          {stay.code}
                        </span>
                        <h4 className="text-base sm:text-lg font-black text-white">
                          {stay.guest_name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {temporal === 'today' && (
                          <span className="px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-md shadow-amber-400/20">
                            <Flame className="w-3.5 h-3.5 fill-slate-950" />
                            Saída Hoje!
                          </span>
                        )}
                        {temporal === 'current' && (
                          <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold text-xs flex items-center gap-1">
                            <Home className="w-3.5 h-3.5" />
                            Hospedado Agora
                          </span>
                        )}

                        {/* Checklist Badge */}
                        {stay.checklist_status === 'pending' && (
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-extrabold text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Vistoria Pendente
                          </span>
                        )}
                        {stay.checklist_status === 'completed' && (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold text-xs flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            Vistoria Ok
                          </span>
                        )}

                        {/* Faxina Badge */}
                        {stay.cleaning_status === 'completed' ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold text-xs flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            Faxina Concluída
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-extrabold text-xs flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            Faxina Pendente
                          </span>
                        )}

                        {/* Piscina Status Pill */}
                        {userRole === 'admin' ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePool(stay)}
                            disabled={updatingPoolId === stay.id}
                            className={`px-2.5 py-1 rounded-full font-bold text-xs flex items-center gap-1 border transition-all cursor-pointer active:scale-95 disabled:opacity-60 ${
                              stay.pool_status === 'completed'
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30'
                                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-sky-500/50'
                            }`}
                            title="Alternar status da piscina"
                          >
                            {updatingPoolId === stay.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Droplets className="w-3 h-3 text-sky-400" />
                            )}
                            <span>{stay.pool_status === 'completed' ? 'Piscina Limpa' : 'Piscina Pend.'}</span>
                          </button>
                        ) : (
                          <span
                            className={`px-2.5 py-1 rounded-full font-bold text-xs flex items-center gap-1 border ${
                              stay.pool_status === 'completed'
                                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                : 'bg-slate-800/80 text-slate-400 border-slate-700'
                            }`}
                          >
                            <Droplets className="w-3 h-3" />
                            {stay.pool_status === 'completed' ? 'Piscina Limpa' : 'Piscina Pend.'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle Info: Dates, Guests, Phone */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="space-y-1 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                        <div className="flex items-center gap-1.5 font-bold text-slate-400">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Período da Estadia</span>
                        </div>
                        <p className="text-white font-extrabold">
                          {formatDateBR(stay.checkin_date)} ({stay.checkin_time}) →{' '}
                          {formatDateBR(stay.checkout_date)} ({stay.checkout_time})
                        </p>
                      </div>

                      <div className="space-y-1 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                        <div className="flex items-center gap-1.5 font-bold text-slate-400">
                          <Users className="w-3.5 h-3.5 text-purple-400" />
                          <span>Total de Hóspedes</span>
                        </div>
                        <p className="text-white font-extrabold flex items-center gap-2">
                          <span>{stay.total_guests} pessoas</span>
                          {stay.guests_pets > 0 && (
                            <span className="text-amber-400 font-bold">• {stay.guests_pets} pet(s)</span>
                          )}
                        </p>
                      </div>

                      <div className="space-y-1 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                        <div className="flex items-center gap-1.5 font-bold text-slate-400">
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Contato do Hóspede</span>
                        </div>
                        <p className="text-white font-extrabold">
                          {stay.guest_phone || 'Sem telefone registrado'}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Action Area */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        Imóvel: {stay.chacara_name || 'Chácara Conceição'}
                      </span>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Faxina Action Button */}
                        {stay.status !== 'CANCELADA' && (
                          <button
                            type="button"
                            disabled={updatingCleaningId === stay.id}
                            onClick={() => handleToggleCleaning(stay)}
                            className={`px-3.5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-60 ${
                              stay.cleaning_status === 'completed'
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                                : 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25'
                            }`}
                          >
                            {updatingCleaningId === stay.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : stay.cleaning_status === 'completed' ? (
                              <RotateCcw className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                            <span>
                              {stay.cleaning_status === 'completed'
                                ? 'Reabrir Faxina'
                                : 'Marcar Faxina Concluída'}
                            </span>
                          </button>
                        )}

                        {/* Checklist Button */}
                        {stay.checklist_status === 'pending' ? (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onStartChecklistForStay(stay);
                            }}
                            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all cursor-pointer active:scale-95"
                          >
                            <Sparkles className="w-4 h-4 fill-slate-950" />
                            <span>Iniciar Checklist Pós-Estadia</span>
                          </button>
                        ) : stay.checklist_status === 'completed' || stay.checklist_status === 'with_issues' ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (stay.checklist_session_id && onViewHistoryForStay) {
                                onClose();
                                onViewHistoryForStay(stay.checklist_session_id);
                              }
                            }}
                            className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Ver Relatório da Vistoria</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onStartChecklistForStay(stay);
                            }}
                            className="px-3.5 py-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <span>Iniciar Vistoria Antecipada</span>
                          </button>
                        )}

                        {/* OWNER MASTER BYPASS */}
                        {userRole === 'admin' && (
                          <>
                            {stay.checklist_status !== 'completed' ||
                            stay.cleaning_status !== 'completed' ||
                            stay.pool_status !== 'completed' ? (
                              <button
                                type="button"
                                disabled={updatingEverythingId === stay.id || isBatchCompleting}
                                onClick={() => handleMarkEverythingCompleted(stay)}
                                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                                title="Marcar Vistoria, Faxina e Piscina como 100% concluídos nesta estadia"
                              >
                                {updatingEverythingId === stay.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                                )}
                                <span>Marcar Tudo Concluído</span>
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="px-3 py-2 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  Tudo Concluído
                                </span>
                                <button
                                  type="button"
                                  disabled={updatingEverythingId === stay.id}
                                  onClick={() => handleReopenEverything(stay)}
                                  className="px-2.5 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Reabrir pendências desta estadia"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Reabrir</span>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // -------------------------------------------------------------
              // CASE 2: PERSONAL SERVICE (SERVIÇO PARTICULAR DO STAFF)
              // -------------------------------------------------------------
              const srv = item.service;
              const meta = getCategoryMeta(srv.category, userRole);
              const isDone = srv.status === 'completed';

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 rounded-3xl border transition-all duration-200 flex flex-col gap-3 shadow-lg ${
                    isDone
                      ? 'bg-slate-950/40 border-slate-800/80 opacity-75'
                      : 'bg-slate-900 border-purple-500/30 hover:border-purple-400 shadow-purple-950/10'
                  }`}
                >
                  {/* Top Bar: Kind Badge, Category, Date/Time, Title, Price */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 font-black text-xs flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        Serviço Particular
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                      >
                        {meta.label}
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-amber-300 font-mono font-black text-xs">
                        {formatDateBR(srv.service_date)} ({formatTimeShort(srv.start_time)} -{' '}
                        {formatTimeShort(srv.end_time)})
                      </span>
                      <h4
                        className={`text-base font-black text-white ${
                          isDone ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {srv.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePersonalStatus(srv)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                          isDone
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                        }`}
                      >
                        {isDone ? (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reabrir</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Concluir</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Client & Address Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300">
                    {srv.client_name && (
                      <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-950/50">
                        <User className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="font-bold">{srv.client_name}</span>
                      </div>
                    )}
                    {srv.client_phone && (
                      <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-950/50">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{srv.client_phone}</span>
                      </div>
                    )}
                    {srv.address && (
                      <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-950/50">
                        <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="truncate">{srv.address}</span>
                      </div>
                    )}
                  </div>

                  {srv.notes && (
                    <div className="p-2.5 rounded-xl bg-slate-950/40 text-xs text-slate-400 border border-slate-800/60">
                      {srv.notes}
                    </div>
                  )}

                  {/* Bottom Actions for Personal Service */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {srv.client_phone && (
                        <>
                          <a
                            href={getWhatsAppLink(srv.client_phone, srv.client_name) || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                          <a
                            href={getPhoneCallLink(srv.client_phone) || '#'}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Ligar</span>
                          </a>
                        </>
                      )}
                      {srv.address && (
                        <a
                          href={getGoogleMapsLink(srv.address) || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Google Maps</span>
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditForm(srv)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePersonalService(srv)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Floating Toast */}
        {feedbackToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-60 bg-emerald-500 text-slate-950 font-black text-xs px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-400 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <CheckCircle2 className="w-4 h-4 fill-slate-950 text-emerald-400" />
            <span>{feedbackToast}</span>
          </div>
        )}
      </div>

      {/* CREATE / EDIT PERSONAL SERVICE MODAL FORM */}
      {isFormOpen && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-white">
                  {editingService ? 'Editar Serviço Particular' : 'Novo Serviço Particular na Agenda'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
              {/* 1. Serviço / Título com sugestões rápidas */}
              <div>
                <label className="block font-bold text-slate-200 mb-1">
                  Qual é o serviço? *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Faxina, Limpeza de Piscina..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                />
                {/* Sugestões rápidas de 1 clique */}
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {presetTitles.map((preset) => (
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
                  <label className="block font-bold text-slate-200 mb-1">Horário de Início *</label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-purple-400 text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-200 mb-1">Horário de Término</label>
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
                    placeholder="Ex: D. Maria, Sítio..."
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
                  placeholder="Ex: Rua das Flores, 120"
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

      {/* Floating Central Button (FAB) */}
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
