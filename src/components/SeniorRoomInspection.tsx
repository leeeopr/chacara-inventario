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
  const [celebrationState, setCelebrationState] = useState<{
    open: boolean;
    type: 'room' | 'all';
    nextRoom: Room | null;
  }>({
    open: false,
    type: 'room',
    nextRoom: null,
  });

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
    <div className="min-h-screen bg-slate-950 text-white flex flex-col pb-8 select-none">
      {/* Top Header - High contrast, huge room title & progress */}
      <header className="sticky top-0 z-30 bg-slate-900/95 border-b-2 border-slate-800 p-3 sm:p-4 backdrop-blur-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToRooms}
            className="py-2.5 px-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-700 text-white font-extrabold text-sm sm:text-base flex items-center gap-2 border border-slate-700 shrink-0"
          >
            <ArrowLeft className="w-5 h-5 stroke-[3]" />
            <span className="hidden xs:inline">Cômodos</span>
          </button>

          <div className="text-center min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-black text-white truncate tracking-tight uppercase">
              {room.name}
            </h1>
            {room.suite?.name && (
              <p className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">
                {room.suite.name}
              </p>
            )}
            <p className="text-xs sm:text-sm font-extrabold text-emerald-400">
              ITEM {currentIndex + 1} DE {roomItems.length}
            </p>
          </div>

          {/* Quick previous item button if needed */}
          {currentIndex > 0 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
              className="p-2.5 rounded-2xl bg-slate-800 text-slate-300 font-bold flex items-center gap-1 shrink-0"
              title="Item anterior"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              <span className="text-xs font-bold hidden sm:inline">Anterior</span>
            </button>
          ) : (
            <div className="w-12 shrink-0" />
          )}
        </div>

        {/* Thick, high-visibility progress bar */}
        <div className="max-w-2xl mx-auto mt-2.5">
          <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </header>

      {/* Main Single Item Inspection Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col justify-between gap-4">
        {currentItem && (
          <>
            {/* Visual Item Showcase */}
            <div className="rounded-3xl bg-slate-900 border-2 border-slate-800 overflow-hidden shadow-2xl flex flex-col">
              {/* Large Photograph */}
              <div className="relative aspect-[16/11] w-full bg-slate-950 overflow-hidden flex items-center justify-center">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={currentItem.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-slate-600">
                    <Camera className="w-16 h-16 mb-2 opacity-30" />
                    <span className="text-sm font-black uppercase tracking-wider text-slate-500">
                      Sem fotografia cadastrada
                    </span>
                  </div>
                )}

                {/* Identification Code Tag (TG01, TM01, TP01...) */}
                {currentItem.identification_code && (
                  <div className="absolute top-4 left-4">
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-amber-400 text-slate-950 font-black text-lg sm:text-xl font-mono shadow-2xl border-2 border-amber-300">
                      <Hash className="w-5 h-5 stroke-[3]" />
                      {currentItem.identification_code}
                    </span>
                  </div>
                )}

                {/* Quantity badge for quantity-based items */}
                {!isIndividual && (
                  <div className="absolute top-4 right-4">
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-emerald-500 text-slate-950 font-black text-base sm:text-lg shadow-2xl border-2 border-emerald-400">
                      <Package className="w-5 h-5 stroke-[3]" />
                      {currentItem.expected_quantity}{' '}
                      {currentItem.expected_quantity === 1 ? 'UN' : 'UNIDADES'}
                    </span>
                  </div>
                )}

                {/* If already inspected in this session, show existing status */}
                {currentResult && (
                  <div className="absolute bottom-3 left-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs backdrop-blur-md shadow-lg ${
                        currentResult.status === 'found'
                          ? 'bg-emerald-500/90 text-slate-950'
                          : 'bg-rose-500/90 text-white'
                      }`}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      {currentResult.status === 'found'
                        ? 'Já conferido como ENCONTRADO'
                        : `Problema: ${currentResult.notes || currentResult.status}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Item Details Text */}
              <div className="p-5 sm:p-6 space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 block">
                  {isIndividual ? 'Item Individual' : 'Controle por Quantidade'}
                </span>

                <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  {currentItem.name}
                </h2>

                {/* Baseline physical condition badge and notes */}
                {(() => {
                  const conditionCfg = getConditionConfig(currentItem.condition_status);
                  return (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-black ${conditionCfg.badgeBg} ${conditionCfg.badgeBorder} ${conditionCfg.badgeText}`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${conditionCfg.dotColor}`} />
                          <span>Estado Físico Previsto: {conditionCfg.shortLabel.toUpperCase()}</span>
                        </div>
                        {currentItem.condition_notes && (
                          <span className="text-xs sm:text-sm font-bold text-slate-300 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                            📝 {currentItem.condition_notes}
                          </span>
                        )}
                      </div>

                      {currentItem.condition_status && currentItem.condition_status !== 'good' && (
                        <p className="text-xs text-amber-300 font-medium bg-amber-500/10 border border-amber-500/25 p-2.5 rounded-xl leading-snug">
                          ℹ️ <strong>Observação:</strong> Este item já possui desgaste prévio registrado no sistema. Se o item estiver no local conforme o esperado, confirme como <strong>ENCONTRADO</strong>.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {currentItem.description && (
                  <p className="text-sm sm:text-base font-bold text-slate-300 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 leading-relaxed">
                    💡 {currentItem.description}
                  </p>
                )}
              </div>
            </div>

            {/* Sequential Inspection Question & Actions Area */}
            <div className="space-y-3 pt-1">
              {/* Inspection Type & Question Step Header */}
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${currentInspectionConfig.badgeBg} ${currentInspectionConfig.badgeText} border ${currentInspectionConfig.badgeBorder}`}
                  >
                    <InspectionIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block truncate">
                      Roteiro de Conferência
                    </span>
                    <span className={`text-xs sm:text-sm font-black truncate block ${currentInspectionConfig.badgeText}`}>
                      {currentInspectionConfig.badgeLabel}
                    </span>
                  </div>
                </div>

                {/* 3 Step Pills */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {currentInspectionConfig.questions.map((q, idx) => {
                    const isDone = idx < questionIndex;
                    const isCurrent = idx === questionIndex;
                    return (
                      <div
                        key={q.id}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                          isDone
                            ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                            : isCurrent
                            ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-400/50 scale-105 shadow-md shadow-amber-400/20'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                        title={`Pergunta ${idx + 1}: ${q.question}`}
                      >
                        {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Active Question Box */}
              <div className="rounded-3xl bg-slate-900 border-2 border-slate-700/80 p-5 sm:p-6 space-y-3 shadow-2xl relative">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Pergunta {questionIndex + 1} de {currentInspectionConfig.questions.length}
                  </span>

                  {questionIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuestionIndex((prev) => Math.max(0, prev - 1))}
                      className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 py-1 px-2.5 rounded-lg bg-slate-800 border border-slate-700 transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Pergunta anterior</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-black text-white leading-snug">
                    {currentQuestion.question}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {currentInspectionConfig.description}
                  </p>
                </div>
              </div>

              {/* Giant Senior-Friendly Touch Buttons */}
              <div className="space-y-3 pt-1">
                {/* SIM Button */}
                <button
                  type="button"
                  onClick={handleAnswerSim}
                  disabled={isSubmitting}
                  className="w-full py-5 sm:py-6 rounded-3xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black text-2xl sm:text-3xl flex items-center justify-center gap-3.5 shadow-2xl shadow-emerald-500/30 transition-all border-b-4 border-emerald-600 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-9 h-9 stroke-[3]" />
                  <span>
                    {questionIndex < currentInspectionConfig.questions.length - 1
                      ? 'SIM (CONTINUAR)'
                      : 'SIM (APROVADO)'}
                  </span>
                </button>

                {/* NÃO Button */}
                <button
                  type="button"
                  onClick={handleAnswerNao}
                  disabled={isSubmitting}
                  className="w-full py-4 sm:py-5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 active:scale-98 text-rose-300 hover:text-white font-black text-base sm:text-lg flex items-center justify-center gap-2.5 border-2 border-rose-500/50 shadow-lg shadow-rose-950/30 transition-all"
                >
                  <AlertTriangle className="w-6 h-6 stroke-[2.5] text-rose-400" />
                  <span>NÃO (COM PROBLEMA / DEFEITO)</span>
                </button>

                {/* Secondary Actions */}
                <div className="pt-1 flex items-center justify-between gap-2.5">
                  {!isIndividual && (
                    <button
                      type="button"
                      onClick={() => setIsQuantityModalOpen(true)}
                      disabled={isSubmitting}
                      className="flex-1 py-3 px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-98 text-amber-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 border border-slate-800 transition-colors"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Falta Alguma Unidade</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleItemMissing}
                    disabled={isSubmitting}
                    className="flex-1 py-3 px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-98 text-slate-400 hover:text-rose-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 border border-slate-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>Item não está no cômodo</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

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
