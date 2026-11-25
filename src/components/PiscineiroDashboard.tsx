import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Droplets,
  Flame,
  List,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Users,
  X,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import {
  fetchStays,
  formatDateBR,
  getLocalTodayDateStr,
  updateStayPoolStatus,
} from '../services/staysService';
import { AppUserProfile } from '../types/auth';
import { Stay, StayPoolStatus } from '../types/stay';
import { PersonalServicesCalendarModal } from './PersonalServicesCalendarModal';

interface PiscineiroDashboardProps {
  userProfile: AppUserProfile;
  onLogout: () => void;
  onOpenAccessibility?: () => void;
  onBackToAdmin?: () => void;
  onToast?: (msg: string) => void;
  onOpenPersonalAgenda?: () => void;
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

export const PiscineiroDashboard: React.FC<PiscineiroDashboardProps> = ({
  userProfile,
  onLogout,
  onOpenAccessibility,
  onBackToAdmin,
  onToast,
}) => {
  const [stays, setStays] = useState<Stay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingStayId, setUpdatingStayId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'pending' | 'calendar' | 'completed' | 'all'>('pending');
  const [isPersonalAgendaOpen, setIsPersonalAgendaOpen] = useState(false);

  // Calendar Month Navigation
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);

  const loadStays = async () => {
    setIsLoading(true);
    try {
      const data = await fetchStays();
      setStays(data.filter((s) => s.status !== 'CANCELADA'));
    } catch (err) {
      console.error('Erro ao carregar estadias para piscineiro:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStays();
  }, []);

  // Android back handler when admin is previewing Piscineiro view
  useEffect(() => {
    if (!onBackToAdmin) return;
    const unregister = registerBackHandler('PiscineiroAdminPreview', 45, () => {
      onBackToAdmin();
      return true;
    });
    return unregister;
  }, [onBackToAdmin]);

  const todayStr = getLocalTodayDateStr();

  const metrics = useMemo(() => {
    const pendingPool = stays.filter((s) => s.pool_status === 'pending').length;
    const completedPool = stays.filter((s) => s.pool_status === 'completed').length;
    const upcomingCheckins = stays
      .filter((s) => s.checkin_date >= todayStr)
      .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date));
    const nextCheckin = upcomingCheckins[0] || null;
    return {
      total: stays.length,
      pendingPool,
      completedPool,
      nextCheckin,
    };
  }, [stays, todayStr]);

  const filteredStays = useMemo(() => {
    let list = [...stays];

    if (filterTab === 'pending') {
      list = list.filter((s) => s.pool_status === 'pending');
    } else if (filterTab === 'completed') {
      list = list.filter((s) => s.pool_status === 'completed');
    }

    if (selectedDateFilter) {
      list = list.filter(
        (s) =>
          s.checkin_date === selectedDateFilter ||
          s.checkout_date === selectedDateFilter ||
          (s.checkin_date <= selectedDateFilter && selectedDateFilter <= s.checkout_date)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.guest_name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.chacara_name && s.chacara_name.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => {
      const metaA = getPoolUrgencyMeta(a, todayStr);
      const metaB = getPoolUrgencyMeta(b, todayStr);
      if (metaA.sortWeight !== metaB.sortWeight) {
        return metaA.sortWeight - metaB.sortWeight;
      }
      return a.checkin_date.localeCompare(b.checkin_date);
    });
  }, [stays, filterTab, selectedDateFilter, searchQuery, todayStr]);

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
      onToast?.(
        nextStatus === 'completed'
          ? `Piscina confirmada como limpa para ${stay.guest_name}!`
          : `Limpeza da piscina reaberta para ${stay.guest_name}.`
      );
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao atualizar limpeza da piscina.');
    } finally {
      setUpdatingStayId(null);
    }
  };

  // Calendar setup
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
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border-2 border-sky-400/50 flex items-center justify-center text-sky-400 shrink-0 shadow-lg shadow-sky-500/20">
                <Droplets className="w-7 h-7 stroke-[2.5]" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white truncate">
                  Agenda da Piscina
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-500/40">
                  Piscineiro
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-400 truncate">
                Olá, {userProfile.full_name} • Veja entradas e saídas para limpar a piscina
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsPersonalAgendaOpen(true)}
              title="Abrir minha agenda de clientes particulares"
              className="px-3 h-11 rounded-2xl bg-indigo-500/20 hover:bg-indigo-500/30 border-2 border-indigo-500/40 flex items-center gap-1.5 text-indigo-300 font-black text-xs cursor-pointer shadow-sm active:scale-95"
            >
              <CalendarIcon className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Minha Agenda Pessoal</span>
            </button>

            <button
              type="button"
              onClick={loadStays}
              disabled={isLoading}
              title="Atualizar estadias"
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

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Minha Agenda Pessoal (Serviços e Clientes Externos) */}
        <div
          onClick={() => setIsPersonalAgendaOpen(true)}
          role="button"
          tabIndex={0}
          className="p-4 sm:p-5 rounded-3xl bg-slate-900 hover:bg-slate-850 border-2 border-indigo-500/40 hover:border-indigo-400 shadow-xl cursor-pointer transition-all active:scale-[0.99] flex flex-col sm:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3.5 w-full sm:w-auto">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 border-2 border-indigo-400 shadow-lg shadow-indigo-600/30">
              <CalendarIcon className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white">
                  Minha Agenda Pessoal &amp; Clientes
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wide bg-indigo-500/25 text-indigo-200 border border-indigo-400/50">
                  Google Calendar Style
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-300 mt-0.5">
                Organize suas manutenções de piscinas particulares, horários, clientes e orçamentos do dia a dia.
              </p>
            </div>
          </div>

          <div className="w-full sm:w-auto flex justify-end shrink-0">
            <span className="w-full sm:w-auto text-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs sm:text-sm shadow-md transition-all">
              Abrir Minha Agenda ›
            </span>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              setFilterTab('pending');
              setSelectedDateFilter(null);
            }}
            className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              filterTab === 'pending' && !selectedDateFilter
                ? 'bg-sky-500/20 border-sky-400 shadow-lg shadow-sky-500/15'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-xs font-black text-sky-300 flex items-center gap-1.5">
              <Droplets className="w-4 h-4" />
              Piscinas p/ Limpar
            </span>
            <p className="text-2xl font-black text-white mt-1">{metrics.pendingPool}</p>
          </button>

          <div className="p-3.5 rounded-2xl border-2 bg-slate-900 border-slate-800 text-left">
            <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
              <LogIn className="w-4 h-4" />
              Próxima Entrada
            </span>
            <p className="text-lg sm:text-xl font-black text-white mt-1 truncate">
              {metrics.nextCheckin ? formatDateBR(metrics.nextCheckin.checkin_date) : 'Sem reserva'}
            </p>
            {metrics.nextCheckin && (
              <span className="text-[11px] font-bold text-slate-400 block truncate">
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
              Piscinas Limpas
            </span>
            <p className="text-2xl font-black text-white mt-1">{metrics.completedPool}</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterTab('all');
              setSelectedDateFilter(null);
            }}
            className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              filterTab === 'all' && !selectedDateFilter
                ? 'bg-purple-500/20 border-purple-400'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-xs font-black text-purple-300 flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4" />
              Total Estadias
            </span>
            <p className="text-2xl font-black text-white mt-1">{metrics.total}</p>
          </button>
        </div>

        {/* Filter Tabs + Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-2xl border-2 border-slate-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setFilterTab('pending');
                setSelectedDateFilter(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterTab === 'pending'
                  ? 'bg-sky-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>Para Limpar ({metrics.pendingPool})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('calendar');
                setSelectedDateFilter(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterTab === 'calendar'
                  ? 'bg-purple-500 text-white shadow-md'
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
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
                filterTab === 'completed'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Piscinas Limpas</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterTab('all');
                setSelectedDateFilter(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer ${
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
              placeholder="Buscar hóspede ou código..."
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

        {/* Selected Date Chip */}
        {selectedDateFilter && (
          <div className="px-4 py-2.5 rounded-2xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-between text-xs font-bold text-sky-200">
            <span>
              Mostrando estadias do dia <strong>{formatDateBR(selectedDateFilter)}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSelectedDateFilter(null)}
              className="px-2.5 py-1 rounded-xl bg-sky-500/25 hover:bg-sky-500/40 text-sky-100 text-xs font-black cursor-pointer"
            >
              Limpar data
            </button>
          </div>
        )}

        {/* Monthly Calendar View */}
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
                  Toque em um dia para planejar a limpeza da piscina
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
                <div key={`empty-${i}`} className="h-16 sm:h-20 rounded-xl bg-slate-950/30 opacity-30" />
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

                const hasCheckin = dayStays.some((s) => s.checkin_date === dateStr);
                const hasCheckout = dayStays.some((s) => s.checkout_date === dateStr);
                const isOccupiedOnly = dayStays.length > 0 && !hasCheckin && !hasCheckout;
                const hasPendingPool = dayStays.some((s) => s.pool_status === 'pending');

                return (
                  <div
                    key={dateStr}
                    onClick={() => {
                      if (dayStays.length > 0) {
                        setSelectedDateFilter(isSelected ? null : dateStr);
                      }
                    }}
                    className={`h-16 sm:h-20 p-1.5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-sky-500/25 border-sky-400 ring-2 ring-sky-400/40'
                        : isToday
                        ? 'bg-slate-900 border-amber-400/70'
                        : dayStays.length > 0
                        ? 'bg-slate-950/90 border-slate-700 hover:border-sky-400/50 cursor-pointer'
                        : 'bg-slate-950/40 border-slate-800/60 text-slate-600'
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
                      {hasPendingPool && (
                        <span
                          className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse"
                          title="Limpeza de piscina pendente"
                        />
                      )}
                    </div>

                    <div className="space-y-0.5 overflow-hidden">
                      {hasCheckin && (
                        <div className="text-[9px] font-black px-1 rounded bg-sky-500 text-slate-950 truncate">
                          Entrada
                        </div>
                      )}
                      {hasCheckout && (
                        <div className="text-[9px] font-black px-1 rounded bg-amber-500/25 text-amber-300 truncate">
                          Saída
                        </div>
                      )}
                      {isOccupiedOnly && (
                        <div className="text-[9px] font-bold px-1 rounded bg-indigo-500/20 text-indigo-300 truncate">
                          Ocupado
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stays List for Pool Cleaning */}
        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-9 h-9 text-sky-400 animate-spin mx-auto" />
            <p className="text-sm font-bold text-slate-400">
              Carregando calendário de estadias e piscinas...
            </p>
          </div>
        ) : filteredStays.length === 0 ? (
          <div className="py-16 text-center rounded-3xl bg-slate-900 border-2 border-slate-800 p-6 space-y-3">
            <CheckCircle2 className="w-11 h-11 text-emerald-400 mx-auto" />
            <h3 className="text-lg font-black text-white">Nenhuma limpeza pendente aqui!</h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              {filterTab === 'pending'
                ? 'Todas as limpezas de piscina programadas para as estadias foram concluídas.'
                : 'Nenhuma estadia encontrada com os filtros atuais.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredStays.map((stay) => {
              const urgency = getPoolUrgencyMeta(stay, todayStr);
              const isDone = stay.pool_status === 'completed';
              const isUpdating = updatingStayId === stay.id;

              return (
                <div
                  key={stay.id}
                  className={`p-4 sm:p-5 rounded-3xl border-2 shadow-xl space-y-4 transition-all ${
                    isDone
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : urgency.tone === 'urgent'
                      ? 'bg-sky-950/30 border-sky-400'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  {/* Urgency / Status Top Strip */}
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

                  {/* Guest & Code Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-sky-300 font-mono font-black text-xs">
                        {stay.code}
                      </span>
                      <h3 className="text-lg font-black text-white">{stay.guest_name}</h3>
                    </div>

                    <span className="text-xs font-bold text-slate-400">
                      {stay.chacara_name || 'Chácara Principal'}
                    </span>
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

                  {/* Big Senior-Friendly Action Button */}
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
            })}
          </div>
        )}
      </main>

      {/* Modal da Minha Agenda Pessoal */}
      <PersonalServicesCalendarModal
        isOpen={isPersonalAgendaOpen}
        onClose={() => setIsPersonalAgendaOpen(false)}
        userProfile={userProfile}
        onToast={onToast}
      />
    </div>
  );
};
