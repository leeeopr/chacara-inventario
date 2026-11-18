import React, { useState } from 'react';
import {
  AlertCircle,
  Bath,
  BedDouble,
  Check,
  CheckCircle2,
  Edit2,
  FolderTree,
  Home,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Trees,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  assignMultipleRoomsToCategory,
  assignRoomToCategory,
  createRoomCategory,
  deleteRoomCategory,
  updateRoomCategory,
} from '../services/inventoryService';
import { InventoryItem, Room, RoomCategory } from '../types/inventory';

export interface RoomCategoryManagementModalProps {
  isOpen: boolean;
  roomCategories: RoomCategory[];
  rooms: Room[];
  items: InventoryItem[];
  onClose: () => void;
  onCategoriesChanged: () => Promise<void>;
}

const PRESET_COLORS = [
  '#8b5cf6', // Purple (Quartos)
  '#06b6d4', // Cyan (Banheiros)
  '#3b82f6', // Blue (Áreas Sociais)
  '#f59e0b', // Amber (Área Gourmet)
  '#10b981', // Emerald (Áreas Externas)
  '#ec4899', // Pink
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

export const RoomCategoryManagementModal: React.FC<RoomCategoryManagementModalProps> = ({
  isOpen,
  roomCategories,
  rooms,
  items,
  onClose,
  onCategoriesChanged,
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#8b5cf6');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCatName.trim();
    if (!cleanName) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      await createRoomCategory({
        name: cleanName,
        color: newCatColor,
        display_order: roomCategories.length + 1,
      });
      setNewCatName('');
      setSuccessMsg(`Categoria de cômodos "${cleanName}" criada com sucesso!`);
      await onCategoriesChanged();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar categoria de cômodos.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const clean = editName.trim();
    if (!clean) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      await updateRoomCategory(id, {
        name: clean,
        color: editColor,
      });
      setEditingCatId(null);
      setSuccessMsg('Categoria atualizada com sucesso!');
      await onCategoriesChanged();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao atualizar categoria.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async (cat: RoomCategory) => {
    const countRooms = rooms.filter((r) => r.room_category_id === cat.id).length;
    const confirmText = countRooms > 0
      ? `A categoria "${cat.name}" possui ${countRooms} cômodo(s) associado(s). Ao excluí-la, os cômodos ficarão sem categoria (não serão excluídos). Deseja prosseguir?`
      : `Deseja excluir a categoria de cômodos "${cat.name}"?`;

    if (!window.confirm(confirmText)) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      await deleteRoomCategory(cat.id);
      if (selectedCatId === cat.id) setSelectedCatId(null);
      setSuccessMsg(`Categoria "${cat.name}" excluída.`);
      await onCategoriesChanged();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir categoria.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRoomCategory = async (roomId: string, currentCatId: string | null, targetCatId: string) => {
    const newCat = currentCatId === targetCatId ? null : targetCatId;
    try {
      await assignRoomToCategory(roomId, newCat);
      await onCategoriesChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao alterar categoria do cômodo.');
    }
  };

  // Currently focused category for viewing rooms
  const activeCat = roomCategories.find((c) => c.id === selectedCatId) || roomCategories[0];
  const roomsInActiveCat = activeCat ? rooms.filter((r) => r.room_category_id === activeCat.id) : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Categorias de Cômodos</h2>
              <p className="text-xs text-slate-400">
                Agrupe os espaços físicos (ex: Quartos, Banheiros, Áreas Sociais, Área Gourmet)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Banners */}
        {errorMsg && (
          <div className="px-6 py-2.5 bg-rose-500/15 border-b border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-between">
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
          <div className="px-6 py-2.5 bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button type="button" onClick={() => setSuccessMsg(null)} className="p-1 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Create New Category Form */}
          <form
            onSubmit={handleCreateCategory}
            className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-3"
          >
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-400" />
              Nova Categoria de Cômodos
            </span>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Ex: Quartos, Banheiros, Áreas Sociais, Área Gourmet..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
              />

              {/* Color Selector */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-900 rounded-xl border border-slate-800">
                {PRESET_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setNewCatColor(col)}
                    className={`w-6 h-6 rounded-lg transition-transform ${
                      newCatColor === col ? 'scale-110 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={isLoading || !newCatName.trim()}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-black text-xs shadow-md transition-all shrink-0"
              >
                Cadastrar Categoria
              </button>
            </div>
          </form>

          {/* Categories Grid and Room Associations */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 cols: Categories List */}
            <div className="lg:col-span-5 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Categorias Cadastradas ({roomCategories.length})
              </span>

              {roomCategories.map((cat) => {
                const count = rooms.filter((r) => r.room_category_id === cat.id).length;
                const isSelected = activeCat?.id === cat.id;

                if (editingCatId === cat.id) {
                  return (
                    <div
                      key={cat.id}
                      className="p-3 rounded-2xl bg-slate-950 border border-purple-500/50 space-y-2"
                    >
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                        autoFocus
                      />
                      <div className="flex items-center gap-1">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-5 h-5 rounded-md ${
                              editColor === c ? 'ring-2 ring-white scale-110' : 'opacity-60'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingCatId(null)}
                          className="px-2.5 py-1 text-slate-400 hover:text-white text-xs font-bold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(cat.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 text-xs font-black"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCatId(cat.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-slate-950 border-purple-500 shadow-md ring-1 ring-purple-500/30'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-lg shrink-0 shadow-sm"
                        style={{ backgroundColor: cat.color }}
                      />
                      <div className="min-w-0">
                        <h4 className="text-sm font-extrabold text-white truncate">{cat.name}</h4>
                        <span className="text-[11px] text-slate-400">
                          {count} cômodo{count !== 1 ? 's' : ''} associado{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCatId(cat.id);
                          setEditName(cat.name);
                          setEditColor(cat.color);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                        title="Editar nome ou cor"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategory(cat);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                        title="Excluir categoria"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right 7 cols: Rooms Assignment to Active Category */}
            <div className="lg:col-span-7 space-y-3">
              {activeCat ? (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-xs font-bold text-slate-400">Cômodos na categoria</span>
                      <h3
                        className="text-base font-extrabold flex items-center gap-2"
                        style={{ color: activeCat.color }}
                      >
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ backgroundColor: activeCat.color }}
                        />
                        {activeCat.name}
                      </h3>
                    </div>
                    <span className="text-xs text-slate-400 font-semibold">
                      Clique no cômodo para adicionar ou remover desta categoria
                    </span>
                  </div>

                  {/* Room checkboxes / toggle chips */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[460px] overflow-y-auto pr-1">
                    {rooms.map((r) => {
                      const isAssigned = r.room_category_id === activeCat.id;
                      const hasOtherCat = r.room_category_id && r.room_category_id !== activeCat.id;
                      const otherCat = hasOtherCat
                        ? roomCategories.find((c) => c.id === r.room_category_id)
                        : null;

                      return (
                        <div
                          key={r.id}
                          onClick={() => handleToggleRoomCategory(r.id, r.room_category_id || null, activeCat.id)}
                          className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            isAssigned
                              ? 'bg-purple-950/40 border-purple-500/60 text-white shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="block truncate">{r.name}</span>
                            {otherCat && (
                              <span
                                className="text-[10px] font-semibold flex items-center gap-1 mt-0.5"
                                style={{ color: otherCat.color }}
                              >
                                Em: {otherCat.name}
                              </span>
                            )}
                          </div>

                          <div
                            className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 ${
                              isAssigned
                                ? 'bg-purple-600 border-purple-500 text-white'
                                : 'border-slate-700 bg-slate-950'
                            }`}
                          >
                            {isAssigned && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Nenhuma categoria selecionada.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
