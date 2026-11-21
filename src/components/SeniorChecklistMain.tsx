import React from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  Clock,
  Home,
  Menu,
  Power,
  RotateCcw,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { ChecklistRoomProgress, ChecklistSession } from '../types/checklist';
import { Room } from '../types/inventory';
import { PreChecklistAction } from '../types/preChecklist';

interface SeniorChecklistMainProps {
  rooms: Room[];
  roomProgressMap: Map<string, ChecklistRoomProgress>;
  session: ChecklistSession | null;
  preChecklistActions?: PreChecklistAction[];
  preChecklistCompletions?: Set<string>;
  onOpenPreChecklist?: () => void;
  onSelectRoom: (room: Room) => void;
  onOpenAdminMenu: () => void;
  onStartNewSession: () => void;
  onSeedDefaultRooms: () => void;
  onOpenAccessibility?: () => void;
}

export const SeniorChecklistMain: React.FC<SeniorChecklistMainProps> = ({
  rooms,
  roomProgressMap,
  session,
  preChecklistActions = [],
  preChecklistCompletions = new Set(),
  onOpenPreChecklist,
  onSelectRoom,
  onOpenAdminMenu,
  onStartNewSession,
  onSeedDefaultRooms,
  onOpenAccessibility,
}) => {
  // Active pre-checklist actions (completely ignored if empty)
  const safePreActions = Array.isArray(preChecklistActions) ? preChecklistActions : [];
  const safeCompletions =
    preChecklistCompletions instanceof Set
      ? preChecklistCompletions
      : new Set<string>();
  const activePreActions = safePreActions.filter((a) => a && a.is_active);
  const completedPreCount = activePreActions.filter((a) =>
    safeCompletions.has(a.id)
  ).length;
  const isAllPreDone =
    activePreActions.length > 0 && completedPreCount === activePreActions.length;

  // Calculate completed count
  const completedRoomsCount = rooms.filter((r) => {
    const prog = roomProgressMap.get(r.id);
    return prog?.status === 'completed';
  }).length;

  const allCompleted = rooms.length > 0 && completedRoomsCount === rooms.length;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none max-w-full overflow-x-hidden">
      {/* Top Header - Extremely simple: Title + Discreet Accessibility & Hamburger Menu */}
      <header className="sticky top-0 z-30 bg-slate-950/95 border-b-2 border-slate-800/80 px-4 sm:px-6 py-4 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="Logo Chácara"
              className="w-12 h-12 rounded-2xl object-cover shadow-lg shadow-emerald-500/20 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white truncate">
                Conferência da Chácara
              </h1>
              <p className="text-xs sm:text-sm font-bold text-slate-400 mt-0.5 truncate">
                Toque no cômodo para conferir os itens
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAccessibility && (
              <button
                type="button"
                onClick={onOpenAccessibility}
                aria-label="Ajustar tamanho da interface"
                title="Ajustar tamanho da interface"
                className="w-12 h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border-2 border-slate-800 flex items-center justify-center text-amber-400 hover:text-amber-300 transition-all shadow-md shrink-0"
              >
                <Sliders className="w-6 h-6 stroke-[2.5]" />
              </button>
            )}

            {/* Discreet Hamburger Menu Button */}
            <button
              type="button"
              onClick={onOpenAdminMenu}
              aria-label="Abrir menu de administração"
              className="w-12 h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border-2 border-slate-800 flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-md shrink-0"
            >
              <Menu className="w-7 h-7 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-4">
        {/* Celebration Banner if all rooms are done */}
        {allCompleted && (
          <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-950/60 to-teal-950/60 border-2 border-emerald-400 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn text-center sm:text-left">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                <Award className="w-8 h-8 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">
                  Conferência 100% Concluída!
                </h3>
                <p className="text-xs sm:text-sm font-bold text-emerald-300">
                  Todos os {rooms.length} cômodos da chácara foram inspecionados.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onStartNewSession}
              className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all shrink-0"
            >
              <RotateCcw className="w-5 h-5 stroke-[2.5]" />
              <span>Nova Vistoria</span>
            </button>
          </div>
        )}

        {/* Pre-Checklist Preparation Card (if active actions exist) */}
        {activePreActions.length > 0 && (
          <div
            onClick={onOpenPreChecklist}
            role="button"
            tabIndex={0}
            className={`p-4 sm:p-5 rounded-3xl border-2 shadow-xl cursor-pointer transition-all active:scale-[0.99] flex flex-col sm:flex-row items-center justify-between gap-4 ${
              isAllPreDone
                ? 'bg-emerald-950/30 border-emerald-500/50 hover:border-emerald-400 shadow-emerald-950/20'
                : 'bg-amber-950/30 border-amber-500/60 hover:border-amber-400 shadow-amber-950/30'
            }`}
          >
            <div className="flex items-center gap-3.5 w-full sm:w-auto">
              <div
                className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 ${
                  isAllPreDone
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                    : 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                }`}
              >
                <Power className="w-7 h-7 stroke-[2.5]" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-black text-white">
                    Pré-Checklist: Preparação
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wide border ${
                      isAllPreDone
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {completedPreCount} de {activePreActions.length} ligados
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-300 mt-0.5">
                  {isAllPreDone
                    ? '✓ Todos os equipamentos foram ligados. Toque para revisar.'
                    : 'Ligue freezer, bebedouro e geladeira antes de iniciar a vistoria.'}
                </p>
              </div>
            </div>

            <div className="w-full sm:w-auto flex justify-end shrink-0">
              <span
                className={`w-full sm:w-auto text-center px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-md transition-all ${
                  isAllPreDone
                    ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                }`}
              >
                {isAllPreDone ? 'Revisar Preparação' : 'Ligar Equipamentos ›'}
              </span>
            </div>
          </div>
        )}

        {/* If no rooms in the property yet */}
        {rooms.length === 0 ? (
          <div className="py-16 text-center max-w-md mx-auto p-8 rounded-3xl bg-slate-900 border-2 border-slate-800 space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <Home className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">
                Nenhum cômodo cadastrado ainda
              </h2>
              <p className="text-sm font-bold text-slate-400 mt-2 leading-relaxed">
                Clique abaixo para gerar os cômodos padrão da chácara (Cozinha, Quartos, Sala, Piscina...)
              </p>
            </div>
            <button
              type="button"
              onClick={onSeedDefaultRooms}
              className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base shadow-xl shadow-emerald-500/20"
            >
              CRIAR CÔMODOS PADRÃO
            </button>
          </div>
        ) : (
          /* Room Cards - Huge, Senior-Friendly Touch Targets */
          <div className="space-y-3.5">
            {rooms.map((room) => {
              const progress = roomProgressMap.get(room.id);
              const status = progress?.status || 'pending';
              const isCompleted = status === 'completed';
              const isInProgress = status === 'in_progress';

              const pendingRoomPreActions = activePreActions.filter(
                (a) =>
                  (a.room_id === room.id ||
                    a.inventory_item?.room_id === room.id ||
                    a.inventory_item?.room_assignments?.some((as) => as.room_id === room.id) ||
                    (a.room_name &&
                      a.room_name.trim().toLowerCase() === room.name.trim().toLowerCase()) ||
                    (a.room_name_snapshot &&
                      a.room_name_snapshot.trim().toLowerCase() === room.name.trim().toLowerCase())) &&
                  !safeCompletions.has(a.id)
              );

              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onSelectRoom(room)}
                  className={`w-full p-5 sm:p-6 rounded-3xl text-left transition-all active:scale-[0.98] flex items-center justify-between gap-4 border-2 shadow-xl ${
                    isCompleted
                      ? 'bg-emerald-950/40 border-emerald-400 shadow-emerald-950/30'
                      : isInProgress
                      ? 'bg-amber-950/25 border-amber-400 shadow-amber-950/30'
                      : 'bg-slate-900 hover:bg-slate-850 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-4">
                    {/* Status Icon */}
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 ${
                        isCompleted
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg'
                          : isInProgress
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-8 h-8 stroke-[3.5]" />
                      ) : isInProgress ? (
                        <Clock className="w-7 h-7 stroke-[2.5]" />
                      ) : (
                        <Home className="w-7 h-7 stroke-[2.5]" />
                      )}
                    </div>

                    {/* Room Name & Simple Status */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl sm:text-2xl font-black text-white truncate leading-tight uppercase">
                          {room.name}
                        </h2>
                        {room.suite?.name && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/40 text-[10px] sm:text-xs font-black text-purple-300 uppercase tracking-wide">
                            {room.suite.name}
                          </span>
                        )}
                        {pendingRoomPreActions.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-[10px] sm:text-xs font-black text-amber-300 uppercase tracking-wide">
                            <Power className="w-3 h-3 stroke-[2.5]" />
                            {pendingRoomPreActions.length === 1
                              ? '1 equipamento a ligar'
                              : `${pendingRoomPreActions.length} a ligar`}
                          </span>
                        )}
                      </div>

                      <span
                        className={`inline-block text-xs sm:text-sm font-black uppercase tracking-wider mt-1 ${
                          isCompleted
                            ? 'text-emerald-400'
                            : isInProgress
                            ? 'text-amber-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {isCompleted
                          ? 'CONCLUÍDO'
                          : isInProgress
                          ? 'EM ANDAMENTO'
                          : 'PENDENTE — TOQUE PARA CONFERIR'}
                      </span>
                    </div>
                  </div>

                  {/* Right Completion Indicator */}
                  <div className="shrink-0">
                    {isCompleted ? (
                      <span className="w-10 h-10 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg font-black text-lg">
                        ✓
                      </span>
                    ) : (
                      <span className="text-2xl font-bold text-slate-500">
                        ›
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
