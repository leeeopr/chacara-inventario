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
  Droplets,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  Home,
  Layers,
  List,
  Loader2,
  LogIn,
  LogOut,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import {
  fetchStays,
  formatDateBR,
  getLocalTodayDateStr,
  getStayTemporalStatus,
  updateStayCleaningStatus,
} from '../services/staysService';
import { UserRole } from '../types/auth';
import { Stay, StayChecklistStatus, StayCleaningStatus } from '../types/stay';

interface StaysCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartChecklistForStay: (stay: Stay) => void;
  onViewHistoryForStay?: (sessionId: string) => void;
  userRole?: UserRole;
  userName?: string;
  onStaysUpdated?: () => void;
}

export const StaysCalendarModal: React.FC<StaysCalendarModalProps> = ({
  isOpen,
  onClose,
  onStartChecklistForStay,
  onViewHistoryForStay,
  userRole = 'admin',
  userName = 'Faxineira',
  onStaysUpdated,
}) => {
  const [stays, setStays] = useState<Stay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingCleaningId, setUpdatingCleaningId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'pending' | 'cleaning' | 'all' | 'completed' | 'calendar'>('pending');
  
  // Calendar Month Navigation
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);

  const todayStr = getLocalTodayDateStr();

  // Load stays from Supabase
  const loadStays = async () => {
    setIsLoading(true);
    try {
      const data = await fetchStays();
      setStays(data);
    } catch (err) {
      console.error('Erro ao carregar estadias:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStays();
    }
  }, [isOpen]);

  // Android Back Handler
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerBackHandler('StaysCalendarModal', 60, () => {
      onClose();
      return true;
    });
    return unregister;
  }, [isOpen, onClose]);

  const handleToggleCleaning = async (stay: Stay) => {
    const nextStatus: StayCleaningStatus = stay.cleaning_status === 'completed' ? 'pending' : 'completed';
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
      console.error('Erro ao atualizar status da faxina:', err);
    } finally {
      setUpdatingCleaningId(null);
    }
  };

  // Derived metrics
  const metrics = useMemo(() => {
    const activeStays = stays.filter((s) => s.status !== 'CANCELADA');
    const total = stays.length;
    const pendingChecklists = stays.filter((s) => s.checklist_status === 'pending').length;
    const pendingCleanings = activeStays.filter(
      (s) => s.checkout_date <= todayStr && s.cleaning_status === 'pending'
    ).length;
    const completed = stays.filter(
      (s) =>
        (s.checklist_status === 'completed' || s.checklist_status === 'with_issues') &&
        s.cleaning_status === 'completed'
    ).length;
    return { total, pendingChecklists, pendingCleanings, completed };
  }, [stays, todayStr]);

  // Filtered stays
  const filteredStays = useMemo(() => {
    let result = [...stays];

    // Tab filter
    if (filterTab === 'pending') {
      result = result.filter(
        (s) =>
          s.checklist_status === 'pending' ||
          (s.status !== 'CANCELADA' && s.checkout_date <= todayStr && s.cleaning_status === 'pending')
      );
    } else if (filterTab === 'cleaning') {
      result = result.filter((s) => s.status !== 'CANCELADA' && s.cleaning_status === 'pending');
    } else if (filterTab === 'completed') {
      result = result.filter(
        (s) =>
          s.checklist_status === 'completed' ||
          s.checklist_status === 'with_issues' ||
          s.cleaning_status === 'completed'
      );
    }

    // Specific day filter from calendar click
    if (selectedDateFilter) {
      result = result.filter(
        (s) =>
          s.checkin_date === selectedDateFilter ||
          s.checkout_date === selectedDateFilter ||
          (s.checkin_date <= selectedDateFilter && selectedDateFilter <= s.checkout_date)
      );
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.guest_name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.guest_phone && s.guest_phone.includes(q))
      );
    }

    return result;
  }, [stays, filterTab, selectedDateFilter, searchQuery, todayStr]);

  if (!isOpen) return null;

  // Calendar calculations
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
      <div className="w-full max-w-4xl h-[92vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  Estadias, Checklists &amp; Faxinas
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-[10px] border border-emerald-500/30">
                  {userRole === 'faxineira' ? 'Modo Faxineira' : 'Supabase Chácara'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Fim das estadias vinculado aos checklists pós-saída e faxinas a realizar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadStays}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="Atualizar estadias do banco"
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
          {/* 1. Checklists Pendentes */}
          <div
            onClick={() => {
              setFilterTab('pending');
              setSelectedDateFilter(null);
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === 'pending' && !selectedDateFilter
                ? 'bg-amber-500/20 border-amber-500/60 ring-1 ring-amber-500/50 shadow-lg shadow-amber-500/10'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-amber-400">
              <span className="flex items-center gap-1.5 truncate">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Checklists Pend.
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[11px] font-black">
                {metrics.pendingChecklists}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-white mt-1">
              {metrics.pendingChecklists}
            </p>
          </div>

          {/* 2. Faxinas Pendentes */}
          <div
            onClick={() => {
              setFilterTab('cleaning');
              setSelectedDateFilter(null);
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === 'cleaning' && !selectedDateFilter
                ? 'bg-indigo-500/20 border-indigo-400 ring-1 ring-indigo-500/50 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
              <span className="flex items-center gap-1.5 truncate">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                Faxinas Pend.
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-[11px] font-black">
                {metrics.pendingCleanings}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-white mt-1">
              {metrics.pendingCleanings}
            </p>
          </div>

          {/* 3. Concluídos */}
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
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Concluídos
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-[11px] font-black">
                {metrics.completed}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-white mt-1">
              {metrics.completed}
            </p>
          </div>

          {/* 4. Total de Estadias */}
          <div
            onClick={() => {
              setFilterTab('all');
              setSelectedDateFilter(null);
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              filterTab === 'all' && !selectedDateFilter
                ? 'bg-purple-500/20 border-purple-500/60 ring-1 ring-purple-500/50'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-purple-400">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Total Estadias
              </span>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-[11px] font-black">
                {metrics.total}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-white mt-1">
              {metrics.total}
            </p>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/30 shrink-0">
          {/* Tabs */}
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
              <span>Pendências ({metrics.pendingChecklists + metrics.pendingCleanings})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('cleaning');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                filterTab === 'cleaning'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Faxinas</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('calendar');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                filterTab === 'calendar'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
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

          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar hóspede ou código..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
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
          <div className="px-4 sm:px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs font-bold text-amber-300">
            <span>
              Filtrando estadias do dia <strong>{formatDateBR(selectedDateFilter)}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSelectedDateFilter(null)}
              className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-bold"
            >
              Limpar filtro de data
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Calendar View when 'calendar' is active */}
          {filterTab === 'calendar' && (
            <div className="p-4 rounded-3xl bg-slate-950/80 border border-slate-800 shadow-xl space-y-4">
              {/* Calendar Month Navigation Header */}
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
                    Toque em um dia para ver as estadias e conferências
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

              {/* Day names header */}
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
                {/* Empty cells before start of month */}
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-16 sm:h-20 rounded-xl bg-slate-900/20 opacity-30" />
                ))}

                {/* Month Days */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const isSelected = selectedDateFilter === dateStr;

                  // Find stays affecting this day
                  const dayStays = stays.filter(
                    (s) =>
                      s.checkin_date === dateStr ||
                      s.checkout_date === dateStr ||
                      (s.checkin_date <= dateStr && dateStr <= s.checkout_date)
                  );

                  const hasCheckin = dayStays.some((s) => s.checkin_date === dateStr);
                  const hasCheckout = dayStays.some((s) => s.checkout_date === dateStr);
                  const hasPendingChecklist = dayStays.some((s) => s.checklist_status === 'pending');
                  const hasPendingCleaning = dayStays.some(
                    (s) => s.status !== 'CANCELADA' && s.checkout_date <= todayStr && s.cleaning_status === 'pending'
                  );
                  const hasPendingTask = hasPendingChecklist || hasPendingCleaning;

                  return (
                    <div
                      key={dateStr}
                      onClick={() => {
                        if (dayStays.length > 0) {
                          setSelectedDateFilter(isSelected ? null : dateStr);
                        }
                      }}
                      className={`h-16 sm:h-20 p-1 sm:p-2 rounded-2xl border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/25 border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                          : dayStays.length > 0
                          ? 'bg-slate-900/90 border-slate-700 hover:border-amber-500/40 cursor-pointer'
                          : 'bg-slate-950/40 border-slate-800/60 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-black ${isSelected ? 'text-amber-300' : 'text-slate-300'}`}>
                          {dayNum}
                        </span>
                        {hasPendingTask && (
                          <div
                            className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"
                            title="Checklist ou Faxina Pendente"
                          />
                        )}
                      </div>

                      {/* Day events pills */}
                      <div className="space-y-0.5 overflow-hidden">
                        {hasCheckin && (
                          <div className="text-[9px] font-black px-1 rounded bg-emerald-500/20 text-emerald-300 truncate">
                            Entrada
                          </div>
                        )}
                        {hasCheckout && (
                          <div
                            className={`text-[9px] font-black px-1 rounded truncate ${
                              hasPendingTask
                                ? 'bg-amber-500 text-slate-950 font-extrabold'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            Saída
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stays List */}
          {isLoading ? (
            <div className="text-center py-16 space-y-3">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-400">Sincronizando estadias da chácara...</p>
            </div>
          ) : filteredStays.length === 0 ? (
            <div className="text-center py-16 space-y-3 bg-slate-950/40 rounded-3xl border border-slate-800/60 p-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h3 className="text-base font-black text-white">Nenhuma estadia nesta seleção</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {filterTab === 'pending'
                  ? 'Todas as vistorias pós-estadia estão em dia! Não há pendências no momento.'
                  : 'Nenhuma estadia encontrada com os filtros atuais.'}
              </p>
            </div>
          ) : (
            filteredStays.map((stay) => {
              const temporal = getStayTemporalStatus(stay.checkin_date, stay.checkout_date);

              return (
                <div
                  key={stay.id}
                  className={`p-4 sm:p-5 rounded-3xl border transition-all duration-200 flex flex-col gap-4 shadow-xl ${
                    stay.checklist_status === 'pending'
                      ? 'bg-amber-950/15 border-amber-500/40 hover:border-amber-400'
                      : stay.checklist_status === 'with_issues'
                      ? 'bg-rose-950/15 border-rose-500/40'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Top Bar: Code, Guest Name, Status Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-amber-300 font-mono font-black text-xs tracking-wider">
                        {stay.code}
                      </span>
                      <h4 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                        <span>{stay.guest_name}</span>
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
                      {temporal === 'future' && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs">
                          Estadia Futura
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
                      {stay.checklist_status === 'with_issues' && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-extrabold text-xs flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          {stay.checklist_issues_count} Avaria(s)
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

                      {/* Piscina Status Pill (Team visibility) */}
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
                    </div>
                  </div>

                  {/* Middle Info: Dates, Guests, Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {/* Checkin / Checkout */}
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

                    {/* Guests Details */}
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

                    {/* Phone / Contact */}
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

                  {/* Special requests or notes */}
                  {stay.notes && (
                    <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 text-xs text-slate-300">
                      <span className="font-bold text-slate-400">Observações: </span>
                      {stay.notes}
                    </div>
                  )}

                  {/* Bottom Action Area */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] font-bold text-slate-500">
                      Imóvel: {stay.chacara_name || 'Chácara'}
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

                      {/* Button to start or continue checklist */}
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
                        <div className="flex items-center gap-2">
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
                        </div>
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
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
