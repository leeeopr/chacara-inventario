import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  FolderTree,
  Home,
  Info,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import { getInventoryImageUrl } from '../lib/supabase';
import {
  AiClassificationResult,
  classifyBatchItemsWithAi,
  getAiApiKey,
  saveAiApiKey,
} from '../services/aiVisionService';
import { InventoryCategory, InventoryItem, Room } from '../types/inventory';

export interface BatchItemEditState {
  item: InventoryItem;
  status: 'idle' | 'analyzing' | 'done' | 'error';
  suggestedName: string;
  categoryId: string; // category id or empty
  suggestedCategoryName?: string;
  roomId: string; // room id or empty
  description: string;
  markAsCompleted: boolean;
  errorMessage?: string;
  confidence?: 'high' | 'medium' | 'low';
}

interface BatchAiClassificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  categories: InventoryCategory[];
  rooms: Room[];
  onSaveBatch: (
    updates: Array<{
      id: string;
      name: string;
      category_id: string | null;
      room_id: string | null;
      description: string | null;
      status: 'completed' | 'pending_information';
    }>
  ) => Promise<void>;
  onCreateCategory?: (name: string) => Promise<InventoryCategory>;
}

export const BatchAiClassificationModal: React.FC<BatchAiClassificationModalProps> = ({
  isOpen,
  onClose,
  items,
  categories,
  rooms,
  onSaveBatch,
  onCreateCategory,
}) => {
  const [itemStates, setItemStates] = useState<BatchItemEditState[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [globalRoomId, setGlobalRoomId] = useState('');
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Initialize state when items change or modal opens
  useEffect(() => {
    if (!isOpen) return;

    setApiKeyInput(getAiApiKey());
    setSaveSuccessMsg(null);

    const initialStates: BatchItemEditState[] = items.map((it) => ({
      item: it,
      status: 'idle',
      suggestedName: it.name.startsWith('Item pendente') ? '' : it.name,
      categoryId: it.category_id || '',
      roomId: it.room_id || '',
      description: it.description || '',
      markAsCompleted: true, // Default to true so user finishes registration
    }));

    setItemStates(initialStates);
    setProgress({ current: 0, total: items.length });

    // Auto-start classification if items haven't been classified yet
    if (items.length > 0) {
      setTimeout(() => {
        handleRunAnalysis(initialStates);
      }, 300);
    }
  }, [isOpen, items]);

  // Android Back Handler
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerBackHandler('BatchAiClassificationModal', 55, () => {
      if (isAnalyzing || isSaving) {
        if (!window.confirm('A classificação por IA está em andamento. Deseja realmente sair?')) {
          return true;
        }
      }
      onClose();
      return true;
    });
    return unregister;
  }, [isOpen, isAnalyzing, isSaving, onClose]);

  if (!isOpen) return null;

  // Run AI Analysis across items
  const handleRunAnalysis = async (customStates?: BatchItemEditState[]) => {
    const statesToUse = customStates || itemStates;
    if (statesToUse.length === 0 || isAnalyzing) return;

    setIsAnalyzing(true);
    setSaveSuccessMsg(null);
    setProgress({ current: 0, total: statesToUse.length });

    // Mark all pending as analyzing
    setItemStates((prev) =>
      prev.map((s) => ({
        ...s,
        status: s.status === 'done' ? 'done' : 'analyzing',
      }))
    );

    const itemsToClassify = statesToUse
      .filter((s) => s.status !== 'done')
      .map((s) => s.item);

    try {
      await classifyBatchItemsWithAi({
        items: itemsToClassify,
        categories,
        rooms,
        apiKey: apiKeyInput.trim() || undefined,
        concurrency: 2,
        onProgress: (completed, total, result) => {
          setProgress({ current: completed, total });
          if (result) {
            setItemStates((prev) =>
              prev.map((s) => {
                if (s.item.id === result.itemId) {
                  return {
                    ...s,
                    status: 'done',
                    suggestedName: result.suggestedName,
                    categoryId: result.matchedCategoryId || s.categoryId,
                    suggestedCategoryName: result.suggestedCategoryName,
                    roomId: result.matchedRoomId || s.roomId,
                    description: result.description || s.description,
                    confidence: result.confidence,
                  };
                }
                return s;
              })
            );
          }
        },
        onErrorItem: (item, error) => {
          setItemStates((prev) =>
            prev.map((s) => {
              if (s.item.id === item.id) {
                return {
                  ...s,
                  status: 'error',
                  errorMessage: error.message || 'Erro ao analisar imagem',
                };
              }
              return s;
            })
          );
        },
      });
    } catch (err: any) {
      console.error('Falha geral no lote de IA:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Apply single room to all items
  const handleApplyGlobalRoom = (roomId: string) => {
    setGlobalRoomId(roomId);
    if (!roomId) return;
    setItemStates((prev) =>
      prev.map((s) => ({
        ...s,
        roomId,
      }))
    );
  };

  // Save changes to Supabase
  const handleSaveAll = async () => {
    if (isSaving || itemStates.length === 0) return;

    setIsSaving(true);
    setSaveSuccessMsg(null);

    try {
      const updates = itemStates.map((s) => ({
        id: s.item.id,
        name: s.suggestedName.trim() || s.item.name,
        category_id: s.categoryId || null,
        room_id: s.roomId || null,
        description: s.description.trim() || null,
        status: (s.markAsCompleted ? 'completed' : 'pending_information') as
          | 'completed'
          | 'pending_information',
      }));

      await onSaveBatch(updates);
      setSaveSuccessMsg('Todos os itens foram atualizados com sucesso!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Erro ao salvar lote classificado:', err);
      alert(`Erro ao salvar itens: ${err.message || 'Falha no banco de dados'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const completedCount = itemStates.filter((s) => s.status === 'done').length;
  const totalCount = itemStates.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[92vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  Classificação Inteligente por IA
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-extrabold text-[10px] border border-purple-500/30">
                  Gemini Vision
                </span>
              </div>
              <p className="text-xs text-slate-400">
                A IA analisa as imagens e preenche automaticamente os nomes e categorias.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowKeyConfig((v) => !v)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Configurar Chave da IA"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isAnalyzing || isSaving}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* API Key Drawer (collapsible) */}
        {showKeyConfig && (
          <div className="px-4 sm:px-6 py-3 bg-purple-950/30 border-b border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in slide-in-from-top-2">
            <div className="flex-1 w-full space-y-1">
              <label className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Chave de API do Google Gemini</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Cole sua chave AQ... ou AIzaSy..."
                  className="w-full text-xs py-1.5 px-3 rounded-xl bg-slate-900 border border-purple-500/40 text-purple-100 placeholder:text-slate-600 focus:outline-none focus:border-purple-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    saveAiApiKey(apiKeyInput);
                    setShowKeyConfig(false);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs shrink-0 transition-colors"
                >
                  Salvar Chave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Progress Bar & Quick Actions */}
        <div className="px-4 sm:px-6 py-3 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <div className="flex-1 max-w-xs space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  {isAnalyzing && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
                  <span>{isAnalyzing ? 'Identificando objetos...' : 'Status da Análise'}</span>
                </span>
                <span className="font-mono text-purple-400 font-extrabold text-[11px]">
                  {completedCount} de {totalCount} ({progressPercent}%)
                </span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {itemStates.some((s) => s.status === 'error') && !isAnalyzing && (
              <button
                type="button"
                onClick={() => handleRunAnalysis()}
                className="py-1 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reanalisar Falhas</span>
              </button>
            )}
          </div>

          {/* Quick global room assigner */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold hidden md:inline">
              Definir cômodo para todos:
            </span>
            <div className="relative">
              <select
                value={globalRoomId}
                onChange={(e) => handleApplyGlobalRoom(e.target.value)}
                className="appearance-none py-1.5 pl-3 pr-8 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 focus:outline-none focus:border-purple-400 cursor-pointer"
              >
                <option value="">Aplicar Cômodo a Todos...</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Scrollable Items List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {itemStates.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>Nenhum item selecionado para classificação.</p>
            </div>
          ) : (
            itemStates.map((state, index) => {
              const imageUrl = getInventoryImageUrl(state.item.image_path);

              return (
                <div
                  key={state.item.id}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col md:flex-row items-start md:items-center gap-4 ${
                    state.status === 'analyzing'
                      ? 'bg-purple-950/20 border-purple-500/50 shadow-lg shadow-purple-500/5'
                      : state.status === 'done'
                      ? 'bg-slate-900/90 border-slate-700 hover:border-purple-500/40'
                      : state.status === 'error'
                      ? 'bg-rose-950/20 border-rose-500/40'
                      : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  {/* Photo & Status Indicator */}
                  <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-950 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={state.suggestedName || state.item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-600 font-bold">Sem Foto</span>
                    )}

                    {/* Status Badge overlay */}
                    <div className="absolute top-1.5 right-1.5">
                      {state.status === 'analyzing' && (
                        <div className="w-6 h-6 rounded-full bg-purple-500/80 backdrop-blur-sm flex items-center justify-center shadow">
                          <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                        </div>
                      )}
                      {state.status === 'done' && (
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow">
                          <Check className="w-3.5 h-3.5 text-slate-950 stroke-[3]" />
                        </div>
                      )}
                      {state.status === 'error' && (
                        <div className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center shadow">
                          <AlertCircle className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* 1. Nome do Item */}
                    <div className="sm:col-span-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-extrabold uppercase text-slate-400">
                          Nome do Objeto Identificado
                        </label>
                        {state.status === 'done' && (
                          <span className="text-[10px] font-bold text-purple-300 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-purple-400" />
                            <span>Sugerido pela IA</span>
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={state.suggestedName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItemStates((prev) =>
                            prev.map((s) => (s.item.id === state.item.id ? { ...s, suggestedName: val } : s))
                          );
                        }}
                        placeholder="Identificando nome do item..."
                        disabled={state.status === 'analyzing'}
                        className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 font-bold text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-400"
                      />
                    </div>

                    {/* 2. Categoria */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold uppercase text-slate-400">
                        Categoria
                      </label>
                      <select
                        value={state.categoryId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItemStates((prev) =>
                            prev.map((s) => (s.item.id === state.item.id ? { ...s, categoryId: val } : s))
                          );
                        }}
                        disabled={state.status === 'analyzing'}
                        className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-slate-200 focus:outline-none focus:border-purple-400 cursor-pointer"
                      >
                        <option value="">Sem Categoria</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 3. Cômodo */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold uppercase text-slate-400">
                        Cômodo
                      </label>
                      <select
                        value={state.roomId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItemStates((prev) =>
                            prev.map((s) => (s.item.id === state.item.id ? { ...s, roomId: val } : s))
                          );
                        }}
                        disabled={state.status === 'analyzing'}
                        className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-slate-200 focus:outline-none focus:border-purple-400 cursor-pointer"
                      >
                        <option value="">Definir mais tarde</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 4. Descrição */}
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-extrabold uppercase text-slate-400">
                        Descrição / Detalhes
                      </label>
                      <input
                        type="text"
                        value={state.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItemStates((prev) =>
                            prev.map((s) => (s.item.id === state.item.id ? { ...s, description: val } : s))
                          );
                        }}
                        placeholder="Ex: Cor preta, 6 pás, tomada de 10A..."
                        disabled={state.status === 'analyzing'}
                        className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-purple-400"
                      />
                    </div>

                    {/* 5. Concluir Pendência Toggle */}
                    <div className="flex items-center gap-2 pt-2 sm:pt-4">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={state.markAsCompleted}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setItemStates((prev) =>
                              prev.map((s) =>
                                s.item.id === state.item.id ? { ...s, markAsCompleted: checked } : s
                              )
                            );
                          }}
                          className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <span className="text-xs font-extrabold text-slate-300">
                          Liberar para conferência
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400">
            {saveSuccessMsg ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                <span>{saveSuccessMsg}</span>
              </span>
            ) : (
              <span>
                {completedCount} de {totalCount} itens analisados pela IA.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || itemStates.length === 0}
              className="flex-1 sm:flex-initial py-2.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando Itens...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 stroke-[2.5]" />
                  <span>Salvar e Aplicar a Todos ({totalCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
