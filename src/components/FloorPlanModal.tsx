import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Compass,
  Edit2,
  FolderTree,
  Home,
  Layers,
  Loader2,
  Maximize2,
  Plus,
  RotateCcw,
  Save,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  createRoom,
  deleteRoom,
  fetchFloorPlanShapes,
  fetchRoomCategories,
  fetchRooms,
  saveFloorPlanShapes,
  updateRoom,
} from '../services/inventoryService';
import { FloorPlanShape, FloorPlanShapeType, InventoryItem, Room, RoomCategory } from '../types/inventory';
import { FloorPlanView } from './FloorPlanView';

export interface FloorPlanModalProps {
  isOpen: boolean;
  rooms: Room[];
  roomCategories: RoomCategory[];
  items: InventoryItem[];
  onClose: () => void;
  onRoomsChanged: () => Promise<void>;
  onOpenRoomCategories: () => void;
  onSelectRoomFilter?: (roomId: string) => void;
}

export const FloorPlanModal: React.FC<FloorPlanModalProps> = ({
  isOpen,
  rooms,
  roomCategories,
  items,
  onClose,
  onRoomsChanged,
  onOpenRoomCategories,
  onSelectRoomFilter,
}) => {
  const [shapes, setShapes] = useState<FloorPlanShape[]>([]);
  const [initialShapesJson, setInitialShapesJson] = useState<string>('[]');
  const [isEditorMode, setIsEditorMode] = useState<boolean>(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Edit Room modal state
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomCategory, setEditRoomCategory] = useState<string>('');
  const [editRoomParentId, setEditRoomParentId] = useState<string>('');
  const [isSubmittingEditRoom, setIsSubmittingEditRoom] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load existing shapes when modal opens
  useEffect(() => {
    if (!isOpen) return;
    loadShapes();
  }, [isOpen]);

  const loadShapes = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const loaded = await fetchFloorPlanShapes();
      setShapes(loaded);
      setInitialShapesJson(JSON.stringify(loaded));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao carregar a planta.');
    } finally {
      setIsLoading(false);
    }
  };

  const isDirty = initialShapesJson !== JSON.stringify(shapes);

  const handleSaveFloorPlan = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const saved = await saveFloorPlanShapes(shapes);
      setShapes(saved);
      setInitialShapesJson(JSON.stringify(saved));
      setSuccessMsg('Planta baixa salva com sucesso!');
      await onRoomsChanged();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar a planta baixa.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToSaved = () => {
    try {
      const restored = JSON.parse(initialShapesJson);
      setShapes(restored);
      setSuccessMsg('Alterações desfeitas para o último estado salvo.');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch {
      // ignore
    }
  };

  const handleCreateRoomWithShape = async (
    name: string,
    categoryId?: string | null,
    parentRoomId?: string | null,
    shapeType: FloorPlanShapeType = 'rectangle',
    customShapeData?: { x: number; y: number; width: number; height: number; points?: any[] }
  ): Promise<Room | null> => {
    try {
      const newRoom = await createRoom(name, null, 'individual', categoryId || null);

      // Create new shape for this room
      const newShape: FloorPlanShape = {
        id: `shape-${Date.now()}`,
        room_id: newRoom.id,
        shape_type: shapeType,
        x: customShapeData ? customShapeData.x : 80,
        y: customShapeData ? customShapeData.y : 80,
        width: customShapeData ? customShapeData.width : (shapeType === 'square' ? 140 : 180),
        height: customShapeData ? customShapeData.height : (shapeType === 'square' ? 140 : 130),
        points: customShapeData?.points || null,
        parent_room_id: parentRoomId || null,
        z_index: parentRoomId ? 2 : 1,
      };

      const updated = [...shapes, newShape];
      setShapes(updated);
      await saveFloorPlanShapes(updated);
      setInitialShapesJson(JSON.stringify(updated));

      await onRoomsChanged();
      setSuccessMsg(`Cômodo "${name}" criado e adicionado à planta!`);
      setTimeout(() => setSuccessMsg(null), 3000);
      return newRoom;
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar cômodo na planta.');
      return null;
    }
  };

  const handleStartEditRoom = (room: Room) => {
    setEditingRoom(room);
    setEditRoomName(room.name);
    setEditRoomCategory(room.room_category_id || '');
    const currentShape = shapes.find((s) => s.room_id === room.id);
    setEditRoomParentId(currentShape?.parent_room_id || '');
  };

  const handleSaveEditRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom || !editRoomName.trim()) return;

    setIsSubmittingEditRoom(true);
    try {
      await updateRoom(
        editingRoom.id,
        editRoomName.trim(),
        editingRoom.suite_id,
        editingRoom.room_type,
        editRoomCategory || null
      );

      // Update shape's parent_room_id if modified
      const updatedShapes = shapes.map((s) =>
        s.room_id === editingRoom.id
          ? {
              ...s,
              parent_room_id: editRoomParentId || null,
              z_index: editRoomParentId ? 2 : 1,
            }
          : s
      );
      setShapes(updatedShapes);
      await saveFloorPlanShapes(updatedShapes);
      setInitialShapesJson(JSON.stringify(updatedShapes));

      await onRoomsChanged();
      setSuccessMsg(`Cômodo "${editRoomName.trim()}" atualizado com sucesso!`);
      setEditingRoom(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao atualizar cômodo.');
    } finally {
      setIsSubmittingEditRoom(false);
    }
  };

  const handleDeleteRoom = async (room: Room) => {
    // Check if room has items
    const hasItems = items.some(
      (it) => it.room_id === room.id || it.room_assignments?.some((a) => a.room_id === room.id)
    );

    if (hasItems) {
      setErrorMsg(
        `O cômodo "${room.name}" possui itens vinculados. Reatribua os itens antes de removê-lo.`
      );
      return;
    }

    if (!window.confirm(`Deseja realmente excluir o cômodo "${room.name}" e sua forma na planta?`)) {
      return;
    }

    try {
      await deleteRoom(room.id);
      const updatedShapes = shapes.filter((s) => s.room_id !== room.id);
      setShapes(updatedShapes);
      await saveFloorPlanShapes(updatedShapes);
      setInitialShapesJson(JSON.stringify(updatedShapes));
      await onRoomsChanged();
      setSuccessMsg(`Cômodo "${room.name}" excluído.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir cômodo.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-7xl h-[92vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-800 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 sm:gap-3 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">Planta da Chácara</h2>
                {isDirty && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider animate-pulse">
                    Não Salvo
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Organização espacial e visual dos cômodos e categorias da propriedade
              </p>
            </div>
          </div>

          {/* Action buttons in header */}
          <div className="flex items-center gap-2">
            {/* Toggle Mode: Visualização vs Edição */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsEditorMode(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  !isEditorMode
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Navegar</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditorMode(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isEditorMode
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar Layout</span>
              </button>
            </div>

            {/* Room Categories Shortcut */}
            <button
              type="button"
              onClick={onOpenRoomCategories}
              className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-purple-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
              title="Gerenciar Categorias de Cômodos"
            >
              <Tag className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Categorias de Cômodos</span>
            </button>

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSaveFloorPlan}
              disabled={isSaving || !isDirty}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 stroke-[2.5]" />
                  <span>Salvar Planta</span>
                </>
              )}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                if (isDirty) {
                  if (!window.confirm('Existem alterações não salvas na planta. Deseja realmente sair?')) {
                    return;
                  }
                }
                onClose();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {errorMsg && (
          <div className="px-5 py-2.5 bg-rose-500/15 border-b border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button type="button" onClick={() => setErrorMsg(null)} className="p-1 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="px-5 py-2.5 bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button type="button" onClick={() => setSuccessMsg(null)} className="p-1 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Main Area: Interactive Floor Plan */}
        <div className="flex-1 w-full relative overflow-hidden bg-slate-950">
          <FloorPlanView
            rooms={rooms}
            roomCategories={roomCategories}
            items={items}
            shapes={shapes}
            mode={isEditorMode ? 'editor' : 'selector'}
            selectedRoomId={selectedRoomId}
            selectedCategoryId={selectedCategoryId}
            onSelectRoom={(r) => {
              setSelectedRoomId(r.id);
              setSelectedCategoryId(null);
            }}
            onSelectCategory={(cat) => {
              setSelectedCategoryId(cat ? cat.id : null);
              setSelectedRoomId(null);
            }}
            onShapesChange={(newShapes) => setShapes(newShapes)}
            onCreateRoomWithShape={handleCreateRoomWithShape}
            onEditRoom={handleStartEditRoom}
            onDeleteRoom={handleDeleteRoom}
            className="w-full h-full"
          />
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              Total de cômodos na planta:{' '}
              <strong className="text-white font-extrabold">{rooms.length}</strong>
            </span>
            <span>•</span>
            <span>
              Categorias cadastradas:{' '}
              <strong className="text-purple-400 font-extrabold">{roomCategories.length}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isDirty && (
              <button
                type="button"
                onClick={handleResetToSaved}
                className="text-slate-400 hover:text-amber-300 font-bold flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Desfazer alterações</span>
              </button>
            )}

            {selectedRoomId && onSelectRoomFilter && (
              <button
                type="button"
                onClick={() => {
                  onSelectRoomFilter(selectedRoomId);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 font-bold transition-colors"
              >
                Filtrar inventário por este cômodo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Room Dialog */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditRoom}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-400" />
                Editar Cômodo
              </h3>
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Nome do Cômodo</label>
                <input
                  type="text"
                  value={editRoomName}
                  onChange={(e) => setEditRoomName(e.target.value)}
                  placeholder="Nome do cômodo"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Categoria</label>
                <select
                  value={editRoomCategory}
                  onChange={(e) => setEditRoomCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Sem Categoria (Geral)</option>
                  {roomCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Espaço Pai / Suíte (Opcional)</label>
                <select
                  value={editRoomParentId}
                  onChange={(e) => setEditRoomParentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Nenhum (Cômodo Independente)</option>
                  {rooms
                    .filter((r) => r.id !== editingRoom.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Dentro de: {r.name}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Selecione caso este ambiente fique fisicamente dentro de outro (ex: Banheiro da Suíte).
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmittingEditRoom || !editRoomName.trim()}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs shadow-lg transition-all"
              >
                {isSubmittingEditRoom ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
