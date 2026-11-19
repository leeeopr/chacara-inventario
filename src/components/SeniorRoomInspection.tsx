import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Hash,
  Home,
  Layers,
  Package,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
  Zap,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import { getConditionConfig } from '../lib/conditionUtils';
import {
  getInspectionTypeConfig,
  InspectionType,
} from '../lib/inspectionTypeUtils';
import { getInventoryImageUrl } from '../lib/supabase';
import { ChecklistItemResult, ChecklistOccurrence } from '../types/checklist';
import { InventoryItem, Room } from '../types/inventory';
import { SeniorCelebrationOverlay } from './SeniorCelebrationOverlay';
import { SeniorIssueModal } from './SeniorIssueModal';
import { SeniorQuantityAdjustModal } from './SeniorQuantityAdjustModal';

interface SeniorRoomInspectionProps {
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

export const SeniorRoomInspection: React.FC<SeniorRoomInspectionProps> = ({
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
  // Map of inspected items in this session
  const inspectedMap = useMemo(() => {
    const map = new Map<string, ChecklistItemResult>();
    for (const res of itemResults) {
      if (res.checklist_session_id === sessionId) {
        map.set(res.inventory_item_id, res);
      }
    }
    return map;
  }, [itemResults, sessionId]);

  // Find first uninspected item index
  const initialIndex = useMemo(() => {
    const idx = roomItems.findIndex((it) => !inspectedMap.has(it.id));
    return idx >= 0 ? idx : Math.max(0, roomItems.length - 1);
  }, [roomItems, inspectedMap]);

  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sequential question state
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [inspectionAnswers, setInspectionAnswers] = useState<Record<string, boolean>>({});
  const [activeFailedQuestion, setActiveFailedQuestion] = useState<string | null>(null);
  const [issueModalInitialType, setIssueModalInitialType] = useState<'missing' | 'damaged'>('missing');
  const [issueModalInitialTag, setIssueModalInitialTag] = useState<string | null>(null);

  // Modals
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isQuantityModalOpen, setIsQuantityModalOpen] = useState(false);
  const [isPhotoZoomOpen, setIsPhotoZoomOpen] = useState(false);
  const [celebrationState, setCelebrationState] = useState<{
    open: boolean;
    type: 'room' | 'all';
    nextRoom: Room | null;
  }>({
    open: false,
    type: 'room',
    nextRoom: null,
  });

  // Register Android Hardware Back Button and Gesture Handler for SeniorRoomInspection
  useEffect(() => {
    const unregister = registerBackHandler('SeniorRoomInspection', 50, () => {
      // 1. Close full-screen photo zoom preview if open
      if (isPhotoZoomOpen) {
        setIsPhotoZoomOpen(false);
        return true;
      }
      // 2. Close issue modal if open
      if (isIssueModalOpen) {
        setIsIssueModalOpen(false);
        return true;
      }
      // 3. Close quantity adjust modal if open
      if (isQuantityModalOpen) {
        setIsQuantityModalOpen(false);
        return true;
      }
      // 4. Close celebration overlay if open
      if (celebrationState.open) {
        setCelebrationState({ open: false, type: 'room', nextRoom: null });
        return true;
      }
      // 5. If inside multi-step checklist questions (e.g. Q3 or Q2), step back to previous question
      if (questionIndex > 0) {
        setQuestionIndex((prev) => Math.max(0, prev - 1));
        return true;
      }
      // 6. If on the first question, navigate back to the room selection overview screen.
      // (All recorded item inspections in this session remain 100% saved and intact)
      onBackToRooms();
      return true;
    });

    return unregister;
  }, [
    isPhotoZoomOpen,
    isIssueModalOpen,
    isQuantityModalOpen,
    celebrationState.open,
    questionIndex,
    onBackToRooms,
  ]);

  const currentItem = roomItems[currentIndex] || null;
  const isIndividual = currentItem?.inventory_type === 'individual';
  const imageUrl = currentItem ? getInventoryImageUrl(currentItem.image_path) : null;
  const currentResult = currentItem ? inspectedMap.get(currentItem.id) : null;

  // Active item inspection configuration
  const currentInspectionConfig = useMemo(() => {
    return getInspectionTypeConfig(currentItem?.inspection_type);
  }, [currentItem?.inspection_type]);

  const currentQuestion =
    currentInspectionConfig.questions[questionIndex] || currentInspectionConfig.questions[0];

  const InspectionIcon =
    currentInspectionConfig.iconName === 'Zap'
      ? Zap
      : currentInspectionConfig.iconName === 'Sparkles'
      ? Sparkles
      : ShieldCheck;

  // Reset question flow whenever currentItem changes
  useEffect(() => {
    setQuestionIndex(0);
    setInspectionAnswers({});
    setActiveFailedQuestion(null);
  }, [currentIndex]);

  // Total progression in this room
  const inspectedInRoomCount = useMemo(() => {
    return roomItems.filter((it) => inspectedMap.has(it.id)).length;
  }, [roomItems, inspectedMap]);

  // Find the next pending room after this one
  const nextPendingRoom = useMemo(() => {
    const pendingRooms = allRooms.filter(
      (r) => r.id !== room.id && !completedRoomIds.has(r.id)
    );
    return pendingRooms[0] || null;
  }, [allRooms, room.id, completedRoomIds]);

  // Check if all rooms in the entire property are now completed
  const areAllRoomsDone = (justCompletedRoomId: string) => {
    const remaining = allRooms.filter(
      (r) => r.id !== justCompletedRoomId && !completedRoomIds.has(r.id)
    );
    return remaining.length === 0;
  };

  // Called when room has completed its last item
  const handleRoomFinished = async () => {
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
  };

  // Advance to next item or finish room
  const advanceToNext = async () => {
    if (currentIndex < roomItems.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      await handleRoomFinished();
    }
  };

  // Answer SIM for the current question
  const handleAnswerSim = async () => {
    if (!currentItem || isSubmitting) return;

    const updatedAnswers = {
      ...inspectionAnswers,
      [currentQuestion.id]: true,
    };
    setInspectionAnswers(updatedAnswers);

    if (questionIndex < currentInspectionConfig.questions.length - 1) {
      setQuestionIndex((prev) => prev + 1);
    } else {
      // All questions passed with SIM! Confirm item as found & approved
      setIsSubmitting(true);
      try {
        await onRecordInspection({
          item: currentItem,
          status: 'found',
          foundQuantity: currentItem.expected_quantity,
          notes: null,
          inspectionTypeSnapshot: currentInspectionConfig.type,
          inspectionAnswers: updatedAnswers,
        });
        await advanceToNext();
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Answer NÃO for the current question
  const handleAnswerNao = () => {
    if (!currentItem) return;
    setActiveFailedQuestion(currentQuestion.question);
    setIssueModalInitialType('damaged');
    setIssueModalInitialTag(currentQuestion.shortTag);
    setIsIssueModalOpen(true);
  };

  // Explicit action for physically missing item
  const handleItemMissing = () => {
    if (!currentItem) return;
    setActiveFailedQuestion(null);
    setIssueModalInitialType('missing');
    setIssueModalInitialTag('Item sumiu / Não encontrado');
    setIsIssueModalOpen(true);
  };

  // Quantity partial found confirmation ("Falta Algum")
  const handleQuantityConfirmed = async (foundQty: number, missingQty: number) => {
    if (!currentItem || isSubmitting) return;
    setIsQuantityModalOpen(false);
    setIsSubmitting(true);
    try {
      const isFull = missingQty === 0;
      await onRecordInspection({
        item: currentItem,
        status: isFull ? 'found' : 'missing',
        foundQuantity: foundQty,
        notes: isFull ? null : `Faltando ${missingQty} unidade(s)`,
        occurrenceType: isFull ? null : 'missing',
        missingQuantity: missingQty,
        occurrenceDescription: isFull
          ? null
          : `Faltando ${missingQty} unidade(s) de ${currentItem.expected_quantity}`,
        inspectionTypeSnapshot: currentInspectionConfig.type,
        inspectionAnswers,
      });
      await advanceToNext();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Issue modal confirmation (Missing or Damaged)
  const handleIssueConfirmed = async (data: {
    status: 'missing' | 'damaged';
    foundQuantity: number;
    occurrenceType: 'missing' | 'damaged';
    missingQuantity: number;
    description: string;
    failedQuestion?: string | null;
  }) => {
    if (!currentItem || isSubmitting) return;
    setIsIssueModalOpen(false);
    setIsSubmitting(true);
    try {
      await onRecordInspection({
        item: currentItem,
        status: data.status,
        foundQuantity: data.foundQuantity,
        notes: data.description,
        occurrenceType: data.occurrenceType,
        missingQuantity: data.missingQuantity,
        occurrenceDescription: data.description,
        inspectionTypeSnapshot: currentInspectionConfig.type,
        inspectionAnswers: {
          ...inspectionAnswers,
          ...(data.failedQuestion ? { [currentQuestion.id]: false } : {}),
        },
        failedQuestion: data.failedQuestion || activeFailedQuestion || null,
      });
      await advanceToNext();
    } finally {
      setIsSubmitting(false);
    }
  };

  // If room has no registered items
  if (roomItems.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={onBackToRooms}
            className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 font-bold flex items-center gap-2"
          >
            <ArrowLeft className="w-6 h-6" />
            <span className="text-base">Voltar</span>
          </button>
        </div>

        <div className="my-auto max-w-md mx-auto text-center p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-5">
          <div className="w-20 h-20 rounded-3xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto">
            <Package className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">{room.name}</h2>
            <p className="text-sm font-bold text-slate-400 mt-2">
              Nenhum item cadastrado para este cômodo ainda.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await onCompleteRoom(room.id);
              if (nextPendingRoom) onNavigateToRoom(nextPendingRoom);
              else onBackToRooms();
            }}
            className="w-full py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg"
          >
            MARCAR COMO CONCLUÍDO
          </button>
        </div>
      </div>
    );
  }

  const progressPercent = Math.round(
    ((currentIndex + 1) / roomItems.length) * 100
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between select-none pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Top Header - High contrast room title & progress */}
      <header className="sticky top-0 z-30 bg-slate-900/95 border-b-2 border-slate-800 p-2.5 sm:p-3 backdrop-blur-md">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBackToRooms}
            className="py-2 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 border border-slate-700 shrink-0"
          >
            <ArrowLeft className="w-4 h-4 stroke-[3]" />
            <span>Cômodos</span>
          </button>

          <div className="text-center min-w-0 flex-1 px-1">
            <h1 className="text-base sm:text-xl font-black text-white truncate tracking-tight uppercase">
              {room.name}
            </h1>
            <p className="text-[11px] sm:text-xs font-extrabold text-emerald-400">
              ITEM {currentIndex + 1} DE {roomItems.length}
            </p>
          </div>

          {/* Quick previous item button if needed */}
          {currentIndex > 0 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
              className="py-2 px-2.5 rounded-2xl bg-slate-800 text-slate-300 font-bold flex items-center gap-1 shrink-0 text-xs"
              title="Item anterior"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Anterior</span>
            </button>
          ) : (
            <div className="w-16 shrink-0" />
          )}
        </div>

        {/* High-visibility progress bar */}
        <div className="max-w-xl mx-auto mt-2">
          <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </header>

      {/* ZONE 1: Foto do Item e Identificação (Respeita a proporção da imagem) */}
      {currentItem && (
        <section className="w-full max-w-xl mx-auto px-3 sm:px-4 pt-1.5 shrink-0">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
            {/* Foto Prominente com frame expandido (seguindo o exemplo do quadrado vermelho) */}
            <div
              className="relative w-full h-64 xs:h-72 sm:h-80 max-h-[38vh] bg-slate-950 flex items-center justify-center p-2 cursor-pointer group"
              onClick={() => setIsPhotoZoomOpen(true)}
              title="Toque para ampliar foto em tela cheia"
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={currentItem.name}
                  className="max-h-full max-w-full object-contain mx-auto rounded-2xl group-active:scale-105 transition-transform"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-slate-600">
                  <Camera className="w-10 h-10 mb-1 opacity-40" />
                  <span className="text-xs font-bold text-slate-500">Sem fotografia</span>
                </div>
              )}

              {/* Tag de Código (#UT08) */}
              {currentItem.identification_code && (
                <div className="absolute top-2 left-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black text-xs font-mono shadow border border-amber-300">
                    <Hash className="w-3 h-3 stroke-[3]" />
                    {currentItem.identification_code}
                  </span>
                </div>
              )}

              {/* Tag de Quantidade / Tipo */}
              <div className="absolute top-2 right-2">
                {!isIndividual ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs shadow border border-emerald-400">
                    <Package className="w-3 h-3 stroke-[2.5]" />
                    {currentItem.expected_quantity} UN
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-lg bg-slate-900/90 text-slate-200 font-extrabold text-[11px] backdrop-blur-md border border-slate-700 shadow">
                    Individual
                  </span>
                )}
              </div>

              {/* Tag de Status Já Conferido */}
              {currentResult && (
                <div className="absolute bottom-2 left-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-[11px] backdrop-blur-md shadow ${
                      currentResult.status === 'found'
                        ? 'bg-emerald-500/95 text-slate-950'
                        : 'bg-rose-500/95 text-white'
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                    {currentResult.status === 'found' ? 'Conferido' : 'Problema'}
                  </span>
                </div>
              )}
            </div>

            {/* Faixa com Nome e Condição */}
            <div className="px-3 py-2 bg-slate-900/95 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-black text-white truncate leading-snug">
                {currentItem.name}
              </h2>

              {(() => {
                const conditionCfg = getConditionConfig(currentItem.condition_status);
                return (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border shrink-0 ${conditionCfg.badgeBg} ${conditionCfg.badgeBorder} ${conditionCfg.badgeText}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${conditionCfg.dotColor}`} />
                    {conditionCfg.shortLabel}
                  </span>
                );
              })()}
            </div>
          </div>
        </section>
      )}

      {/* ZONE 2: Pergunta Centralizada NO MEIO DA TELA para facilitar a leitura */}
      {currentItem && (
        <main className="flex-1 w-full max-w-xl mx-auto px-3 sm:px-4 flex flex-col justify-center items-center my-auto py-2">
          <div className="w-full rounded-3xl bg-slate-900 border-2 border-slate-700/80 p-5 sm:p-6 space-y-3 shadow-2xl relative text-center">
            {/* Cabeçalho do Roteiro e Marcadores de Pergunta */}
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700">
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${currentInspectionConfig.badgeBg} ${currentInspectionConfig.badgeText}`}
                >
                  <InspectionIcon className="w-3.5 h-3.5" />
                </div>
                <span className={`text-xs font-black uppercase tracking-wider ${currentInspectionConfig.badgeText}`}>
                  {currentInspectionConfig.badgeLabel}
                </span>
              </div>

              {/* 3 Marcadores de Pergunta */}
              <div className="flex items-center gap-1.5">
                {currentInspectionConfig.questions.map((q, idx) => {
                  const isDone = idx < questionIndex;
                  const isCurrent = idx === questionIndex;
                  return (
                    <div
                      key={q.id}
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                        isDone
                          ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                          : isCurrent
                          ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-400/50 scale-105 shadow-md'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                      title={`Pergunta ${idx + 1}: ${q.question}`}
                    >
                      {isDone ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : idx + 1}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pergunta e Navegação Anterior */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                  Pergunta {questionIndex + 1} de {currentInspectionConfig.questions.length}
                </span>

                {questionIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuestionIndex((prev) => Math.max(0, prev - 1))}
                    className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 py-1 px-2 rounded-lg bg-slate-800 border border-slate-700 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Pergunta anterior</span>
                  </button>
                )}
              </div>

              {/* Texto da Pergunta em Destaque Central */}
              <h3 className="text-xl sm:text-2xl font-black text-white leading-snug tracking-tight px-1">
                {currentQuestion.question}
              </h3>

              {/* Orientação */}
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium max-w-md mx-auto">
                {currentInspectionConfig.description}
              </p>

              {/* Observação de Desgaste prévio se houver */}
              {currentItem.condition_status && currentItem.condition_status !== 'good' && (
                <p className="text-xs text-amber-300 font-medium bg-amber-500/10 border border-amber-500/25 p-2 rounded-xl text-left leading-snug mt-1">
                  ℹ️ <strong>Observação:</strong> Este item possui desgaste prévio registrado. Se o item estiver conforme o previsto, responda <strong>SIM</strong>.
                </p>
              )}
            </div>
          </div>
        </main>
      )}

      {/* ZONE 3: Natural Thumb Reach Area (Answer & Confirmation Buttons - IDENTICAL SIZES) */}
      {currentItem && (
        <section className="w-full max-w-xl mx-auto px-4 space-y-2.5 shrink-0 pt-1">
          {/* SIM (Primary Action - Same Size as NÃO) */}
          <button
            type="button"
            onClick={handleAnswerSim}
            disabled={isSubmitting}
            className="w-full h-14 sm:h-15 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 border-2 border-emerald-400 transition-all disabled:opacity-50"
          >
            <CheckCircle2 className="w-6 h-6 stroke-[3]" />
            <span>
              {questionIndex < currentInspectionConfig.questions.length - 1
                ? 'SIM (CONTINUAR)'
                : 'SIM (APROVADO)'}
            </span>
          </button>

          {/* NÃO (Defect / Issue Confirmation - EXACT SAME SIZE AS SIM) */}
          <button
            type="button"
            onClick={handleAnswerNao}
            disabled={isSubmitting}
            className="w-full h-14 sm:h-15 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-black text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-lg shadow-rose-950/40 border-2 border-rose-500 transition-all disabled:opacity-50"
          >
            <AlertTriangle className="w-6 h-6 stroke-[2.5] text-white" />
            <span>NÃO (COM PROBLEMA / DEFEITO)</span>
          </button>

          {/* Secondary Actions */}
          <div className="pt-0.5 flex items-center justify-between gap-2">
            {!isIndividual && (
              <button
                type="button"
                onClick={() => setIsQuantityModalOpen(true)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-800 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Falta Alguma Unidade</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleItemMissing}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-slate-400 hover:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Item não está no cômodo</span>
            </button>
          </div>
        </section>
      )}

      {/* Senior Fullscreen Photo Zoom Modal */}
      {isPhotoZoomOpen && currentItem && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-fadeIn"
          onClick={() => setIsPhotoZoomOpen(false)}
        >
          <div className="w-full max-w-xl flex items-center justify-between py-2 text-white">
            <div className="flex items-center gap-2">
              {currentItem.identification_code && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black font-mono text-sm">
                  #{currentItem.identification_code}
                </span>
              )}
              <span className="font-bold text-sm text-slate-200 truncate max-w-[200px] sm:max-w-xs">
                {currentItem.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsPhotoZoomOpen(false)}
              className="p-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white"
              aria-label="Fechar ampliação"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div
            className="flex-1 w-full max-w-xl flex items-center justify-center p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={currentItem.name}
                className="max-h-[75vh] max-w-full rounded-2xl object-contain shadow-2xl border border-slate-800"
              />
            ) : (
              <div className="text-center text-slate-500 py-12">
                <Camera className="w-16 h-16 mx-auto mb-2 opacity-40" />
                <p className="font-bold">Sem imagem disponível</p>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 py-2">
            Toque fora ou aperte Voltar para fechar
          </p>
        </div>
      )}

      {/* Senior Missing/Damaged Issue Modal */}
      <SeniorIssueModal
        isOpen={isIssueModalOpen}
        item={currentItem}
        initialOccurrenceType={issueModalInitialType}
        failedQuestion={activeFailedQuestion}
        initialTag={issueModalInitialTag}
        onClose={() => setIsIssueModalOpen(false)}
        onConfirm={handleIssueConfirmed}
      />

      {/* Senior Quantity Adjustment Modal ("Falta Algum") */}
      <SeniorQuantityAdjustModal
        isOpen={isQuantityModalOpen}
        item={currentItem}
        onClose={() => setIsQuantityModalOpen(false)}
        onConfirm={handleQuantityConfirmed}
      />

      {/* Room Completed / All Finished Overlay */}
      {celebrationState.open && (
        <SeniorCelebrationOverlay
          type={celebrationState.type}
          roomName={room.name}
          nextRoom={celebrationState.nextRoom}
          onAdvance={() => {
            setCelebrationState({ open: false, type: 'room', nextRoom: null });
            if (celebrationState.type === 'all') {
              onCompleteAllChecklist();
            } else if (celebrationState.nextRoom) {
              onNavigateToRoom(celebrationState.nextRoom);
            } else {
              onBackToRooms();
            }
          }}
        />
      )}
    </div>
  );
};
