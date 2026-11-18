import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Edit3,
  Filter,
  Loader2,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  createCategory,
  deleteCategory,
  seedSuggestedCategories,
  unlinkItemsAndDeleteCategory,
  updateCategory,
} from '../services/inventoryService';
import { InventoryCategory, InventoryItem } from '../types/inventory';

interface CategoryManagementModalProps {
  isOpen: boolean;
  categories: InventoryCategory[];
  items: InventoryItem[];
  onClose: () => void;
  onCategoriesChanged: () => Promise<void>;
  onSelectCategoryFilter: (categoryId: string) => void;
}

export const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({
  isOpen,
  categories,
  items,
  onClose,
  onCategoriesChanged,
  onSelectCategoryFilter,
}) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<InventoryCategory | null>(
    null
  );
  const [replacementCategoryId, setReplacementCategoryId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const countByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      if (item.category_id) {
        map[item.category_id] = (map[item.category_id] || 0) + 1;
      }
    }
    return map;
  }, [items]);

  if (!isOpen) return null;

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await createCategory(newCategoryName);
      setNewCategoryName('');
      await onCategoriesChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar categoria.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEdit = async (categoryId: string) => {
    if (!editingName.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await updateCategory(categoryId, editingName);
      setEditingCategoryId(null);
      setEditingName('');
      await onCategoriesChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao atualizar categoria.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteCategory) return;
    const usedCount = countByCategory[confirmDeleteCategory.id] || 0;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (usedCount === 0) {
        await deleteCategory(confirmDeleteCategory.id);
      } else {
        await unlinkItemsAndDeleteCategory(
          confirmDeleteCategory.id,
          replacementCategoryId || null
        );
      }
      setConfirmDeleteCategory(null);
      setReplacementCategoryId('');
      await onCategoriesChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir categoria.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedCategories = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await seedSuggestedCategories(categories);
      await onCategoriesChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar categorias sugeridas.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">Gerenciar Categorias</h2>
              <p className="text-xs text-slate-400">
                Organize os itens por grupo (Utensílios, Eletrodomésticos, Enxoval, Móveis...)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Add New Category Form */}
          <form onSubmit={handleAddCategory} className="flex items-center gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Nova categoria (ex: Utensílios de Cozinha, Eletrodomésticos...)"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-500 focus:outline-none text-sm text-white placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={isLoading || !newCategoryName.trim()}
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-black text-sm flex items-center gap-1.5 shrink-0 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar</span>
            </button>
          </form>

          {/* Delete Confirmation / Unlink Dialog */}
          {confirmDeleteCategory && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-rose-500/30 space-y-3">
              {(countByCategory[confirmDeleteCategory.id] || 0) === 0 ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs text-slate-200">
                    Confirmar exclusão da categoria sem uso{' '}
                    <strong className="text-white">"{confirmDeleteCategory.name}"</strong>?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteCategory(null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                    >
                      Excluir Categoria
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-amber-300 font-semibold leading-relaxed">
                    A categoria "{confirmDeleteCategory.name}" possui{' '}
                    <strong>{countByCategory[confirmDeleteCategory.id]} item(ns)</strong>{' '}
                    vinculado(s). Categorias em uso não são apagadas acidentalmente. Se desejar
                    excluí-la, escolha o destino dos itens:
                  </p>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <select
                      value={replacementCategoryId}
                      onChange={(e) => setReplacementCategoryId(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                    >
                      <option value="">Deixar itens "Sem categoria"</option>
                      {categories
                        .filter((c) => c.id !== confirmDeleteCategory.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            Mover itens para: {c.name}
                          </option>
                        ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCategory(null)}
                        className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDelete}
                        disabled={isLoading}
                        className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                      >
                        Desvincular e Excluir
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Categories List */}
          {categories.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-800 rounded-2xl p-6">
              <Tag className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-300">Nenhuma categoria cadastrada</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Crie suas categorias personalizadas ou adicione as categorias recomendadas.
              </p>
              <button
                type="button"
                onClick={handleSeedCategories}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-sky-500/30 text-xs font-bold inline-flex items-center gap-2 transition-colors"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Criar Categorias Sugeridas (Cozinha, Eletros, Enxoval...)</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>{categories.length} categoria(s) registrada(s)</span>
                <button
                  type="button"
                  onClick={handleSeedCategories}
                  disabled={isLoading}
                  className="text-sky-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Completar categorias sugeridas</span>
                </button>
              </div>

              {categories.map((cat) => {
                const usedCount = countByCategory[cat.id] || 0;
                const isEditingThis = editingCategoryId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-between gap-3"
                  >
                    {isEditingThis ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-sky-500 text-sm text-white focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(cat.id)}
                          disabled={isLoading}
                          className="p-2 rounded-lg bg-sky-500 text-slate-950"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryId(null)}
                          className="p-2 rounded-lg bg-slate-800 text-slate-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="font-bold text-sm text-white truncate">{cat.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              usedCount > 0
                                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {usedCount === 0
                              ? 'Sem uso'
                              : `${usedCount} ${usedCount === 1 ? 'item' : 'itens'}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectCategoryFilter(cat.id);
                              onClose();
                            }}
                            title="Filtrar inventário por esta categoria"
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-sky-400 hover:bg-sky-500/10 flex items-center gap-1 transition-colors"
                          >
                            <Filter className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Filtrar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(cat.id);
                              setEditingName(cat.name);
                            }}
                            title="Editar nome da categoria"
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteCategory(cat);
                              setReplacementCategoryId('');
                            }}
                            title={
                              usedCount === 0
                                ? 'Excluir categoria sem uso'
                                : 'Desvincular itens e excluir categoria'
                            }
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/95 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-colors"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
};
