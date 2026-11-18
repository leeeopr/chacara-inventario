import React, { useEffect } from 'react';
import { Award, Check, CheckCircle2, ChevronRight, Sparkles } from 'lucide-react';
import { Room } from '../types/inventory';

interface SeniorCelebrationOverlayProps {
  type: 'room' | 'all';
  roomName?: string;
  nextRoom?: Room | null;
  onAdvance: () => void;
  onClose?: () => void;
}

export const SeniorCelebrationOverlay: React.FC<SeniorCelebrationOverlayProps> = ({
  type,
  roomName,
  nextRoom,
  onAdvance,
}) => {
  // Auto-advance after 2.8 seconds for room completion if senior doesn't tap
  useEffect(() => {
    if (type === 'room' && nextRoom) {
      const timer = setTimeout(() => {
        onAdvance();
      }, 2600);
      return () => clearTimeout(timer);
    }
  }, [type, nextRoom, onAdvance]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-emerald-500 p-6 sm:p-8 text-center space-y-6 shadow-2xl">
        {type === 'room' ? (
          <>
            <div className="w-24 h-24 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 mx-auto shadow-2xl shadow-emerald-500/30 animate-bounce">
              <Check className="w-14 h-14 stroke-[3]" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Cômodo Finalizado!
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight">
                {roomName || 'CÔMODO'}
              </h2>
              <p className="text-base font-extrabold text-emerald-400">
                Todos os itens deste ambiente foram conferidos!
              </p>
            </div>

            {nextRoom ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onAdvance}
                  className="w-full py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/30 active:scale-98 transition-all"
                >
                  <span>IR PARA: {nextRoom.name.toUpperCase()}</span>
                  <ChevronRight className="w-7 h-7 stroke-[3]" />
                </button>
                <span className="block text-xs font-bold text-slate-400 mt-2">
                  Avançando automaticamente...
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onAdvance}
                className="w-full py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xl shadow-xl shadow-emerald-500/30 active:scale-98 transition-all"
              >
                VER CÔMODOS
              </button>
            )}
          </>
        ) : (
          /* All Rooms Completed */
          <>
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-slate-950 mx-auto shadow-2xl shadow-emerald-500/40">
              <Award className="w-16 h-16 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider">
                🎉 Missão Cumprida!
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight">
                CONFERÊNCIA CONCLUÍDA!
              </h2>
              <p className="text-base text-slate-300 font-bold leading-relaxed max-w-sm mx-auto">
                Todos os cômodos da chácara foram inspecionados com sucesso.
              </p>
            </div>

            <button
              type="button"
              onClick={onAdvance}
              className="w-full py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-2xl shadow-2xl shadow-emerald-500/40 active:scale-98 transition-all"
            >
              FINALIZAR
            </button>
          </>
        )}
      </div>
    </div>
  );
};
