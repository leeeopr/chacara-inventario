import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Home,
  User,
  Users,
  X,
  Search,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import { formatDateBR, getLocalTodayDateStr } from '../services/staysService';
import { Stay } from '../types/stay';

export interface SelectStayModalProps {
  isOpen: boolean;
  onClose: () => void;
  stays: Stay[];
  onSelectStay: (stay: Stay) => void;
  onStartWithoutStay?: () => void;
  isLoading?: boolean;
}

export const SelectStayModal: React.FC<SelectStayModalProps> = ({
  isOpen,
  onClose,
  stays,
  onSelectStay,
  onStartWithoutStay,
  isLoading = false,
}) => {
  const [search, setSearch] = useState('');
  const todayStr = useMemo(() => getLocalTodayDateStr(), []);

  // Back button handler (priority 65)
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerBackHandler('SelectStayModal', 65, () => {
      onClose();
      return true;
    });
    return unregister;
  }, [isOpen, onClose]);

  // Sort stays with most relevant for cleaning/inspection first:
  // 1. Check-out today or past with pending cleaning
  // 2. Currently hosted
  // 3. Upcoming check-ins
  // 4. Others
  const sortedStays = useMemo(() => {
    const list = [...stays].filter((s) => s.status !== 'CANCELADA');

    return list.sort((a, b) => {
      // Cleaning pending takes top priority
      const aNeedClean = a.checkout_date <= todayStr && a.cleaning_status === 'pending';
      const bNeedClean = b.checkout_date <= todayStr && b.cleaning_status === 'pending';
      if (aNeedClean && !bNeedClean) return -1;
      if (!aNeedClean && bNeedClean) return 1;

      // Currently hosted
      const aCurrent = a.checkin_date <= todayStr && a.checkout_date >= todayStr;
      const bCurrent = b.checkin_date <= todayStr && b.checkout_date >= todayStr;
      if (aCurrent && !bCurrent) return -1;
      if (!aCurrent && bCurrent) return 1;

      // Closest upcoming or recent
      return b.checkout_date.localeCompare(a.checkout_date);
    });
  }, [stays, todayStr]);

  const filteredStays = useMemo(() => {
    if (!search.trim()) return sortedStays;
    const q = search.toLowerCase();
    return sortedStays.filter(
      (s) =>
        s.guest_name.toLowerCase().includes(q) ||
        (s.code && s.code.toLowerCase().includes(q))
    );
  }, [sortedStays, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                Qual estadia você está checando?
              </h3>
              <p className="text-xs text-slate-400 font-bold mt-0.5">
                Selecione a reserva para vincular o checklist dos cômodos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome do hóspede, código..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-indigo-400 text-xs sm:text-sm"
            />
          </div>
        </div>

        {/* Stays List */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-2.5 flex-1">
          {filteredStays.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs font-bold">
              Nenhuma estadia encontrada no momento.
            </div>
          ) : (
            filteredStays.map((stay) => {
              const isCheckoutPast = stay.checkout_date <= todayStr;
              const isCurrentStay =
                stay.checkin_date <= todayStr && stay.checkout_date >= todayStr;
              const isPendingCleaning =
                isCheckoutPast && stay.cleaning_status === 'pending';

              return (
                <button
                  key={stay.id}
                  type="button"
                  onClick={() => {
                    onSelectStay(stay);
                    onClose();
                  }}
                  className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 group active:scale-[0.99] ${
                    isPendingCleaning
                      ? 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20 hover:border-amber-400 shadow-md'
                      : isCurrentStay
                      ? 'bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/20 hover:border-emerald-400'
                      : 'bg-slate-950/60 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850/60'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* Badges row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isPendingCleaning && (
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-black text-[10px] uppercase tracking-wide border border-amber-500/40 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Limpeza Pendente
                        </span>
                      )}
                      {isCurrentStay && !isPendingCleaning && (
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-black text-[10px] uppercase tracking-wide border border-emerald-500/40 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Hóspede na Chácara
                        </span>
                      )}
                      {stay.code && (
                        <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {stay.code}
                        </span>
                      )}
                    </div>

                    {/* Guest Name */}
                    <h4 className="text-base font-black text-white group-hover:text-indigo-300 transition-colors">
                      {stay.guest_name}
                    </h4>

                    {/* Dates & Guest counts */}
                    <div className="flex items-center gap-3 text-xs text-slate-300 flex-wrap font-bold">
                      <span className="flex items-center gap-1 text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        {formatDateBR(stay.checkin_date)} até {formatDateBR(stay.checkout_date)}
                      </span>
                      {stay.total_guests && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          {stay.total_guests} hóspedes
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 w-8 h-8 rounded-xl bg-slate-800/80 group-hover:bg-indigo-600 group-hover:text-white text-slate-400 flex items-center justify-center transition-all">
                    <ChevronRight className="w-4 h-4 stroke-[3]" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer with Unlinked Inspection Option */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-2">
          {onStartWithoutStay && (
            <button
              type="button"
              onClick={() => {
                onStartWithoutStay();
                onClose();
              }}
              className="text-xs text-slate-400 hover:text-slate-200 underline font-bold cursor-pointer transition-colors"
            >
              Fazer vistoria avulsa (sem estadia específica)
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer ml-auto"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
