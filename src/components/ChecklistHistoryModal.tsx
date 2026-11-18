import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Home,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { fetchInspectionHistory } from '../services/checklistService';
import { ChecklistSessionSummary } from '../types/checklist';

interface ChecklistHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartNewInspection: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const ChecklistHistoryModal: React.FC<ChecklistHistoryModalProps> = ({
  isOpen,
  onClose,
  onStartNewInspection,
}) => {
  const [history, setHistory] = useState<ChecklistSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ChecklistSessionSummary | null>(null);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await fetchInspectionHistory();
      setHistory(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      setSelectedSession(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">
                Histórico de Vistorias da Chácara
              </h2>
              <p className="text-xs text-slate-400">
                Relatórios pós-checkout com registros de itens faltantes ou danificados
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

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400">
              {history.length} vistoria(s) registrada(s)
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadHistory}
                disabled={isLoading}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartNewInspection();
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Nova Vistoria</span>
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <span className="text-xs font-bold">Carregando histórico de vistorias...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-14 text-center border-2 border-dashed border-slate-800 rounded-3xl p-6 space-y-3">
              <FileText className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-base font-extrabold text-white">
                Nenhuma vistoria finalizada ainda
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Assim que a pessoa responsável conferir os cômodos e finalizar a vistoria, os
                relatórios com o status de cada item aparecerão aqui.
              </p>
            </div>
          ) : selectedSession ? (
            /* Detalhe de uma Vistoria Específica */
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1"
              >
                ← Voltar para lista de vistorias
              </button>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500">
                    ID: {selectedSession.session.id.slice(0, 8)}...
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                      selectedSession.session.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {selectedSession.session.status === 'completed'
                      ? 'Concluída'
                      : 'Em Andamento'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-lg font-black text-white">
                      {selectedSession.completedRooms} / {selectedSession.totalRooms}
                    </span>
                    <span className="block text-[11px] text-slate-400">Cômodos Feitos</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-lg font-black text-emerald-400">
                      {selectedSession.foundItems}
                    </span>
                    <span className="block text-[11px] text-slate-400">Itens OK</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-lg font-black text-rose-400">
                      {selectedSession.missingItemsCount}
                    </span>
                    <span className="block text-[11px] text-slate-400">Faltando</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-lg font-black text-amber-400">
                      {selectedSession.damagedItemsCount}
                    </span>
                    <span className="block text-[11px] text-slate-400">Danificados</span>
                  </div>
                </div>

                <div className="text-xs text-slate-400 space-y-1 pt-1">
                  <p>Iniciada: {formatDate(selectedSession.session.started_at)}</p>
                  {selectedSession.session.completed_at && (
                    <p>Finalizada: {formatDate(selectedSession.session.completed_at)}</p>
                  )}
                </div>
              </div>

              {/* Ocorrências Registradas */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-2">
                  Ocorrências e Problemas Detectados ({selectedSession.occurrences.length})
                </h4>

                {selectedSession.occurrences.length === 0 ? (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span>Nenhum item faltando ou danificado nesta vistoria! Tudo 100% em ordem.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedSession.occurrences.map((occ) => (
                      <div
                        key={occ.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3"
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            occ.occurrence_type === 'missing'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {occ.occurrence_type === 'missing' ? (
                            <Trash2 className="w-5 h-5" />
                          ) : (
                            <AlertTriangle className="w-5 h-5" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-md ${
                                occ.occurrence_type === 'missing'
                                  ? 'bg-rose-500 text-slate-950'
                                  : 'bg-amber-500 text-slate-950'
                              }`}
                            >
                              {occ.occurrence_type === 'missing' ? 'Faltando' : 'Danificado'}
                            </span>
                            {occ.room?.name && (
                              <span className="text-xs text-slate-400 font-semibold">
                                em {occ.room.name}
                              </span>
                            )}
                          </div>

                          <p className="text-sm font-bold text-white mt-1">
                            {occ.description || 'Item reportado com problema'}
                          </p>

                          {occ.missing_quantity > 0 && (
                            <span className="text-xs text-rose-300 font-bold block mt-0.5">
                              Quantidade: {occ.missing_quantity} un.
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Lista de Vistorias Anteriores */
            <div className="space-y-2.5">
              {history.map((item) => {
                const isCompleted = item.session.status === 'completed';
                const hasIssues = item.missingItemsCount > 0 || item.damagedItemsCount > 0;

                return (
                  <div
                    key={item.session.id}
                    onClick={() => setSelectedSession(item)}
                    className="p-4 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/50 transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-3 h-3 rounded-full ${
                            isCompleted ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                          }`}
                        />
                        <span className="text-sm font-bold text-white">
                          Vistoria de {formatDate(item.session.started_at)}
                        </span>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black uppercase ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {isCompleted ? 'Concluída' : 'Em Andamento'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                      <span>
                        {item.completedRooms} de {item.totalRooms} cômodos inspecionados
                      </span>

                      {hasIssues ? (
                        <span className="text-rose-400 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {item.missingItemsCount + item.damagedItemsCount} problema(s)
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sem problemas
                        </span>
                      )}
                    </div>
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
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
