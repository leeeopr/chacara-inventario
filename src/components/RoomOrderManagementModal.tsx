import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  Home,
  Loader2,
  Package,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { updateRoomsInspectionOrder } from '../services/inventoryService';
import { InventoryItem, Room } from '../types/inventory';

interface RoomOrderManagementModalProps {
  isOpen: boolean;
  rooms: Room[];
  items: InventoryItem[];
  onClose: () => void;
  onOrderSaved: (updatedRooms: Room[]) => void;
}

export const RoomOrderManagementModal: React.FC<RoomOrderManagementModalProps> = ({
  isOpen,
  rooms,
  items,
  onClose,
  onOrderSaved,
}) => {
  // Ordered room list in local draft state
  const [orderedRooms, setOrderedRooms] = useState<Room[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Drag and Drop states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Initialize draft when modal opens or rooms prop updates
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Sort rooms deterministically by inspection_order
    const sorted = [...rooms].sort((a, b) => {
      const orderA = a.inspection_order ?? 999999;
      const orderB = b.inspection_order ?? 999999;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    setOrderedRooms(sorted);
  }, [isOpen, rooms]);

  // Compute items count per room for informational display
  const itemsCountByRoom = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.room_assignments && item.room_assignments.length > 0) {
        for (const a of item.room_assignments) {
          if (a.room_id) {
            map.set(a.room_id, (map.get(a.room_id) || 0) + 1);
          }
        }
      } else if (item.room_id) {
        map.set(item.room_id, (map.get(item.room_id) || 0) + 1);
      }
    }
    return map;
  }, [items]);

  // Check if draft has unsaved changes compared to incoming rooms
  const hasUnsavedChanges = useMemo(() => {
    if (orderedRooms.length !== rooms.length) return false;
    for (let i = 0; i < orderedRooms.length; i++) {
      if (orderedRooms[i].id !== rooms[i]?.id) {
        return true;
      }
    }
    return false;
  }, [orderedRooms, rooms]);

  if (!isOpen) return null;

  // Move a room up or down by 1 position
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedRooms.length) return;

    setOrderedRooms((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
    setSuccessMsg(null);
  };

  // Move room directly to top (1st place) or bottom (last place)
  const handleMoveExtreme = (index: number, position: 'top' | 'bottom') => {
    if (position === 'top' && index === 0) return;
    if (position === 'bottom' && index === orderedRooms.length - 1) return;

    setOrderedRooms((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      if (position === 'top') {
        copy.unshift(moved);
      } else {
        copy.push(moved);
      }
      return copy;
    });
    setSuccessMsg(null);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent or data drag representation
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    setOrderedRooms((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(draggedIndex, 1);
      copy.splice(dropIndex, 0, moved);
      return copy;
    });

    setDraggedIndex(null);
    setDragOverIndex(null);
    setSuccessMsg(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Restore currently saved order
  const handleRestore = () => {
    const sorted = [...rooms].sort((a, b) => {
      const orderA = a.inspection_order ?? 999999;
      const orderB = b.inspection_order ?? 999999;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    setOrderedRooms(sorted);
    setErrorMsg(null);
    setSuccessMsg('Ordem restaurada para a última configuração salva.');
  };

  // Close modal safely
  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (
        !window.confirm(
          'Existem alterações de ordem não salvas. Deseja realmente sair sem salvar?'
        )
      ) {
        return;
      }
    }
    onClose();
  };

  // Persist updated order
  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const orderedIds = orderedRooms.map((r) => r.id);
      const updated = await updateRoomsInspectionOrder(orderedIds);
      setSuccessMsg('Ordem dos cômodos salva com sucesso!');
      onOrderSaved(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar a nova ordem dos cômodos.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] animate-fadeIn"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <ArrowUpDown className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-white truncate flex items-center gap-2">
                <span>Ordem dos Cômodos</span>
                {hasUnsavedChanges && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-black uppercase tracking-wider border border-amber-400/30 shrink-0">
                    Não Salvo
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Defina a sequência exata de vistoria percorrida na chácara
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Guidance Banner */}
        <div className="px-5 py-3 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-300 leading-snug">
            💡 <strong>Dica:</strong> Arraste e solte os cartões ou utilize os botões{' '}
            <span className="inline-flex items-center font-bold text-amber-400">▲</span> e{' '}
            <span className="inline-flex items-center font-bold text-amber-400">▼</span> para organizar a sequência.
          </div>
          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={handleRestore}
              className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Desfazer alterações</span>
            </button>
          )}
        </div>

        {/* Scrollable Body: Room Cards */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5 flex-1">
          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {orderedRooms.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Nenhum cômodo cadastrado na chácara ainda.
            </div>
          ) : (
            orderedRooms.map((room, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === orderedRooms.length - 1;
              const isDragged = draggedIndex === idx;
              const isOver = dragOverIndex === idx && draggedIndex !== idx;
              const itemCount = itemsCountByRoom.get(room.id) || 0;

              return (
                <div
                  key={room.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all select-none flex items-center justify-between gap-3 ${
                    isOver
                      ? 'border-amber-400 bg-amber-400/10 scale-[1.01] shadow-lg shadow-amber-500/10'
                      : isDragged
                      ? 'opacity-40 border-slate-700 bg-slate-950'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Left: Drag Handle + Order Number + Room Name & Tags */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Drag Handle Indicator */}
                    <div
                      title="Clique e arraste para reordenar"
                      className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition-colors shrink-0"
                    >
                      <GripVertical className="w-5 h-5" />
                    </div>

                    {/* Sequential Position Number */}
                    <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-sm text-amber-400 shrink-0">
                      {idx + 1}
                    </div>

                    {/* Room Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm sm:text-base text-white truncate">
                          {room.name}
                        </span>

                        {room.suite?.name && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-extrabold shrink-0">
                            <Sparkles className="w-3 h-3" />
                            <span>{room.suite.name}</span>
                          </span>
                        )}

                        {room.room_type === 'suite_bathroom' && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-bold shrink-0">
                            Banheiro
                          </span>
                        )}
                        {room.room_type === 'suite_bedroom' && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-bold shrink-0">
                            Quarto
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3 text-emerald-400" />
                          <span>
                            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                          </span>
                        </span>
                        {isFirst && (
                          <span className="text-emerald-400 font-bold">
                            • 1º Cômodo da Vistoria
                          </span>
                        )}
                        {isLast && (
                          <span className="text-slate-400 font-bold">
                            • Último Cômodo da Vistoria
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Touch Reordering Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveExtreme(idx, 'top')}
                      disabled={isFirst || isSaving}
                      title="Mover para o Topo (1º)"
                      className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-900 disabled:hover:text-slate-400 border border-slate-800 transition-colors"
                    >
                      <ChevronsUp className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={isFirst || isSaving}
                      title="Subir uma posição"
                      className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 disabled:opacity-30 disabled:hover:bg-slate-900 disabled:hover:text-slate-300 border border-slate-800 transition-colors font-bold"
                    >
                      <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={isLast || isSaving}
                      title="Descer uma posição"
                      className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 disabled:opacity-30 disabled:hover:bg-slate-900 disabled:hover:text-slate-300 border border-slate-800 transition-colors font-bold"
                    >
                      <ArrowDown className="w-4 h-4 stroke-[2.5]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMoveExtreme(idx, 'bottom')}
                      disabled={isLast || isSaving}
                      title="Mover para o Fim (Último)"
                      className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-900 disabled:hover:text-slate-400 border border-slate-800 transition-colors"
                    >
                      <ChevronsDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors"
            >
              Fechar
            </button>

            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleRestore}
                disabled={isSaving}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs sm:text-sm font-medium transition-colors"
              >
                Desfazer
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-40 transition-all"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando Ordem...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Salvar Ordem dos Cômodos</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
