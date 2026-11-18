import React, { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { InventoryItem } from '../types/inventory';

interface SeniorQuantityAdjustModalProps {
  isOpen: boolean;
  item: InventoryItem | null;
  onClose: () => void;
  onConfirm: (foundQuantity: number, missingQuantity: number) => void;
}

export const SeniorQuantityAdjustModal: React.FC<SeniorQuantityAdjustModalProps> = ({
  isOpen,
  item,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !item) return null;

  const expected = item.expected_quantity;
  const [foundQuantity, setFoundQuantity] = useState<number>(() =>
    Math.max(0, expected - 1)
  );

  const missing = Math.max(0, expected - foundQuantity);

  const handleConfirm = () => {
    onConfirm(foundQuantity, missing);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-emerald-500/50 shadow-2xl overflow-hidden flex flex-col animate-fadeIn"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white leading-tight">
              Ajustar Quantidade
            </h2>
            <p className="text-sm font-bold text-slate-400 truncate max-w-[260px]">
              {item.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 text-center">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400 block mb-1">
              Quantidade Esperada no Cadastro
            </span>
            <span className="text-2xl font-black text-slate-200">
              {expected} {expected === 1 ? 'unidade' : 'unidades'}
            </span>
          </div>

          <div className="p-5 rounded-3xl bg-slate-950 border border-slate-800 space-y-3">
            <span className="text-sm font-extrabold text-emerald-400 uppercase tracking-wider block">
              Quantos você encontrou?
            </span>

            <div className="flex items-center justify-center gap-4 py-2">
              <button
                type="button"
                onClick={() => setFoundQuantity((q) => Math.max(0, q - 1))}
                className="w-20 h-20 rounded-2xl bg-slate-800 active:bg-slate-700 text-white flex items-center justify-center border-2 border-slate-700 shadow-xl"
              >
                <Minus className="w-10 h-10 stroke-[3]" />
              </button>

              <div className="min-w-[130px] py-2">
                <span className="text-6xl font-black text-white tracking-tight">
                  {foundQuantity}
                </span>
                <span className="block text-xs font-bold text-slate-400 uppercase mt-1">
                  Encontrados
                </span>
              </div>

              <button
                type="button"
                onClick={() => setFoundQuantity((q) => Math.min(expected, q + 1))}
                className="w-20 h-20 rounded-2xl bg-slate-800 active:bg-slate-700 text-white flex items-center justify-center border-2 border-slate-700 shadow-xl"
              >
                <Plus className="w-10 h-10 stroke-[3]" />
              </button>
            </div>

            {missing > 0 ? (
              <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-black text-base">
                ⚠️ Faltando: {missing} {missing === 1 ? 'unidade' : 'unidades'}
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-base">
                ✓ Todos os {expected} foram encontrados
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl bg-slate-800 text-slate-300 font-bold text-base"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-[2] py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg shadow-xl shadow-emerald-500/30 active:scale-98 transition-transform"
          >
            CONFIRMAR ({foundQuantity})
          </button>
        </div>
      </div>
    </div>
  );
};
