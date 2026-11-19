import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import { compressImageForUpload, formatBytes } from '../lib/imageCompression';
import { createDraftPhotoItem, uploadInventoryPhoto } from '../services/inventoryService';

interface BatchPhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  sizeFormatted: string;
  status: 'idle' | 'compressing' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
  createdItemId?: string;
}

interface BulkPhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdCount: number) => void;
  onGoToPendingItems: () => void;
}

export const BulkPhotoUploadModal: React.FC<BulkPhotoUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onGoToPendingItems,
}) => {
  const [items, setItems] = useState<BatchPhotoItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addMoreInputRef = useRef<HTMLInputElement | null>(null);

  // Register Android back handler
  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerBackHandler('BulkPhotoUploadModal', 50, () => {
      if (isProcessing) {
        const confirmCancel = window.confirm(
          'O envio de fotos está em andamento. Deseja realmente cancelar e fechar?'
        );
        if (!confirmCancel) return true;
      }
      handleClose();
      return true;
    });

    return unregister;
  }, [isOpen, isProcessing]);

  // Clean up object URLs on unmount or items change
  useEffect(() => {
    return () => {
      items.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  if (!isOpen) return null;

  const handleFilesSelected = (fileList: FileList | null, append = false) => {
    if (!fileList || fileList.length === 0) return;

    setGlobalError(null);
    const newItems: BatchPhotoItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.startsWith('image/')) continue;

      const previewUrl = URL.createObjectURL(file);
      newItems.push({
        id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`,
        file,
        previewUrl,
        sizeFormatted: formatBytes(file.size),
        status: 'idle',
      });
    }

    if (newItems.length === 0) {
      setGlobalError('Nenhum arquivo de imagem válido foi selecionado.');
      return;
    }

    setItems((prev) => (append ? [...prev, ...newItems] : newItems));
  };

  const handleRemoveItem = (id: string) => {
    if (isProcessing) return;
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((it) => it.id !== id);
    });
  };

  const handleClearAll = () => {
    if (isProcessing) return;
    items.forEach((it) => {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
    });
    setItems([]);
    setGlobalError(null);
  };

  const handleClose = () => {
    if (isProcessing) {
      const confirmCancel = window.confirm(
        'O envio de fotos está em andamento. Deseja realmente sair?'
      );
      if (!confirmCancel) return;
    }
    handleClearAll();
    onClose();
  };

  // Upload runner
  const handleStartUpload = async (retryOnlyErrors = false) => {
    if (items.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setGlobalError(null);

    const itemsToProcess = retryOnlyErrors
      ? items.filter((it) => it.status === 'error')
      : items.filter((it) => it.status !== 'success');

    let successCounter = items.filter((it) => it.status === 'success').length;

    for (let i = 0; i < itemsToProcess.length; i++) {
      const currentItem = itemsToProcess[i];
      setCurrentIndex(i + 1);

      // 1. Mark compressing
      setItems((prev) =>
        prev.map((it) => (it.id === currentItem.id ? { ...it, status: 'compressing' } : it))
      );

      try {
        // Compress photo for swift upload
        const compressed = await compressImageForUpload(currentItem.file, 1280, 0.82);

        // 2. Mark uploading
        setItems((prev) =>
          prev.map((it) => (it.id === currentItem.id ? { ...it, status: 'uploading' } : it))
        );

        // Upload to Supabase Storage
        const imagePath = await uploadInventoryPhoto(compressed.blob, 'foto-lote');

        // Create draft preliminary item in database
        const itemNumber = successCounter + 1;
        const draftItem = await createDraftPhotoItem(imagePath, itemNumber);

        successCounter += 1;

        // 3. Mark success
        setItems((prev) =>
          prev.map((it) =>
            it.id === currentItem.id
              ? {
                  ...it,
                  status: 'success',
                  createdItemId: draftItem.id,
                }
              : it
          )
        );
      } catch (err: any) {
        console.error('Failed to upload photo item:', err);
        const errMsg = err?.message || 'Erro ao enviar foto.';
        setItems((prev) =>
          prev.map((it) =>
            it.id === currentItem.id
              ? {
                  ...it,
                  status: 'error',
                  errorMessage: errMsg,
                }
              : it
          )
        );
      }
    }

    setIsProcessing(false);
    onSuccess(successCounter);
  };

  const totalCount = items.length;
  const successCount = items.filter((it) => it.status === 'success').length;
  const errorCount = items.filter((it) => it.status === 'error').length;
  const pendingCount = items.filter(
    (it) => it.status === 'idle' || it.status === 'compressing' || it.status === 'uploading'
  ).length;

  const isCompleted = totalCount > 0 && successCount === totalCount;
  const hasErrors = errorCount > 0;
  const progressPercent = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Cadastro em Lote por Fotos
              </h2>
              <p className="text-xs text-slate-400">
                Envie múltiplas fotos agora e complete as informações dos itens depois
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Global Alert / Info Banner */}
          {globalError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{globalError}</span>
            </div>
          )}

          {/* Empty State / Photo Picker Zone */}
          {items.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-3xl border-2 border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-950/40 hover:bg-slate-950/70 transition-all flex flex-col items-center justify-center text-center group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                Selecione as fotos do lote
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-5 leading-relaxed">
                Tire fotos de vários itens com seu celular ou selecione fotos da galeria. Rascunhos preliminares serão criados automaticamente.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Escolher Fotos da Galeria</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files, false)}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Batch Summary & Quick Actions */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold text-xs">
                    {totalCount} {totalCount === 1 ? 'foto selecionada' : 'fotos selecionadas'}
                  </span>
                  {successCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      {successCount} salvas
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {errorCount} com erro
                    </span>
                  )}
                </div>

                {!isProcessing && !isCompleted && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addMoreInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar mais</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Remover todas"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <input
                      ref={addMoreInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFilesSelected(e.target.files, true)}
                    />
                  </div>
                )}
              </div>

              {/* Progress Bar (during or after processing) */}
              {(isProcessing || successCount > 0) && (
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300 flex items-center gap-2">
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>Processando foto {currentIndex} de {totalCount}...</span>
                        </>
                      ) : isCompleted ? (
                        <span className="text-emerald-400 flex items-center gap-1.5 font-black">
                          <CheckCircle2 className="w-4 h-4" />
                          Todas as fotos foram salvas com sucesso!
                        </span>
                      ) : (
                        <span>Progresso do lote</span>
                      )}
                    </span>
                    <span className="font-extrabold text-amber-400">{progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Photos Gallery Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto p-1">
                {items.map((item, index) => {
                  return (
                    <div
                      key={item.id}
                      className={`relative rounded-2xl overflow-hidden border bg-slate-950 transition-all ${
                        item.status === 'success'
                          ? 'border-emerald-500/50 shadow-md shadow-emerald-500/10'
                          : item.status === 'error'
                          ? 'border-rose-500/50 shadow-md shadow-rose-500/10'
                          : item.status === 'uploading' || item.status === 'compressing'
                          ? 'border-amber-500/70 shadow-md shadow-amber-500/20'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Photo Thumbnail */}
                      <div className="aspect-square w-full bg-slate-900 overflow-hidden relative">
                        <img
                          src={item.previewUrl}
                          alt={`Foto ${index + 1}`}
                          className="w-full h-full object-cover"
                        />

                        {/* Top index badge */}
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md text-[10px] font-black text-slate-300 border border-slate-700/50">
                          #{index + 1}
                        </div>

                        {/* Remove button (when not processing) */}
                        {!isProcessing && item.status !== 'success' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-slate-950/80 hover:bg-rose-500 text-slate-400 hover:text-white flex items-center justify-center transition-colors shadow"
                            title="Remover foto"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Overlay status indicators */}
                        {item.status === 'compressing' && (
                          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-amber-400 p-2 text-center">
                            <Loader2 className="w-6 h-6 animate-spin mb-1" />
                            <span className="text-[10px] font-bold">Otimizando...</span>
                          </div>
                        )}

                        {item.status === 'uploading' && (
                          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-amber-400 p-2 text-center">
                            <Loader2 className="w-6 h-6 animate-spin mb-1" />
                            <span className="text-[10px] font-bold">Enviando...</span>
                          </div>
                        )}

                        {item.status === 'success' && (
                          <div className="absolute inset-0 bg-emerald-950/50 backdrop-blur-[1px] flex flex-col items-center justify-center text-emerald-400 p-2">
                            <div className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg mb-1">
                              <Check className="w-5 h-5 stroke-[3]" />
                            </div>
                            <span className="text-[10px] font-extrabold text-white">Criado</span>
                          </div>
                        )}

                        {item.status === 'error' && (
                          <div className="absolute inset-0 bg-rose-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-rose-400 p-2 text-center">
                            <AlertCircle className="w-6 h-6 mb-1 text-rose-400" />
                            <span className="text-[10px] font-bold leading-tight">Falha no envio</span>
                          </div>
                        )}
                      </div>

                      {/* Card Bottom Meta */}
                      <div className="p-2 text-[10px] text-slate-400 flex items-center justify-between">
                        <span className="truncate max-w-[80px]" title={item.file.name}>
                          {item.sizeFormatted}
                        </span>
                        {item.status === 'idle' && (
                          <span className="text-slate-500 font-medium">Pronto</span>
                        )}
                        {item.status === 'success' && (
                          <span className="text-emerald-400 font-bold">Salvo</span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-rose-400 font-bold truncate max-w-[70px]">
                            Erro
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-0 z-10">
          <div className="text-xs text-slate-400 text-center sm:text-left">
            {isCompleted ? (
              <span className="text-emerald-400 font-bold">
                🎉 Todos os rascunhos foram registrados no banco de dados!
              </span>
            ) : hasErrors ? (
              <span className="text-rose-400 font-bold">
                Algumas fotos falharam. Você pode tentar reenviar apenas as fotos com erro.
              </span>
            ) : (
              <span>Os itens criados ficarão marcados como "Pendente de informações".</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {isCompleted ? (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
                >
                  Concluir e Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleClearAll();
                    onGoToPendingItems();
                  }}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 transition-all"
                >
                  <Clock className="w-4 h-4 stroke-[2.5]" />
                  <span>Ir para Itens Pendentes</span>
                </button>
              </>
            ) : hasErrors && !isProcessing ? (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => handleStartUpload(true)}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 transition-all"
                >
                  <RefreshCw className="w-4 h-4 stroke-[2.5]" />
                  <span>Reenviar Fotos com Erro ({errorCount})</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isProcessing}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={items.length === 0 || isProcessing}
                  onClick={() => handleStartUpload(false)}
                  className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enviando ({currentIndex}/{totalCount})...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 stroke-[2.5]" />
                      <span>Iniciar Envio em Lote ({totalCount})</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
