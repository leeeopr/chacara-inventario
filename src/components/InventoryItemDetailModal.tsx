import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  Hash,
  Home,
  Layers,
  Loader2,
  Maximize2,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  deleteRoomAssignment,
  upsertRoomAssignment,
} from '../services/inventoryService';
import { CONDITION_OPTIONS, getConditionConfig } from '../lib/conditionUtils';
import { getInspectionTypeConfig } from '../lib/inspectionTypeUtils';
import { getInventoryImageUrl } from '../lib/supabase';
import {
  ConditionStatus,
  InventoryItem,
  InventoryRoomAssignment,
  Room,
} from '../types/inventory';

interface InventoryItemDetailModalProps {
  item: InventoryItem | null;
  rooms: Room[];
  onClose: () => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onItemChanged?: () => Promise<void>;
}

function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const InventoryItemDetailModal: React.FC<InventoryItemDetailModalProps> = ({
  item,
  rooms,
  onClose,
  onEdit,
  onDelete,
  onItemChanged,
}) => {
  const [zoomPhoto, setZoomPhoto] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Distribution form state (inline add / edit)
  const [showAddDistribution, setShowAddDistribution] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<InventoryRoomAssignment | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [assignedQuantity, setAssignedQuantity] = useState(1);
  const [assignedCondition, setAssignedCondition] = useState<ConditionStatus>('good');
  const [assignedNotes, setAssignedNotes] = useState('');
  const [isSubmittingDistribution, setIsSubmittingDistribution] = useState(false);
  const [distributionError, setDistributionError] = useState<string | null>(null);
  const [distributionSuccess, setDistributionSuccess] = useState<string | null>(null);

  if (!item) return null;

  const imageUrl = getInventoryImageUrl(item.image_path);
  const isIndividual = item.inventory_type === 'individual';
  const assignments = item.room_assignments || [];
  const totalQuantity =
    item.total_quantity !== undefined
      ? item.total_quantity
      : assignments.length > 0
      ? assignments.reduce((acc, a) => acc + (Number(a.quantity) || 0), 0)
      : item.room_id
      ? item.expected_quantity
      : 0;

  // Filter available rooms that do not already have an assignment
  const assignedRoomIds = new Set(assignments.map((a) => a.room_id));
  const availableRoomsForAdd = rooms.filter((r) => !assignedRoomIds.has(r.id));

  const handleOpenAdd = () => {
    setEditingAssignment(null);
    setSelectedRoomId(availableRoomsForAdd[0]?.id || '');
    setAssignedQuantity(1);
    setAssignedCondition('good');
    setAssignedNotes('');
    setDistributionError(null);
    setDistributionSuccess(null);
    setShowAddDistribution(true);
  };

  const handleOpenEdit = (assignment: InventoryRoomAssignment) => {
    setEditingAssignment(assignment);
    setSelectedRoomId(assignment.room_id);
    setAssignedQuantity(assignment.quantity);
    setAssignedCondition(assignment.condition_status || 'good');
    setAssignedNotes(assignment.condition_notes || '');
    setDistributionError(null);
    setDistributionSuccess(null);
    setShowAddDistribution(true);
  };

  const handleSaveDistribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId) {
      setDistributionError('Selecione um cômodo para a distribuição.');
      return;
    }
    if (assignedQuantity < 1) {
      setDistributionError('A quantidade deve ser de pelo menos 1 unidade.');
      return;
    }

    setIsSubmittingDistribution(true);
    setDistributionError(null);
    setDistributionSuccess(null);

    try {
      await upsertRoomAssignment({
        id: editingAssignment?.id,
        inventory_item_id: item.id,
        room_id: selectedRoomId,
        quantity: assignedQuantity,
        condition_status: assignedCondition,
        condition_notes: assignedNotes.trim() || null,
      });

      setDistributionSuccess(
        editingAssignment
          ? 'Distribuição atualizada com sucesso!'
          : 'Novo cômodo adicionado à distribuição!'
      );
      setShowAddDistribution(false);
      setEditingAssignment(null);
      if (onItemChanged) await onItemChanged();
    } catch (err: any) {
      setDistributionError(err?.message || 'Erro ao salvar distribuição por cômodo.');
    } finally {
      setIsSubmittingDistribution(false);
    }
  };

  const handleDeleteAssignment = async (assignment: InventoryRoomAssignment) => {
    const roomName = assignment.room?.name || 'este cômodo';
    if (!window.confirm(`Remover a distribuição de ${assignment.quantity} un. em "${roomName}"?`)) {
      return;
    }

    setIsSubmittingDistribution(true);
    setDistributionError(null);
    setDistributionSuccess(null);

    try {
      await deleteRoomAssignment(assignment.id);
      setDistributionSuccess(`Distribuição do cômodo "${roomName}" removida.`);
      if (onItemChanged) await onItemChanged();
    } catch (err: any) {
      setDistributionError(err?.message || 'Erro ao remover distribuição.');
    } finally {
      setIsSubmittingDistribution(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {item.identification_code && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-xs tracking-wider shrink-0">
                <Hash className="w-3.5 h-3.5 stroke-[3]" />
                {item.identification_code}
              </span>
            )}
            <h2 className="text-lg font-extrabold text-white truncate">{item.name}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          {/* Photograph */}
          <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[16/10] flex items-center justify-center">
            {imageUrl && !imgError ? (
              <>
                <img
                  src={imageUrl}
                  alt={item.name}
                  onError={() => setImgError(true)}
                  onClick={() => setZoomPhoto(true)}
                  className="w-full h-full object-contain cursor-zoom-in"
                />
                <button
                  type="button"
                  onClick={() => setZoomPhoto(true)}
                  className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700/80 backdrop-blur-md transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Ampliar Foto</span>
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500 p-6">
                <Camera className="w-12 h-12 mb-2 opacity-40" />
                <p className="text-sm font-medium">Nenhuma fotografia anexada a este item</p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit(item);
                  }}
                  className="mt-3 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold transition-colors"
                >
                  + Adicionar fotografia agora
                </button>
              </div>
            )}
          </div>

          {/* Primary Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <Package className="w-3.5 h-3.5 text-emerald-400" />
                <span>Total na Propriedade</span>
              </div>
              <p className="mt-1 text-lg font-black text-emerald-400">
                {totalQuantity > 0 ? (
                  <>
                    {totalQuantity}{' '}
                    <span className="text-xs font-medium text-slate-400">
                      {totalQuantity === 1 ? 'unidade' : 'unidades'}
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-bold text-slate-500">Sem distribuição</span>
                )}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <Tag className="w-3.5 h-3.5 text-sky-400" />
                <span>Categoria</span>
              </div>
              <p className="mt-1 text-sm font-bold text-white truncate">
                {item.category?.name || 'Sem categoria'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Tipo de Controle</span>
              </div>
              <p className="mt-1 text-sm font-bold text-white">
                {isIndividual ? 'Item Individual' : 'Por Quantidade'}
              </p>
            </div>

            {(() => {
              const inspCfg = getInspectionTypeConfig(item.inspection_type);
              const InspIcon =
                inspCfg.iconName === 'Zap' ? Zap : inspCfg.iconName === 'Sparkles' ? Sparkles : ShieldCheck;
              return (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <InspIcon className={`w-3.5 h-3.5 ${inspCfg.badgeText}`} />
                    <span>Conferência</span>
                  </div>
                  <p className={`mt-1 text-sm font-bold truncate ${inspCfg.badgeText}`}>
                    {inspCfg.shortLabel}
                  </p>
                </div>
              );
            })()}
          </div>

          {/* DEDICATED SECTION: Distribuição por Cômodo & Estado Físico */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Home className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">
                  Distribuição por Cômodo
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">
                  {assignments.length} {assignments.length === 1 ? 'cômodo' : 'cômodos'}
                </span>
              </div>

              {!showAddDistribution && availableRoomsForAdd.length > 0 && (
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-colors shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Cômodo</span>
                </button>
              )}
            </div>

            {/* Notifications */}
            {distributionError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{distributionError}</span>
              </div>
            )}
            {distributionSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{distributionSuccess}</span>
              </div>
            )}

            {/* Add / Edit Distribution Form */}
            {showAddDistribution && (
              <form
                onSubmit={handleSaveDistribution}
                className="p-4 rounded-xl bg-slate-900 border border-emerald-500/40 space-y-3 shadow-lg"
              >
                <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                    {editingAssignment ? 'Editar Distribuição do Cômodo' : 'Distribuir em Novo Cômodo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddDistribution(false);
                      setEditingAssignment(null);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Cômodo *
                    </label>
                    {editingAssignment ? (
                      <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-bold text-white">
                        {editingAssignment.room?.name || 'Cômodo selecionado'}
                      </div>
                    ) : (
                      <select
                        value={selectedRoomId}
                        onChange={(e) => setSelectedRoomId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500"
                      >
                        {availableRoomsForAdd.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} {r.suite?.name ? `(${r.suite.name})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Quantidade no Cômodo *
                    </label>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setAssignedQuantity((q) => Math.max(1, q - 1))}
                        className="px-3 py-2 rounded-l-xl bg-slate-800 hover:bg-slate-700 text-white font-bold border border-r-0 border-slate-700"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={assignedQuantity}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setAssignedQuantity(isNaN(v) || v < 1 ? 1 : v);
                        }}
                        className="w-full px-2 py-2 bg-slate-950 border-y border-slate-700 text-center font-black text-emerald-400 text-sm focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setAssignedQuantity((q) => q + 1)}
                        className="px-3 py-2 rounded-r-xl bg-slate-800 hover:bg-slate-700 text-white font-bold border border-l-0 border-slate-700"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Condition Status Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Estado Físico / Condição neste Cômodo *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {CONDITION_OPTIONS.map((cfg) => {
                      const isSelected = assignedCondition === cfg.value;
                      return (
                        <button
                          key={cfg.value}
                          type="button"
                          onClick={() => setAssignedCondition(cfg.value)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? `${cfg.badgeBg} ${cfg.badgeBorder} shadow`
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotColor}`} />
                            <span
                              className={`text-xs font-extrabold line-clamp-1 ${
                                isSelected ? cfg.badgeText : 'text-slate-300'
                              }`}
                            >
                              {cfg.shortLabel}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-tight">
                            {cfg.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Optional Condition Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Observação sobre a Condição (Opcional)
                  </label>
                  <input
                    type="text"
                    value={assignedNotes}
                    onChange={(e) => setAssignedNotes(e.target.value)}
                    placeholder="Ex: Tecido amarelado, alça com folga, pequena mancha na lateral..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddDistribution(false);
                      setEditingAssignment(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingDistribution}
                    className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
                  >
                    {isSubmittingDistribution && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Salvar Distribuição</span>
                  </button>
                </div>
              </form>
            )}

            {/* List of Current Assignments */}
            {assignments.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-slate-800 rounded-xl p-4">
                <Boxes className="w-8 h-8 text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-300">Sem distribuição cadastrada</p>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
                  Este item existe no inventário global, mas ainda não foi alocado em nenhum cômodo.
                </p>
                {availableRoomsForAdd.length > 0 && !showAddDistribution && (
                  <button
                    type="button"
                    onClick={handleOpenAdd}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold inline-flex items-center gap-1.5 border border-emerald-500/30"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Distribuir agora</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {assignments.map((assignment) => {
                  const cond = getConditionConfig(assignment.condition_status);

                  return (
                    <div
                      key={assignment.id}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 mt-0.5">
                          <Home className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-sm text-white">
                              {assignment.room?.name || 'Cômodo'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-black text-xs">
                              {assignment.quantity}{' '}
                              {assignment.quantity === 1 ? 'unidade' : 'unidades'}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${cond.badgeBg} ${cond.badgeText} ${cond.badgeBorder}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${cond.dotColor}`} />
                              <span>{cond.label}</span>
                            </span>
                          </div>

                          {assignment.condition_notes && (
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 italic">
                              <span>Obs:</span>
                              <span className="text-slate-300">{assignment.condition_notes}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(assignment)}
                          title="Editar quantidade ou estado deste cômodo"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAssignment(assignment)}
                          title="Remover deste cômodo"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Description / Notes */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Descrição Geral do Item</span>
            </div>
            {item.description ? (
              <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {item.description}
              </p>
            ) : (
              <p className="text-sm text-slate-500 italic">
                Nenhuma descrição cadastrada para este item.
              </p>
            )}
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400">
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-slate-500">
                  Cadastrado em
                </span>
                <span className="font-semibold text-slate-300">
                  {formatDateTime(item.created_at)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-slate-500">
                  Última atualização
                </span>
                <span className="font-semibold text-slate-300">
                  {formatDateTime(item.updated_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onDelete(item);
            }}
            className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-sm font-bold flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Excluir</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(item);
              }}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Edit3 className="w-4 h-4" />
              <span>Editar Item Global</span>
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Lightbox for Photo */}
      {zoomPhoto && imageUrl && (
        <div
          onClick={() => setZoomPhoto(false)}
          className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <button
            type="button"
            onClick={() => setZoomPhoto(false)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 border border-slate-700"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={imageUrl}
            alt={item.name}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
};
