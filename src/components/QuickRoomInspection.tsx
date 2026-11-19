import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  Hash,
  Home,
  Info,
  Layers,
  Package,
  RotateCcw,
  Sparkles,
  Tag,
  X,
  Zap,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import {
  getInspectionTypeConfig,
  InspectionType,
} from '../lib/inspectionTypeUtils';
import { getInventoryImageUrl } from '../lib/supabase';
import { ChecklistItemResult, ChecklistOccurrenceType } from '../types/checklist';
import { InventoryItem, Room } from '../types/inventory';
import { SeniorCelebrationOverlay } from './SeniorCelebrationOverlay';
import { SeniorIssueModal } from './SeniorIssueModal';
import { SeniorQuantityAdjustModal } from './SeniorQuantityAdjustModal';

interface QuickRoomInspectionProps {
  room: Room;
  roomItems: InventoryItem[];
  sessionId: string;
  itemResults: ChecklistItemResult[];
  allRooms: Room[];
  completedRoomIds: Set<string>;
  onBackToRooms: () => void;
  onRecordInspection: (params: {
    item: InventoryItem;
    status: 'found' | 'missing' | 'damaged';
    foundQuantity: number;
    notes?: string | null;
    occurrenceType?: 'missing' | 'damaged' | null;
    missingQuantity?: number;
    occurrenceDescription?: string | null;
    inspectionTypeSnapshot?: InspectionType | null;
    inspectionAnswers?: Record<string, boolean> | null;
    failedQuestion?: string | null;
  }) => Promise<void>;
  onCompleteRoom: (roomId: string) => Promise<void>;
  onNavigateToRoom: (nextRoom: Room) => void;
  onCompleteAllChecklist: () => void;
}

type FilterTab = 'all' | 'pending' | 'checked' | 'issues';

export const QuickRoomInspection: React.FC<QuickRoomInspectionProps> = ({
  room,
  roomItems,
  sessionId,
  itemResults,
  allRooms,
  completedRoomIds,
  onBackToRooms,
  onRecordInspection,
  onCompleteRoom,
  onNavigateToRoom,
  onCompleteAllChecklist,
}) => {
  // Map results for this session
  const inspectedMap = useMemo(() => {
    const map = new Map<string, ChecklistItemResult>();
    for (const res of itemResults) {
      if (res.checklist_session_id === sessionId) {
        map.set(res.inventory_item_id, res);
      }
    }
    return map;
  }, [itemResults, sessionId]);

  // Counts & Progress
  const totalCount = roomItems.length;
  const inspectedCount = useMemo(() => {
    return roomItems.filter((it) => inspectedMap.has(it.id)).length;
  }, [roomItems, inspectedMap]);

  const issuesCount = useMemo(() => {
    return roomItems.filter((it) => {
      const res = inspectedMap.get(it.id);
      return res && (res.status === 'damaged' || res.status === 'missing');
    }).length;
  }, [roomItems, inspectedMap]);

  const progressPercent = totalCount > 0 ? Math.round((inspectedCount / totalCount) * 100) : 0;
  const isRoomCompleted = totalCount > 0 && inspectedCount === totalCount;

  // Filter tab state
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Filtered items list
  const displayedItems = useMemo(() => {
    return roomItems.filter((it) => {
      const res = inspectedMap.get(it.id);
      if (activeTab === 'pending') return !res;
      if (activeTab === 'checked') return res && res.status === 'found';
      if (activeTab === 'issues') return res && (res.status === 'damaged' || res.status === 'missing');
      return true;
    });
  }, [roomItems, inspectedMap, activeTab]);

  // Next room determination
  const nextPendingRoom = useMemo(() => {
    const pending = allRooms.filter(
      (r) => r.id !== room.id && !completedRoomIds.has(r.id)
    );
    return pending[0] || null;
  }, [allRooms, room.id, completedRoomIds]);

  // Check if all rooms in property are completed
  const areAllRoomsDone = (justCompletedRoomId: string) => {
    const remaining = allRooms.filter(
      (r) => r.id !== justCompletedRoomId && !completedRoomIds.has(r.id)
    );
    return remaining.length === 0;
  };

  // Detailed inspection state (modal opened on double-tap)
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<InventoryItem | null>(null);
  const [detailAnswers, setDetailAnswers] = useState<Record<string, boolean>>({});

  // Issue reporting modal state
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueModalItem, setIssueModalItem] = useState<InventoryItem | null>(null);
  const [issueModalInitialType, setIssueModalInitialType] = useState<ChecklistOccurrenceType>('damaged');
  const [issueModalInitialTag, setIssueModalInitialTag] = useState<string | null>(null);
  const [issueModalFailedQuestion, setIssueModalFailedQuestion] = useState<string | null>(null);

  // Quantity adjust modal state
  const [isQuantityModalOpen, setIsQuantityModalOpen] = useState(false);
  const [quantityModalItem, setQuantityModalItem] = useState<InventoryItem | null>(null);

  // Celebration overlay state
  const [celebrationState, setCelebrationState] = useState<{
    open: boolean;
    type: 'room' | 'all';
    nextRoom: Room | null;
  } | null>(null);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmIncompleteOpen, setConfirmIncompleteOpen] = useState(false);

  // Set of item IDs whose image failed to load (fallback to placeholder gracefully)
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());

  // Lightbox fullscreen photo zoom state
  const [photoZoomUrl, setPhotoZoomUrl] = useState<string | null>(null);
  const [photoZoomName, setPhotoZoomName] = useState<string>('');

  // Tap gesture tracking: store timers per item ID
  const tapTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastTapRef = useRef<{ itemId: string; time: number } | null>(null);

  // Cleanup pending tap timers on unmount
  useEffect(() => {
    const timers = tapTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  // Android hardware back navigation
  useEffect(() => {
    const unregister = registerBackHandler('QuickRoomInspection', 50, () => {
      if (photoZoomUrl) {
        setPhotoZoomUrl(null);
        return true;
      }
      if (confirmIncompleteOpen) {
        setConfirmIncompleteOpen(false);
        return true;
      }
      if (isIssueModalOpen) {
        setIsIssueModalOpen(false);
        return true;
      }
      if (isQuantityModalOpen) {
        setIsQuantityModalOpen(false);
        return true;
      }
      if (selectedItemForDetails) {
        setSelectedItemForDetails(null);
        return true;
      }
      if (celebrationState?.open) {
        setCelebrationState(null);
        return true;
      }
      onBackToRooms();
      return true;
    });

    return () => unregister();
  }, [
    photoZoomUrl,
    confirmIncompleteOpen,
    isIssueModalOpen,
    isQuantityModalOpen,
    selectedItemForDetails,
    celebrationState,
    onBackToRooms,
  ]);

  // Open detailed inspection modal for an item
  const openDetailedModal = (item: InventoryItem) => {
    setSelectedItemForDetails(item);
    setDetailAnswers({});
  };

  // Single tap confirmation: Mark item as APPROVED / FOUND immediately
  const handleSingleTapApproved = async (item: InventoryItem) => {
    try {
      await onRecordInspection({
        item,
        status: 'found',
        foundQuantity: item.expected_quantity,
        notes: null,
        inspectionTypeSnapshot: item.inspection_type || 'physical_integrity',
        inspectionAnswers: null,
      });
    } catch (err) {
      console.error('Erro ao aprovar item no modo rápido:', err);
    }
  };

  // Card click handler with 280ms single vs double tap discriminator
  const handleItemCardClick = (item: InventoryItem) => {
    const now = Date.now();
    const last = lastTapRef.current;

    // Check if this is a double tap on the SAME item within 280ms
    if (last && last.itemId === item.id && now - last.time < 280) {
      // 1. Cancel the single tap timer for this item
      const pendingTimer = tapTimersRef.current.get(item.id);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        tapTimersRef.current.delete(item.id);
      }
      lastTapRef.current = null;

      // 2. Open detailed inspection modal
      openDetailedModal(item);
      return;
    }

    // First tap on this item (or subsequent tap after delay)
    lastTapRef.current = { itemId: item.id, time: now };

    // Clear any previous timer on this item if exists
    const existing = tapTimersRef.current.get(item.id);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule single tap execution after 280ms
    const timer = setTimeout(() => {
      tapTimersRef.current.delete(item.id);
      lastTapRef.current = null;
      handleSingleTapApproved(item);
    }, 280);

    tapTimersRef.current.set(item.id, timer);
  };

  // Finish room logic
  const handleCompleteRoomAction = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onCompleteRoom(room.id);
      const allDone = areAllRoomsDone(room.id);
      if (allDone) {
        setCelebrationState({
          open: true,
          type: 'all',
          nextRoom: null,
        });
      } else {
        setCelebrationState({
          open: true,
          type: 'room',
          nextRoom: nextPendingRoom,
        });
      }
    } catch (err) {
      console.error('Erro ao concluir cômodo:', err);
    } finally {
      setIsSubmitting(false);
      setConfirmIncompleteOpen(false);
    }
  };

  // Issue modal confirmation callback
  const handleIssueConfirmed = async (data: {
    status: 'missing' | 'damaged';
    foundQuantity: number;
    occurrenceType: ChecklistOccurrenceType;
    missingQuantity: number;
    description: string;
    failedQuestion?: string | null;
  }) => {
    if (!issueModalItem) return;
    setIsIssueModalOpen(false);
    setIsSubmitting(true);
    try {
      await onRecordInspection({
        item: issueModalItem,
        status: data.status,
        foundQuantity: data.foundQuantity,
        notes: data.description,
        occurrenceType: data.occurrenceType,
        missingQuantity: data.missingQuantity,
        occurrenceDescription: data.description,
        inspectionTypeSnapshot: issueModalItem.inspection_type || 'physical_integrity',
        inspectionAnswers: detailAnswers,
        failedQuestion: data.failedQuestion,
      });
      // Close details modal if it was open
      setSelectedItemForDetails(null);
    } catch (err) {
      console.error('Erro ao registrar pendência no modo rápido:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quantity modal confirmation callback
  const handleQuantityConfirmed = async (foundQty: number, missingQty: number) => {
    if (!quantityModalItem) return;
    setIsQuantityModalOpen(false);
    setIsSubmitting(true);
    try {
      const isFull = missingQty === 0;
      await onRecordInspection({
        item: quantityModalItem,
        status: isFull ? 'found' : 'missing',
        foundQuantity: foundQty,
        notes: isFull ? null : `Faltando ${missingQty} unidade(s)`,
        occurrenceType: isFull ? null : 'missing',
        missingQuantity: missingQty,
        occurrenceDescription: isFull
          ? null
          : `Faltando ${missingQty} unidade(s) de ${quantityModalItem.expected_quantity}`,
        inspectionTypeSnapshot: quantityModalItem.inspection_type || 'physical_integrity',
      });
      // Close details modal if open
      setSelectedItemForDetails(null);
    } catch (err) {
      console.error('Erro ao ajustar quantidade no modo rápido:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none pb-28">
      {/* 1. TOP HEADER */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-4 py-2.5 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          {/* Back Button */}
          <button
            type="button"
            onClick={onBackToRooms}
            className="p-2 -ml-1 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:scale-95 transition-all flex items-center gap-1.5"
            title="Voltar para lista de cômodos"
          >
            <ArrowLeft className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-bold hidden xs:inline text-slate-300">Cômodos</span>
          </button>

          {/* Room Title & Badge */}
          <div className="flex-1 min-w-0 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <h1 className="text-sm sm:text-base font-black text-white truncate max-w-[200px] sm:max-w-md">
                {room.name}
              </h1>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                <span>Rápido</span>
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-400">
              {inspectedCount} de {totalCount} conferidos ({progressPercent}%)
            </div>
          </div>

          {/* Progress Pill */}
          <div className="shrink-0 flex items-center gap-1">
            <span
              className={`px-2 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 ${
                isRoomCompleted
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {isRoomCompleted ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Pronto</span>
                </>
              ) : (
                <span>{progressPercent}%</span>
              )}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="max-w-4xl mx-auto mt-2 w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isRoomCompleted ? 'bg-emerald-400' : 'bg-gradient-to-r from-emerald-500 to-amber-400'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      {/* 2. SUB-HEADER: TABS & INSTRUCTIONS */}
      <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 pt-3 pb-1 space-y-2">
        {/* Interaction Hint */}
        <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2 text-[11px] sm:text-xs text-slate-300 leading-snug">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            <strong className="text-emerald-400">1 toque:</strong> aprova como OK •{' '}
            <strong className="text-amber-300">2 toques rápidos:</strong> abre perguntas, avarias ou quantidades.
          </span>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
              activeTab === 'all'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Todos ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
              activeTab === 'pending'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Pendentes ({totalCount - inspectedCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('checked')}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
              activeTab === 'checked'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Conferidos ({inspectedCount - issuesCount})
          </button>
          {issuesCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('issues')}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
                activeTab === 'issues'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'bg-rose-950/30 text-rose-400 border border-rose-500/30 hover:bg-rose-900/40'
              }`}
            >
              Problemas ({issuesCount})
            </button>
          )}
        </div>
      </div>

      {/* 3. 3-COLUMN MOBILE GRID */}
      <main className="max-w-4xl mx-auto w-full px-2.5 sm:px-4 py-2 flex-1">
        {displayedItems.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl p-6">
            <Package className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-300">Nenhum item nesta visualização</p>
            <p className="text-xs text-slate-500 mt-1">
              {activeTab === 'pending'
                ? 'Parabéns! Todos os itens foram conferidos.'
                : 'Selecione a aba "Todos" para visualizar todos os itens do cômodo.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {displayedItems.map((item) => {
              const result = inspectedMap.get(item.id);
              const isChecked = !!result;
              const isApproved = result?.status === 'found';
              const isDamaged = result?.status === 'damaged';
              const isMissing = result?.status === 'missing';
              const isIssue = isDamaged || isMissing;
              const isQuantity = item.inventory_type === 'quantity';

              const itemImagePath = item.image_path || (item as any).image_url;
              const imageUrl = getInventoryImageUrl(itemImagePath);
              const hasValidImage = Boolean(imageUrl && !failedImageIds.has(item.id));

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemCardClick(item)}
                  role="button"
                  tabIndex={0}
                  className={`relative rounded-2xl p-2 flex flex-col justify-between transition-all duration-150 touch-manipulation select-none active:scale-[0.96] shadow-sm cursor-pointer ${
                    isApproved
                      ? 'bg-emerald-950/40 border-2 border-emerald-500 shadow-emerald-500/10'
                      : isIssue
                      ? 'bg-rose-950/40 border-2 border-rose-500 shadow-rose-500/10'
                      : 'bg-slate-900/90 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Top Badges Row */}
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    {/* Code Badge */}
                    <span className="px-1.5 py-0.5 rounded bg-slate-950/90 text-[10px] font-black text-slate-300 border border-slate-800 truncate max-w-[65px]">
                      #{item.identification_code || '---'}
                    </span>

                    {/* Quantity Badge if > 1 */}
                    {isQuantity && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-black shrink-0">
                        x{item.expected_quantity}
                      </span>
                    )}
                  </div>

                  {/* Thumbnail Image / Placeholder */}
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80 mb-1.5 flex items-center justify-center">
                    {hasValidImage ? (
                      <>
                        {/* Ambient backdrop blur for clean styling */}
                        <img
                          src={imageUrl!}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover blur-md opacity-25 scale-110 pointer-events-none select-none"
                        />
                        {/* Primary Image with object-cover and lazy loading */}
                        <img
                          src={imageUrl!}
                          alt={item.name}
                          loading="lazy"
                          decoding="async"
                          onError={() => {
                            setFailedImageIds((prev) => new Set(prev).add(item.id));
                          }}
                          className="w-full h-full object-cover relative z-10 pointer-events-none select-none"
                        />
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-2 text-slate-600 pointer-events-none select-none">
                        <Package className="w-7 h-7 text-slate-700" />
                      </div>
                    )}

                    {/* Overlay Status Checkmark / Warning Badge */}
                    {isApproved && (
                      <div className="absolute inset-0 z-20 bg-emerald-950/40 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                        <div className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg animate-scaleIn">
                          <Check className="w-5 h-5 stroke-[3]" />
                        </div>
                      </div>
                    )}

                    {isIssue && (
                      <div className="absolute inset-0 z-20 bg-rose-950/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                        <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg animate-scaleIn">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Item Name */}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white line-clamp-2 leading-tight">
                      {item.name}
                    </p>
                  </div>

                  {/* Status Indicator Bar at bottom */}
                  <div className="mt-2 pt-1 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-extrabold">
                    {isApproved ? (
                      <span className="text-emerald-400 flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Aprovado</span>
                      </span>
                    ) : isIssue ? (
                      <span className="text-rose-400 flex items-center gap-0.5 truncate">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{isMissing ? 'Faltando' : 'Avariado'}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">Pendente</span>
                    )}

                    <span className="text-slate-500 text-[9px]">2x detalhe</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 4. STICKY BOTTOM ACTION BAR */}
      <footer className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 p-3 sm:p-4 shadow-2xl">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {/* Progress summary */}
          <div className="hidden xs:block min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-400">
              Progresso do ambiente:
            </div>
            <div className="text-sm font-black text-white">
              {inspectedCount} de {totalCount} itens ({progressPercent}%)
            </div>
          </div>

          {/* Concluir Cômodo Button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              if (inspectedCount < totalCount) {
                setConfirmIncompleteOpen(true);
              } else {
                handleCompleteRoomAction();
              }
            }}
            className={`flex-1 xs:flex-initial px-5 py-3.5 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all ${
              isRoomCompleted
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
            }`}
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Concluir Cômodo</span>
          </button>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 5. DETAILED INSPECTION MODAL (DOUBLE TAP) */}
      {/* ========================================================================= */}
      {selectedItemForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md animate-fadeIn">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-emerald-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Inspeção Detalhada
                </span>
                <h3 className="text-base font-black text-white truncate mt-1">
                  {selectedItemForDetails.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemForDetails(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-4 overflow-y-auto space-y-4">
              {/* Photo & Details Row */}
              {(() => {
                const detailImagePath = selectedItemForDetails.image_path || (selectedItemForDetails as any).image_url;
                const detailImageUrl = getInventoryImageUrl(detailImagePath);
                const hasDetailImage = Boolean(detailImageUrl && !failedImageIds.has(selectedItemForDetails.id));

                return (
                  <div className="flex items-start gap-3.5 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
                    <div
                      className={`w-24 h-24 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative ${
                        hasDetailImage ? 'cursor-pointer hover:border-emerald-500/50 transition-colors group' : ''
                      }`}
                      onClick={() => {
                        if (hasDetailImage && detailImageUrl) {
                          setPhotoZoomUrl(detailImageUrl);
                          setPhotoZoomName(selectedItemForDetails.name);
                        }
                      }}
                      title={hasDetailImage ? 'Toque para ampliar a foto' : undefined}
                    >
                      {hasDetailImage && detailImageUrl ? (
                        <>
                          <img
                            src={detailImageUrl}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 w-full h-full object-cover blur-sm opacity-25 scale-110 pointer-events-none"
                          />
                          <img
                            src={detailImageUrl}
                            alt={selectedItemForDetails.name}
                            onError={() => {
                              setFailedImageIds((prev) => new Set(prev).add(selectedItemForDetails.id));
                            }}
                            className="w-full h-full object-cover relative z-10 pointer-events-none group-active:scale-105 transition-transform"
                          />
                          <div className="absolute bottom-1 right-1 z-20 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-bold text-white pointer-events-none flex items-center gap-0.5">
                            <Eye className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Zoom</span>
                          </div>
                        </>
                      ) : (
                        <Package className="w-10 h-10 text-slate-700" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-xs font-bold text-slate-400">
                        Código: <span className="text-white">#{selectedItemForDetails.identification_code || '---'}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-400">
                        Tipo de Cadastro:{' '}
                        <span className="text-emerald-300">
                          {selectedItemForDetails.inventory_type === 'quantity'
                            ? `Quantidade (${selectedItemForDetails.expected_quantity} unidades)`
                            : 'Item Individual'}
                        </span>
                      </div>
                      {/* Inspection type badge */}
                      {(() => {
                        const cfg = getInspectionTypeConfig(selectedItemForDetails.inspection_type);
                        return (
                          <div className="pt-1">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {cfg.label}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              {/* Inspection Type Specific Questions */}
              {(() => {
                const config = getInspectionTypeConfig(selectedItemForDetails.inspection_type);
                return (
                  <div className="space-y-2.5 bg-slate-950/90 p-3.5 rounded-2xl border border-slate-800">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Critérios de Avaliação ({config.label})</span>
                    </h4>

                    <div className="space-y-2">
                      {config.questions.map((q, idx) => {
                        const answer = detailAnswers[q.id];
                        return (
                          <div
                            key={q.id}
                            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                          >
                            <span className="text-xs font-semibold text-slate-200 leading-snug flex-1">
                              {idx + 1}. {q.question}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setDetailAnswers((prev) => ({ ...prev, [q.id]: true }))
                                }
                                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                                  answer === true
                                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                SIM
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailAnswers((prev) => ({ ...prev, [q.id]: false }));
                                  setIssueModalItem(selectedItemForDetails);
                                  setIssueModalInitialType('damaged');
                                  setIssueModalInitialTag(q.shortTag);
                                  setIssueModalFailedQuestion(q.question);
                                  setIsIssueModalOpen(true);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                                  answer === false
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                NÃO
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons for Detailed Modal */}
              <div className="space-y-2 pt-2">
                {/* 1. Confirm Approved */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={async () => {
                    await handleSingleTapApproved(selectedItemForDetails);
                    setSelectedItemForDetails(null);
                  }}
                  className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-98 transition-all"
                >
                  <Check className="w-5 h-5 stroke-[3]" />
                  <span>Confirmar Item Aprovado (Tudo OK)</span>
                </button>

                {/* 2. Quantity Adjust (if applicable) */}
                {selectedItemForDetails.inventory_type === 'quantity' && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuantityModalItem(selectedItemForDetails);
                      setIsQuantityModalOpen(true);
                    }}
                    className="w-full py-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Package className="w-4 h-4 text-blue-400" />
                    <span>Ajustar Quantidades (Faltando Unidades)</span>
                  </button>
                )}

                {/* 3. Report Damage / Defect */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIssueModalItem(selectedItemForDetails);
                      setIssueModalInitialType('damaged');
                      setIssueModalInitialTag('Quebrado / Avariado');
                      setIssueModalFailedQuestion(null);
                      setIsIssueModalOpen(true);
                    }}
                    className="py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Relatar Avaria</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIssueModalItem(selectedItemForDetails);
                      setIssueModalInitialType('missing');
                      setIssueModalInitialTag('Item sumiu / Não encontrado');
                      setIssueModalFailedQuestion(null);
                      setIsIssueModalOpen(true);
                    }}
                    className="py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <X className="w-4 h-4 text-rose-400" />
                    <span>Item Sumiu / Falta</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. CONFIRM INCOMPLETE ROOM MODAL */}
      {/* ========================================================================= */}
      {confirmIncompleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-amber-500/40 p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                Ainda há itens não conferidos!
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Restam <strong className="text-amber-400">{totalCount - inspectedCount}</strong> item(ns) pendente(s) neste ambiente. Deseja realmente concluir o cômodo agora?
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmIncompleteOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Voltar e Conferir
              </button>
              <button
                type="button"
                onClick={handleCompleteRoomAction}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black"
              >
                Concluir Mesmo Assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. ISSUE REPORT MODAL (REUSED) */}
      {/* ========================================================================= */}
      <SeniorIssueModal
        isOpen={isIssueModalOpen}
        item={issueModalItem}
        initialOccurrenceType={issueModalInitialType}
        initialTag={issueModalInitialTag}
        failedQuestion={issueModalFailedQuestion}
        onClose={() => setIsIssueModalOpen(false)}
        onConfirm={handleIssueConfirmed}
      />

      {/* ========================================================================= */}
      {/* 8. QUANTITY ADJUST MODAL (REUSED) */}
      {/* ========================================================================= */}
      <SeniorQuantityAdjustModal
        isOpen={isQuantityModalOpen}
        item={quantityModalItem}
        onClose={() => setIsQuantityModalOpen(false)}
        onConfirm={handleQuantityConfirmed}
      />

      {/* ========================================================================= */}
      {/* 9. CELEBRATION OVERLAY (REUSED) */}
      {/* ========================================================================= */}
      {celebrationState?.open && (
        <SeniorCelebrationOverlay
          type={celebrationState.type}
          roomName={room.name}
          nextRoom={celebrationState.nextRoom}
          onAdvance={() => {
            if (celebrationState.type === 'room' && celebrationState.nextRoom) {
              const target = celebrationState.nextRoom;
              setCelebrationState(null);
              onNavigateToRoom(target);
            } else {
              setCelebrationState(null);
              onCompleteAllChecklist();
            }
          }}
          onClose={() => setCelebrationState(null)}
        />
      )}

      {/* ========================================================================= */}
      {/* 10. FULLSCREEN PHOTO LIGHTBOX */}
      {/* ========================================================================= */}
      {photoZoomUrl && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-3 sm:p-5 bg-black/95 backdrop-blur-md animate-fadeIn"
          onClick={() => setPhotoZoomUrl(null)}
        >
          <div className="w-full max-w-lg flex items-center justify-between p-2 text-white">
            <span className="text-sm font-bold truncate max-w-[280px]">
              {photoZoomName}
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
              alt={photoZoomName}
              className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl border border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
};
