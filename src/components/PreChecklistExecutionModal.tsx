import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Info,
  Package,
  Power,
  RotateCcw,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import { getInventoryImageUrl } from '../lib/supabase';
import { InventoryItem, Room } from '../types/inventory';
import { PreChecklistAction } from '../types/preChecklist';

interface PreChecklistExecutionModalProps {
  isOpen: boolean;
  actions?: PreChecklistAction[];
  inventoryItems?: InventoryItem[];
  completedActionIds?: Set<string>;
  onClose: () => void;
  onToggleAction?: (actionId: string, isCompleted: boolean) => Promise<void>;
  onToggleCompletion?: (actionId: string, isCompleted: boolean) => Promise<void>;
  onContinueToInspection?: () => void;
  onProceedToRooms?: () => void;
  // Optional room filter if opened in context of a specific room
  roomFilterId?: string | null;
  roomNameFilter?: string | null;
}

export const PreChecklistExecutionModal: React.FC<PreChecklistExecutionModalProps> = ({
  isOpen,
  actions = [],
  inventoryItems = [],
  completedActionIds = new Set(),
  onClose,
  onToggleAction,
  onToggleCompletion,
  onContinueToInspection,
  onProceedToRooms,
  roomFilterId = null,
  roomNameFilter = null,
}) => {
  const toggleHandler = onToggleAction || onToggleCompletion || (async () => {});
  const proceedHandler = onContinueToInspection || onProceedToRooms || onClose;

  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [photoZoomUrl, setPhotoZoomUrl] = useState<string | null>(null);
  const [photoZoomTitle, setPhotoZoomTitle] = useState<string>('');
  const [isSubmittingMap, setIsSubmittingMap] = useState<Map<string, boolean>>(new Map());

  const safeActions = Array.isArray(actions) ? actions : [];
  const safeItems = Array.isArray(inventoryItems) ? inventoryItems : [];
  const safeCompletedIds = completedActionIds instanceof Set ? completedActionIds : new Set<string>();

  // Filter only active actions
  const activeActions = useMemo(() => {
    return safeActions.filter((a) => a && a.is_active);
  }, [safeActions]);

  // Map of inventory items
  const itemMap = useMemo(() => {
    return new Map(safeItems.map((it) => [it.id, it]));
  }, [safeItems]);

  // Contextual actions (filtered by room if specified)
  const contextualActions = useMemo(() => {
    if (!roomFilterId) return activeActions;
    return activeActions.filter((act) => {
      const item = act.inventory_item_id ? itemMap.get(act.inventory_item_id) : null;
      if (!item) return true; // Property-wide actions without item apply everywhere
      if (item.room_id === roomFilterId || item.assigned_room_id === roomFilterId) return true;
      if (item.room_assignments && item.room_assignments.some((a) => a.room_id === roomFilterId)) return true;
      return false;
    });
  }, [activeActions, roomFilterId, itemMap]);

  // Counts & Progress
  const totalCount = contextualActions.length;
  const completedCount = useMemo(() => {
    return contextualActions.filter((a) => safeCompletedIds.has(a.id)).length;
  }, [contextualActions, safeCompletedIds]);

  const pendingCount = totalCount - completedCount;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allCompleted = totalCount > 0 && completedCount === totalCount;

  // Filtered list by tab
  const displayedActions = useMemo(() => {
    return contextualActions.filter((a) => {
      const isDone = safeCompletedIds.has(a.id);
      if (activeFilter === 'pending') return !isDone;
      if (activeFilter === 'completed') return isDone;
      return true;
    });
  }, [contextualActions, safeCompletedIds, activeFilter]);

  // Android back button integration
  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerBackHandler('PreChecklistExecutionModal', 55, () => {
      if (photoZoomUrl) {
        setPhotoZoomUrl(null);
        return true;
      }
      onClose();
      return true;
    });

    return unregister;
  }, [isOpen, photoZoomUrl, onClose]);

  // Toggle single action completion
  const handleToggle = async (actionId: string, currentStatus: boolean) => {
    setIsSubmittingMap((prev) => new Map(prev).set(actionId, true));
    try {
      await toggleHandler(actionId, !currentStatus);
    } catch (err) {
      console.error('Erro ao alternar conclusão da ação de pré-checklist:', err);
    } finally {
      setIsSubmittingMap((prev) => {
        const next = new Map(prev);
        next.delete(actionId);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2.5 sm:p-5 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[94vh] rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-2xl flex flex-col overflow-hidden text-white select-none"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
                <Power className="w-7 h-7 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-white leading-tight">
                    Pré-Checklist
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Preparação
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ligue os equipamentos antes de iniciar a conferência
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-2xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar & Badges */}
          <div className="mt-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-slate-300">
                {completedCount} de {totalCount} equipamentos ligados
              </span>
              <span
                className={`font-black ${
                  allCompleted ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {progressPercent}%
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  allCompleted
                    ? 'bg-emerald-400'
                    : 'bg-gradient-to-r from-amber-500 to-emerald-400'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Tabs Filter */}
          <div className="flex items-center gap-1.5 pt-3 overflow-x-auto text-xs font-extrabold scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
                activeFilter === 'all'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white'
              }`}
            >
              Todos ({totalCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('pending')}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
                activeFilter === 'pending'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-900/60 text-slate-400 hover:text-amber-300'
              }`}
            >
              Pendentes ({pendingCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('completed')}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
                activeFilter === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-900/60 text-slate-400 hover:text-emerald-300'
              }`}
            >
              Ligados ({completedCount})
            </button>
          </div>
        </div>

        {/* Scrollable Action Cards List */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3.5">
          {displayedActions.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-3xl p-6 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-base font-black text-white">
                {activeFilter === 'pending'
                  ? 'Tudo pronto! Todos os equipamentos foram ligados.'
                  : 'Nenhuma ação nesta visualização.'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {activeFilter === 'pending'
                  ? 'Você já pode avançar para a conferência dos cômodos com tranquilidade.'
                  : 'Selecione a aba "Todos" para rever todas as ações.'}
              </p>
            </div>
          ) : (
            displayedActions.map((action) => {
              const item = action.inventory_item_id
                ? itemMap.get(action.inventory_item_id)
                : null;
              const itemImagePath = item?.image_path || (item as any)?.image_url;
              const imageUrl = getInventoryImageUrl(itemImagePath);
              const isCompleted = completedActionIds.has(action.id);
              const isLoading = isSubmittingMap.get(action.id) || false;
              const roomName =
                item?.room?.name ||
                item?.assigned_room_name ||
                action.room_name_snapshot;

              return (
                <div
                  key={action.id}
                  className={`rounded-3xl p-4 sm:p-5 border-2 transition-all shadow-lg flex flex-col justify-between gap-4 ${
                    isCompleted
                      ? 'bg-emerald-950/25 border-emerald-500/40 shadow-emerald-950/20'
                      : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Top: Photo & Info */}
                  <div className="flex items-start gap-4">
                    {/* Item Image with Ambient Blur */}
                    <div
                      className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative ${
                        imageUrl ? 'cursor-pointer hover:border-amber-400/50' : ''
                      }`}
                      onClick={() => {
                        if (imageUrl) {
                          setPhotoZoomUrl(imageUrl);
                          setPhotoZoomTitle(item?.name || action.title);
                        }
                      }}
                      title={imageUrl ? 'Toque para ampliar foto' : undefined}
                    >
                      {imageUrl ? (
                        <>
                          <img
                            src={imageUrl}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 w-full h-full object-cover blur-sm opacity-25 scale-110 pointer-events-none"
                          />
                          <img
                            src={imageUrl}
                            alt={item?.name || action.title}
                            className="w-full h-full object-cover relative z-10 pointer-events-none"
                          />
                          <div className="absolute bottom-1 right-1 z-20 px-1 py-0.5 rounded bg-black/75 text-[9px] font-bold text-white flex items-center gap-0.5 pointer-events-none">
                            <Eye className="w-2.5 h-2.5 text-amber-400" />
                            <span>Zoom</span>
                          </div>
                        </>
                      ) : (
                        <Package className="w-10 h-10 text-slate-700" />
                      )}

                      {/* Completed Overlay Badge */}
                      {isCompleted && (
                        <div className="absolute inset-0 z-20 bg-emerald-950/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                          <div className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg">
                            <Check className="w-6 h-6 stroke-[3.5]" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Details */}
                    <div className="min-w-0 flex-1">
                      {/* Room & Item Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {roomName && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-teal-500/20 text-teal-300 border border-teal-500/30">
                            📍 {roomName}
                          </span>
                        )}

                        {item && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-300 truncate max-w-[170px]">
                            {item.name}
                            {item.identification_code ? ` #${item.identification_code}` : ''}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                        {action.title}
                      </h3>

                      <p className="text-xs sm:text-sm font-semibold text-slate-300 mt-1 leading-relaxed">
                        {action.instruction}
                      </p>
                    </div>
                  </div>

                  {/* Bottom: Large, Senior-Friendly Completion Button */}
                  <div>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleToggle(action.id, isCompleted)}
                      className={`w-full py-3.5 sm:py-4 px-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl transition-all active:scale-[0.98] ${
                        isCompleted
                          ? 'bg-emerald-500/20 text-emerald-300 border-2 border-emerald-500/50 hover:bg-emerald-500/30'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <CheckCircle2 className="w-6 h-6 text-emerald-400 stroke-[2.5]" />
                          <span>Equipamento Ligado (Toque para desmarcar)</span>
                        </>
                      ) : (
                        <>
                          <Power className="w-5 h-5 stroke-[3]" />
                          <span>Ligar Equipamento & Marcar Concluído</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Proceed to Rooms */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs sm:text-sm transition-colors"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              proceedHandler();
            }}
            className={`flex-1 py-3.5 sm:py-4 px-5 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl transition-all active:scale-[0.98] ${
              allCompleted
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25'
                : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-teal-900/30'
            }`}
          >
            <span>
              {allCompleted
                ? 'Tudo Pronto! Ir para a Conferência dos Cômodos'
                : 'Avançar para a Conferência dos Cômodos'}
            </span>
            <ArrowRight className="w-5 h-5 stroke-[3]" />
          </button>
        </div>
      </div>

      {/* Fullscreen Photo Lightbox */}
      {photoZoomUrl && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-3 sm:p-5 bg-black/95 backdrop-blur-md animate-fadeIn"
          onClick={() => setPhotoZoomUrl(null)}
        >
          <div className="w-full max-w-lg flex items-center justify-between p-2 text-white">
            <span className="text-sm font-bold truncate max-w-[280px]">
              {photoZoomTitle}
            </span>
            <button
              type="button"
              onClick={() => setPhotoZoomUrl(null)}
              className="p-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center max-w-full p-2" onClick={(e) => e.stopPropagation()}>
            <img
              src={photoZoomUrl}
              alt={photoZoomTitle}
              className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl border border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
};
