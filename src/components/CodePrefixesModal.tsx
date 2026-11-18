import React, { useState } from 'react';
import { Hash, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import {
  generateNextCodes,
  getCodePrefixRules,
  resetCodePrefixRules,
  saveCodePrefixRules,
} from '../lib/codeGenerator';
import { CodePrefixRule, InventoryItem } from '../types/inventory';

interface CodePrefixesModalProps {
  isOpen: boolean;
  items: InventoryItem[];
  onClose: () => void;
}

export const CodePrefixesModal: React.FC<CodePrefixesModalProps> = ({
  isOpen,
  items,
  onClose,
}) => {
  const [rules, setRules] = useState<CodePrefixRule[]>(() => getCodePrefixRules());
  const [newPrefix, setNewPrefix] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDigits, setNewDigits] = useState(2);
  const [newKeywords, setNewKeywords] = useState('');

  if (!isOpen) return null;

  const existingCodes = items.map((i) => i.identification_code);

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPref = newPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanPref || !newLabel.trim()) return;

    const updated: CodePrefixRule[] = [
      ...rules.filter((r) => r.prefix.toUpperCase() !== cleanPref),
      {
        id: `${cleanPref.toLowerCase()}-${Date.now()}`,
        prefix: cleanPref,
        label: newLabel.trim(),
        digits: newDigits,
        keywords: newKeywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
      },
    ];
    setRules(updated);
    saveCodePrefixRules(updated);
    setNewPrefix('');
    setNewLabel('');
    setNewKeywords('');
  };

  const handleRemoveRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    saveCodePrefixRules(updated);
  };

  const handleReset = () => {
    const defaults = resetCodePrefixRules();
    setRules(defaults);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">
                Gerador de Códigos de Identificação
              </h2>
              <p className="text-xs text-slate-400">
                Configure os prefixos automáticos para itens individuais (ex: TG01, TM01, TP01)
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

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Add New Prefix Form */}
          <form
            onSubmit={handleAddRule}
            className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3"
          >
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
              Adicionar Novo Prefixo de Código
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Prefixo *
                </label>
                <input
                  type="text"
                  maxLength={5}
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
                  placeholder="Ex: TG"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm font-mono font-bold text-amber-300 uppercase"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Descrição do Grupo *
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ex: Potes Grandes / Tupperware"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Dígitos
                </label>
                <select
                  value={newDigits}
                  onChange={(e) => setNewDigits(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                >
                  <option value={2}>2 (01, 02...)</option>
                  <option value={3}>3 (001, 002...)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
                placeholder="Palavras-chave p/ detecção automática separadas por vírgula (opcional)"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
              />
              <button
                type="submit"
                disabled={!newPrefix.trim() || !newLabel.trim()}
                className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-black text-xs flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Salvar Prefixo</span>
              </button>
            </div>
          </form>

          {/* Existing Prefix Rules List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Prefixos configurados ({rules.length})</span>
              <button
                type="button"
                onClick={handleReset}
                className="text-amber-400 hover:underline flex items-center gap-1 font-semibold"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar padrões</span>
              </button>
            </div>

            {rules.map((rule) => {
              const nextAvailable = generateNextCodes(
                rule.prefix,
                existingCodes,
                1,
                rule.digits
              )[0];
              return (
                <div
                  key={rule.id}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-mono font-black text-xs shrink-0">
                      {rule.prefix}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{rule.label}</p>
                      <p className="text-[11px] text-slate-400">
                        Próximo código livre:{' '}
                        <span className="font-mono font-bold text-emerald-400">
                          {nextAvailable}
                        </span>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveRule(rule.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                    title="Remover prefixo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

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
