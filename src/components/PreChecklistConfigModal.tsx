import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Edit2,
  Eye,
  Info,
  Package,
  Plus,
  Power,
  RotateCcw,
  Search,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import { getInventoryImageUrl } from '../lib/supabase';
import {
  createPreChecklistAction,
  deletePreChecklistAction,
  reorderPreChecklistActions,
  seedSuggestedPreChecklistActions,
  updatePreChecklistAction,
} from '../services/preChecklistService';
import { InventoryItem, Room } from '../types/inventory';
import {
  CreatePreChecklistActionInput,
  PreChecklistAction,
} from '../types/preChecklist';
import { ConfirmDialog } from './ConfirmDialog';

interface PreChecklistConfigModalProps {
  isOpen: boolean;
  actions?: PreChecklistAction[];
  inventoryItems?: InventoryItem[];
  rooms?: Room[];
  onClose: () => void;
  onActionsChanged?: () => Promise<void>;
  onActionsUpdated?: (updated: PreChecklistAction[]) => void;
  onToast?: (msg: string) => void;
}

export const PreChecklistConfigModal: React.FC<PreChecklistConfigModalProps> = ({
  isOpen,
  actions = [],
  inventoryItems = [],
  rooms = [],
  onClose,
  onActionsChanged,
  onActionsUpdated,
  onToast = () => {},
}) => {
  const safeActions = Array.isArray(actions) ? actions : [];
  const safeItems = Array.isArray(inventoryItems) ? inventoryItems : [];
  const safeRooms = Array.isArray(rooms) ? rooms : [];

  // Modal states
  const [editingAction, setEditingAction] = useState<PreChecklistAction | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingAction, setDeletingAction] = useState<PreChecklistAction | null>(null);
  const [isDeletingLoading, setIsDeletingLoading] = useState(false);
  const [isSeedingLoading, setIsSeedingLoading] = useState(false);
  const [photoZoomUrl, setPhotoZoomUrl] = useState<string | null>(null);
  const [photoZoomTitle, setPhotoZoomTitle] = useState<string>('');

  // Form states
  const [formData, setFormData] = useState<CreatePreChecklistActionInput>({
    title: '',
    instruction: '',
    inventory_item_id: null,
    is_active: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);

  // Map of inventory items
  const itemMap = useMemo(() => {
    return new Map(safeItems.map((it) => [it.id, it]));
  }, [safeItems]);

  // Android back button integration
  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerBackHandler('PreChecklistConfigModal', 50, () => {
      if (photoZoomUrl) {
        setPhotoZoomUrl(null);
        return true;
      }
      if (deletingAction) {
        setDeletingAction(null);
        return true;
      }
      if (isFormOpen) {
        setIsFormOpen(false);
        setEditingAction(null);
        return true;
      }
      onClose();
      return true;
    });

    return unregister;
  }, [isOpen, photoZoomUrl, deletingAction, isFormOpen, onClose]);

  // Open add form
  const handleOpenAddForm = () => {
    setEditingAction(null);
    setFormData({
      title: '',
      instruction: '',
      inventory_item_id: null,
      is_active: true,
    });
    setItemSearchQuery('');
    setIsItemDropdownOpen(false);
    setIsFormOpen(true);
  };

  // Open edit form
  const handleOpenEditForm = (action: PreChecklistAction) => {
    setEditingAction(action);
    setFormData({
      title: action.title,
      instruction: action.instruction,
      inventory_item_id: action.inventory_item_id,
      is_active: action.is_active,
    });
    setItemSearchQuery('');
    setIsItemDropdownOpen(false);
    setIsFormOpen(true);
  };

  const triggerRefresh = async () => {
    try {
      if (onActionsChanged) {
        await onActionsChanged();
      }
      if (onActionsUpdated) {
        const updated = await fetchPreChecklistActions(inventoryItems);
        onActionsUpdated(updated);
      }
    } catch {
      // Ignore refresh error
    }
  };

  // Save form (Create or Update)
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Informe o nome da ação.');
      return;
    }
    if (!formData.instruction.trim()) {
      alert('Informe as instruções para a ação.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingAction) {
        await updatePreChecklistAction(editingAction.id, formData, inventoryItems);
        onToast(`Ação "${formData.title}" atualizada com sucesso!`);
      } else {
        await createPreChecklistAction(formData, inventoryItems);
        onToast(`Ação "${formData.title}" criada com sucesso!`);
      }
      await triggerRefresh();
      setIsFormOpen(false);
      setEditingAction(null);
    } catch (err: any) {
      console.error('Erro ao salvar ação do pré-checklist:', err);
      alert('Erro ao salvar ação. Verifique sua conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete action
  const handleConfirmDelete = async () => {
    if (!deletingAction) return;
    setIsDeletingLoading(true);
    try {
      await deletePreChecklistAction(deletingAction.id);
      await triggerRefresh();
      onToast(`Ação "${deletingAction.title}" removida.`);
      setDeletingAction(null);
    } catch (err) {
      console.error('Erro ao excluir ação:', err);
      alert('Erro ao excluir ação.');
    } finally {
      setIsDeletingLoading(false);
    }
  };

  // Toggle active/inactive
  const handleToggleActive = async (action: PreChecklistAction) => {
    try {
      await updatePreChecklistAction(
        action.id,
        { is_active: !action.is_active },
        inventoryItems
      );
      await triggerRefresh();
      onToast(
        !action.is_active
          ? `Ação "${action.title}" ativada!`
          : `Ação "${action.title}" desativada!`
      );
    } catch (err) {
      console.error('Erro ao alternar status da ação:', err);
    }
  };

  // Reorder action up
  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const newActions = [...actions];
    const temp = newActions[index - 1];
    newActions[index - 1] = newActions[index];
    newActions[index] = temp;

    const orderedIds = newActions.map((a) => a.id);
    await reorderPreChecklistActions(orderedIds);
    await triggerRefresh();
  };

  // Reorder action down
  const handleMoveDown = async (index: number) => {
    if (index >= actions.length - 1) return;
    const newActions = [...actions];
    const temp = newActions[index + 1];
    newActions[index + 1] = newActions[index];
    newActions[index] = temp;

    const orderedIds = newActions.map((a) => a.id);
    await reorderPreChecklistActions(orderedIds);
    await triggerRefresh();
  };

  // Seed suggestions
  const handleSeedSuggestions = async () => {
    setIsSeedingLoading(true);
    try {
      await seedSuggestedPreChecklistActions(inventoryItems);
      await triggerRefresh();
      onToast('Ações sugeridas (Freezer, Bebedouro, Geladeira) geradas com sucesso!');
    } catch (err) {
      console.error('Erro ao gerar sugestões:', err);
      alert('Erro ao gerar sugestões.');
    } finally {
      setIsSeedingLoading(false);
    }
  };

  // Filter items for dropdown
  const filteredItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    if (!q) return inventoryItems.slice(0, 50);

    return inventoryItems
      .filter((it) => {
        const nameMatch = it.name.toLowerCase().includes(q);
        const codeMatch = (it.identification_code || '').toLowerCase().includes(q);
        const roomMatch = (it.room?.name || '').toLowerCase().includes(q);
        return nameMatch || codeMatch || roomMatch;
      })
      .slice(0, 50);
  }, [inventoryItems, itemSearchQuery]);

  // Selected item in form
  const selectedItemInForm = formData.inventory_item_id
    ? itemMap.get(formData.inventory_item_id) || null
    : null;

  const formItemImageUrl = selectedItemInForm
    ? getInventoryImageUrl(selectedItemInForm.image_path)
    : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-2xl flex flex-col overflow-hidden text-white"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Power className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white leading-tight">
                Configurar Pré-Checklist
              </h2>
              <p className="text-xs text-slate-400">
                Ações de preparação antes de iniciar a vistoria dos cômodos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Explanation Banner */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm flex items-start gap-2.5 leading-relaxed">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300 font-extrabold">Finalidade do Pré-Checklist:</strong>
              <p className="mt-0.5 text-slate-300 text-xs">
                Alguns equipamentos precisam ser ligados com antecedência para que comecem a funcionar (como freezers e geladeiras para gelar, bebedouros, etc.) antes da conferência real do cômodo.
              </p>
            </div>
          </div>

          {/* Top Actions Row: New Action & Suggestions Seed */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              Ações Cadastradas ({actions.length})
            </span>

            <div className="flex items-center gap-2">
              {actions.length === 0 && (
                <button
                  type="button"
                  disabled={isSeedingLoading}
                  onClick={handleSeedSuggestions}
                  className="px-3 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title="Gerar ações de exemplo (Freezer, Bebedouro, Geladeira)"
                >
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>{isSeedingLoading ? 'Gerando...' : 'Gerar Sugestões'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenAddForm}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md transition-all"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Nova Ação</span>
              </button>
            </div>
          </div>

          {/* Actions List */}
          {actions.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-3xl p-6 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
                <Power className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-white">
                Nenhuma ação de pré-checklist cadastrada
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Cadastre ações como "Ligar o freezer" ou clique em "Gerar Sugestões" para carregar os modelos padrão vinculados ao seu inventário.
              </p>
              <button
                type="button"
                onClick={handleSeedSuggestions}
                disabled={isSeedingLoading}
                className="mt-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center gap-2 shadow"
              >
                <Sparkles className="w-4 h-4" />
                <span>Gerar Sugestões (Freezer, Bebedouro, Geladeira)</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {actions.map((act, index) => {
                const item = act.inventory_item_id ? itemMap.get(act.inventory_item_id) : null;
                const itemImagePath = item?.image_path || (item as any)?.image_url;
                const imageUrl = getInventoryImageUrl(itemImagePath);
                const roomName = item?.room?.name || item?.assigned_room_name || act.room_name_snapshot;

                return (
                  <div
                    key={act.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 ${
                      act.is_active
                        ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-950/50 border-slate-800/60 opacity-60'
                    }`}
                  >
                    {/* Left: Order index & Thumbnail */}
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      {/* Order Controls */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveUp(index)}
                          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20"
                          title="Subir posição"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-black text-amber-400">
                          #{index + 1}
                        </span>
                        <button
                          type="button"
                          disabled={index === actions.length - 1}
                          onClick={() => handleMoveDown(index)}
                          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20"
                          title="Descer posição"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Equipment Image Thumbnail */}
                      <div
                        className={`w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative ${
                          imageUrl ? 'cursor-pointer hover:border-emerald-500/50' : ''
                        }`}
                        onClick={() => {
                          if (imageUrl) {
                            setPhotoZoomUrl(imageUrl);
                            setPhotoZoomTitle(item?.name || act.title);
                          }
                        }}
                        title={imageUrl ? 'Toque para ampliar' : undefined}
                      >
                        {imageUrl ? (
                          <>
                            <img
                              src={imageUrl}
                              alt=""
                              aria-hidden="true"
                              className="absolute inset-0 w-full h-full object-cover blur-sm opacity-20 scale-110"
                            />
                            <img
                              src={imageUrl}
                              alt={item?.name || act.title}
                              className="w-full h-full object-cover relative z-10"
                            />
                            <div className="absolute bottom-0.5 right-0.5 z-20 p-0.5 rounded bg-black/70 text-white">
                              <Eye className="w-2.5 h-2.5 text-emerald-400" />
                            </div>
                          </>
                        ) : (
                          <Package className="w-7 h-7 text-slate-700" />
                        )}
                      </div>

                      {/* Info & Badges */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm sm:text-base font-black text-white leading-snug">
                            {act.title}
                          </h4>
                          {act.is_active ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Ativa
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
                              Inativa
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
                          {act.instruction}
                        </p>

                        {/* Associated Item Badge */}
                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          {item ? (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                              <Package className="w-3 h-3 text-emerald-400 shrink-0" />
                              <strong className="text-white truncate max-w-[140px]">
                                {item.name}
                              </strong>
                              {item.identification_code && (
                                <span className="text-[10px] text-slate-400">
                                  #{item.identification_code}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 text-[10px] font-bold">
                              Sem item vinculado
                            </span>
                          )}

                          {roomName && (
                            <span className="px-2 py-0.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-[10px] font-bold text-teal-300">
                              📍 {roomName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions (Toggle, Edit, Delete) */}
                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(act)}
                        className={`p-2 rounded-xl border transition-all ${
                          act.is_active
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                        title={act.is_active ? 'Desativar ação' : 'Ativar ação'}
                      >
                        {act.is_active ? (
                          <ToggleRight className="w-5 h-5" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditForm(act)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                        title="Editar ação"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingAction(act)}
                        className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 transition-all border border-rose-500/20"
                        title="Excluir ação"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-semibold">
            {actions.filter((a) => a.is_active).length} ação(ões) ativas
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* ADD / EDIT ACTION FORM MODAL */}
      {/* ===================================================================== */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md animate-fadeIn">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-emerald-500/40 p-5 space-y-4 shadow-2xl text-white max-h-[95vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Power className="w-5 h-5 stroke-[2.5]" />
                </div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  {editingAction ? 'Editar Ação de Pré-Checklist' : 'Nova Ação de Pré-Checklist'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingAction(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              {/* Action Name */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                  Nome da Ação <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ligar o freezer"
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
                  Instrução para quem vistoria <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ex: Ligue o freezer para que ele tenha tempo de começar a gelar antes da inspeção."
                  value={formData.instruction}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, instruction: e.target.value }))
                  }
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm font-semibold focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
                />
              </div>

              {/* Associated Item Selection with Auto-Preview Image */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-300">
                  Equipamento / Item do Inventário Associado
                </label>

                {/* Selected Item Card Preview */}
                {selectedItemInForm ? (
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                        {formItemImageUrl ? (
                          <img
                            src={formItemImageUrl}
                            alt={selectedItemInForm.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-6 h-6 text-slate-700" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-white truncate">
                          {selectedItemInForm.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {selectedItemInForm.identification_code && (
                            <span className="text-[11px] font-bold text-slate-400">
                              #{selectedItemInForm.identification_code}
                            </span>
                          )}
                          {(selectedItemInForm.room?.name || selectedItemInForm.assigned_room_name) && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30">
                              📍 {selectedItemInForm.room?.name || selectedItemInForm.assigned_room_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, inventory_item_id: null }))
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition-colors text-xs font-bold shrink-0"
                      title="Desvincular item"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-950/70 border border-dashed border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                    <span>Nenhum item vinculado (opcional)</span>
                    <button
                      type="button"
                      onClick={() => setIsItemDropdownOpen((v) => !v)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                    >
                      Selecionar Item
                    </button>
                  </div>
                )}

                {/* Searchable Dropdown for Selecting Item */}
                {(!selectedItemInForm || isItemDropdownOpen) && (
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Buscar item pelo nome, código ou cômodo..."
                        value={itemSearchQuery}
                        onChange={(e) => setItemSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {filteredItems.map((it) => {
                        const img = getInventoryImageUrl(it.image_path);
                        const isSelected = formData.inventory_item_id === it.id;

                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                inventory_item_id: it.id,
                              }));
                              setIsItemDropdownOpen(false);
                            }}
                            className={`w-full p-2 rounded-xl text-left flex items-center justify-between gap-2 transition-all ${
                              isSelected
                                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                                : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800/80'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                {img ? (
                                  <img src={img} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-4 h-4 text-slate-600" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="block text-xs font-bold text-white truncate">
                                  {it.name}
                                </span>
                                <span className="block text-[10px] text-slate-400 truncate">
                                  #{it.identification_code || 's/cód'} •{' '}
                                  {it.room?.name || 'Sem cômodo'}
                                </span>
                              </div>
                            </div>

                            {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <span className="block text-xs font-black text-white">
                    Ação Ativa no Pré-Checklist
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    Aparecerá para quem for iniciar a vistoria
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, is_active: !prev.is_active }))
                  }
                  className={`p-2 rounded-xl border transition-all ${
                    formData.is_active
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {formData.is_active ? (
                    <ToggleRight className="w-6 h-6" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                </button>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingAction(null);
                  }}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Ação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingAction)}
        title="Remover Ação do Pré-Checklist"
        description={
          deletingAction
            ? `Tem certeza que deseja remover a ação "${deletingAction.title}"? Ela não será mais exibida nas próximas vistorias.`
            : ''
        }
        confirmLabel="Sim, Remover"
        isLoading={isDeletingLoading}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingAction(null)}
      />

      {/* Image Lightbox Preview */}
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
