import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { ChecklistOccurrenceType } from '../types/checklist';
import { InventoryItem } from '../types/inventory';

interface SeniorIssueModalProps {
  isOpen: boolean;
  item: InventoryItem | null;
  initialOccurrenceType?: ChecklistOccurrenceType;
  failedQuestion?: string | null;
  initialTag?: string | null;
  onClose: () => void;
  onConfirm: (data: {
    status: 'missing' | 'damaged';
    foundQuantity: number;
    occurrenceType: ChecklistOccurrenceType;
    missingQuantity: number;
    description: string;
    failedQuestion?: string | null;
  }) => void;
}

const COMMON_TAGS = [
  'Item sumiu / Não encontrado',
  'Não funciona / Falha ao ligar',
  'Quebrado / Avariado',
  'Trincado / Rachado',
  'Manchado / Sujo',
  'Rasgado ou descosturado',
  'Peça faltando / Incompleto',
];

export const SeniorIssueModal: React.FC<SeniorIssueModalProps> = ({
  isOpen,
  item,
  initialOccurrenceType = 'missing',
  failedQuestion = null,
  initialTag = null,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !item) return null;

  const isQuantity = item.inventory_type === 'quantity';
  const expected = item.expected_quantity;

  const availableTags = React.useMemo(() => {
    if (initialTag && !COMMON_TAGS.includes(initialTag)) {
      return [initialTag, ...COMMON_TAGS];
    }
    return COMMON_TAGS;
  }, [initialTag]);

  const [issueType, setIssueType] = useState<ChecklistOccurrenceType>(initialOccurrenceType);
  const [foundQuantity, setFoundQuantity] = useState<number>(() =>
    isQuantity ? Math.max(0, expected - 1) : 0
  );
  const [selectedTag, setSelectedTag] = useState<string>(
    initialTag || (initialOccurrenceType === 'damaged' ? 'Quebrado / Avariado' : 'Item sumiu / Não encontrado')
  );
  const [customNote, setCustomNote] = useState<string>('');

  const missingQty = isQuantity ? Math.max(1, expected - foundQuantity) : 1;

  const handleConfirm = () => {
    const details = [
      failedQuestion ? `[Pergunta Reprovada: ${failedQuestion}]` : null,
      selectedTag,
      customNote.trim(),
    ]
      .filter(Boolean)
      .join(' - ');

    onConfirm({
      status: issueType,
      foundQuantity: isQuantity ? foundQuantity : 0,
      occurrenceType: issueType,
      missingQuantity: missingQty,
      description: details,
      failedQuestion: failedQuestion || null,
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-amber-500/50 shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-fadeIn"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white leading-tight">
                Relatar Problema
              </h2>
              <p className="text-sm font-bold text-amber-300 truncate max-w-[240px]">
                {item.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {failedQuestion && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 space-y-1 animate-fadeIn">
              <div className="flex items-center gap-2 text-amber-300 font-extrabold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Problema Detectado na Conferência</span>
              </div>
              <p className="text-sm font-black text-white leading-snug">
                "{failedQuestion}" → <span className="text-rose-400 font-black">NÃO</span>
              </p>
              <p className="text-[11px] text-amber-200/80">
                O item está presente no cômodo com este problema. Confirme os detalhes abaixo:
              </p>
            </div>
          )}

          {/* 1. Escolha do Tipo de Problema */}
          <div>
            <label className="block text-sm font-extrabold text-slate-300 uppercase tracking-wider mb-2">
              O que aconteceu com este item?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setIssueType('missing');
                  setSelectedTag('Item sumiu / Não encontrado');
                }}
                className={`py-4 px-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 text-center transition-all ${
                  issueType === 'missing'
                    ? 'bg-rose-500/20 border-rose-500 text-white shadow-lg'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Trash2
                  className={`w-7 h-7 ${
                    issueType === 'missing' ? 'text-rose-400' : 'text-slate-500'
                  }`}
                />
                <span className="text-base font-black leading-tight">
                  ESTÁ FALTANDO
                </span>
                <span className="text-xs text-slate-400">Não foi encontrado</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIssueType('damaged');
                  setSelectedTag('Quebrado / Avariado');
                }}
                className={`py-4 px-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 text-center transition-all ${
                  issueType === 'damaged'
                    ? 'bg-amber-500/20 border-amber-500 text-white shadow-lg'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <AlertTriangle
                  className={`w-7 h-7 ${
                    issueType === 'damaged' ? 'text-amber-400' : 'text-slate-500'
                  }`}
                />
                <span className="text-base font-black leading-tight">
                  ESTÁ DANIFICADO
                </span>
                <span className="text-xs text-slate-400">Quebrado ou avariado</span>
              </button>
            </div>
          </div>

          {/* 2. Se for item de quantidade, ajuste rápido com botões grandes */}
          {isQuantity && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <label className="block text-sm font-extrabold text-white text-center">
                Quantos você encontrou aqui? (Esperado: {expected})
              </label>

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setFoundQuantity((q) => Math.max(0, q - 1))}
                  className="w-16 h-16 rounded-2xl bg-slate-800 active:bg-slate-700 text-white flex items-center justify-center border border-slate-700 shadow-md"
                >
                  <Minus className="w-8 h-8 stroke-[3]" />
                </button>

                <div className="min-w-[120px] text-center">
                  <span className="text-4xl font-black text-amber-400">
                    {foundQuantity}
                  </span>
                  <span className="block text-xs font-bold text-slate-400 uppercase mt-0.5">
                    Encontrados
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setFoundQuantity((q) => Math.min(expected, q + 1))
                  }
                  className="w-16 h-16 rounded-2xl bg-slate-800 active:bg-slate-700 text-white flex items-center justify-center border border-slate-700 shadow-md"
                >
                  <Plus className="w-8 h-8 stroke-[3]" />
                </button>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-center">
                <span className="text-sm font-black text-rose-300">
                  ⚠️ Faltando / Avariados: {missingQty}{' '}
                  {missingQty === 1 ? 'unidade' : 'unidades'}
                </span>
              </div>
            </div>
          )}

          {/* 3. Motivo Rápido */}
          <div>
            <label className="block text-sm font-extrabold text-slate-300 uppercase tracking-wider mb-2">
              Selecione o detalhe:
            </label>
            <div className="space-y-2">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`w-full py-3 px-4 rounded-xl text-left font-bold text-sm transition-all flex items-center justify-between border ${
                    selectedTag === tag
                      ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>{tag}</span>
                  {selectedTag === tag && <Check className="w-5 h-5 stroke-[3]" />}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Campo de observação simples */}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">
              Observação adicional (opcional):
            </label>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Ex: Quebrou na pia, sumiu tampa, etc..."
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-base transition-colors"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-[2] py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-lg shadow-xl shadow-amber-500/20 active:scale-98 transition-transform"
          >
            CONFIRMAR E CONTINUAR
          </button>
        </div>
      </div>
    </div>
  );
};
