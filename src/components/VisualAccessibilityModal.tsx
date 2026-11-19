import React, { useEffect } from 'react';
import {
  Check,
  CheckCircle2,
  Eye,
  Info,
  Package,
  RotateCcw,
  Sliders,
  Sparkles,
  Type,
  X,
  Zap,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import {
  DEFAULT_VISUAL_SCALE,
  useVisualScale,
  VISUAL_SCALE_LEVELS,
  VisualScaleLevel,
} from '../lib/visualScale';

interface VisualAccessibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VisualAccessibilityModal: React.FC<VisualAccessibilityModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { level, option, setLevel, resetToDefault, allOptions, levels } = useVisualScale();

  // Android back button support
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerBackHandler('VisualAccessibilityModal', 60, () => {
      onClose();
      return true;
    });
    return () => unregister();
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentIndex = levels.indexOf(level);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    const newLevel = levels[idx];
    if (newLevel) {
      setLevel(newLevel);
    }
  };

  const handleSelectLevel = (newLevel: VisualScaleLevel) => {
    setLevel(newLevel);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-amber-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Sliders className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white leading-tight">
                Tamanho da Interface
              </h2>
              <p className="text-xs font-bold text-slate-400">
                Acessibilidade visual e escala global
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition-all"
            title="Fechar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Active Level Header & Slider */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Nível Selecionado
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-md">
                {option.label} • {option.sublabel}
              </span>
            </div>

            {/* Range Slider Control */}
            <div className="space-y-2 pt-1">
              <input
                type="range"
                min="0"
                max={levels.length - 1}
                step="1"
                value={currentIndex >= 0 ? currentIndex : 1}
                onChange={handleSliderChange}
                aria-label="Controle de tamanho da interface"
                className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              />

              {/* Slider Scale Ticks / Labels */}
              <div className="grid grid-cols-5 text-center text-[10px] sm:text-xs font-extrabold text-slate-400">
                {levels.map((lvl, idx) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => handleSelectLevel(lvl)}
                    className={`p-1 rounded-lg transition-colors ${
                      level === lvl
                        ? 'text-amber-300 font-black'
                        : 'hover:text-slate-200'
                    }`}
                  >
                    {allOptions[lvl].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Level Description */}
            <p className="text-xs font-medium text-slate-300 leading-relaxed pt-1 border-t border-slate-800/80">
              {option.description}
            </p>
          </div>

          {/* Cards for Direct Touch Selection */}
          <div className="space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 block px-1">
              Escolha Rápida por Toque
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {levels.map((lvl) => {
                const opt = allOptions[lvl];
                const isSelected = level === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => handleSelectLevel(lvl)}
                    className={`p-3 rounded-2xl text-left border transition-all flex items-center justify-between gap-2.5 active:scale-98 ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/60 shadow-md text-amber-200'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white">
                          {opt.label}
                        </span>
                        {lvl === DEFAULT_VISUAL_SCALE && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-slate-800 text-slate-400">
                            Padrão
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400 block mt-0.5">
                        {opt.sublabel}
                      </span>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Visual Preview Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Prévia em Tempo Real (Checklist)</span>
              </span>
              <span className="text-[11px] font-bold text-emerald-400">
                Ajuste Imediato
              </span>
            </div>

            {/* Mock Item & Question */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                  #COZ-01 • Cozinha
                </span>
                <span className="text-xs font-extrabold text-slate-400">
                  Item 1 de 12
                </span>
              </div>

              <div>
                <p className="text-base font-black text-white leading-tight">
                  Cafeteira Elétrica Inox
                </p>
                <p className="text-sm font-bold text-amber-300 mt-1">
                  O aparelho liga e ferve água perfeitamente?
                </p>
              </div>

              {/* Sample Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs sm:text-sm text-center flex items-center justify-center gap-1 shadow-sm">
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>SIM (Tudo OK)</span>
                </div>
                <div className="py-2.5 rounded-xl bg-slate-800 text-rose-300 border border-rose-500/30 font-bold text-xs sm:text-sm text-center flex items-center justify-center gap-1">
                  <X className="w-4 h-4 stroke-[2.5]" />
                  <span>NÃO (Defeito)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          {/* Reset to Default */}
          <button
            type="button"
            onClick={resetToDefault}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all"
            title="Voltar para a escala padrão recomendada"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restaurar tamanho padrão</span>
          </button>

          {/* Confirm & Close */}
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
          >
            <CheckCircle2 className="w-4 h-4 stroke-[3]" />
            <span>Concluir</span>
          </button>
        </div>
      </div>
    </div>
  );
};
