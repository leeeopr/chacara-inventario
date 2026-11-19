import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  ArrowUpDown,
  Bath,
  BedDouble,
  Check,
  CheckCircle2,
  ClipboardList,
  Compass,
  Edit3,
  Filter,
  FolderTree,
  Home,
  Info,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Unlink,
  X,
  Zap,
} from 'lucide-react';
import {
  createRoom,
  createSuite,
  deleteRoom,
  deleteSuiteAndRooms,
  fetchSuites,
  reassignItemsAndDeleteRoom,
  seedSuggestedRooms,
  unlinkSuite,
  updateRoom,
  updateRoomChecklistMode,
  updateSuite,
} from '../services/inventoryService';
import { InventoryItem, Room, RoomChecklistMode, Suite } from '../types/inventory';

interface RoomManagementModalProps {
  isOpen: boolean;
  rooms: Room[];
  items: InventoryItem[];
  onClose: () => void;
  onRoomsChanged: () => Promise<void>;
  onSelectRoomFilter: (roomId: string) => void;
  onOpenRoomOrder?: () => void;
  onOpenFloorPlan?: () => void;
  onOpenRoomCategories?: () => void;
}

// Derives clean room names from suite name (e.g. "Suíte Master" -> "Quarto Master" / "Banheiro Master")
function deriveSuiteRoomNames(rawSuiteName: string): { bedroom: string; bathroom: string } {
  const trimmed = rawSuiteName.trim();
  if (!trimmed) return { bedroom: '', bathroom: '' };

  let suffix = trimmed;
  if (/^su[ií]te\s+/i.test(trimmed)) {
    suffix = trimmed.replace(/^su[ií]te\s+/i, '');
  }

  if (/^\d+$/.test(suffix)) {
    return {
      bedroom: `Quarto Suíte ${suffix}`,
      bathroom: `Banheiro Suíte ${suffix}`,
    };
  }

  return {
    bedroom: `Quarto ${suffix}`,
    bathroom: `Banheiro ${suffix}`,
  };
}

export const RoomManagementModal: React.FC<RoomManagementModalProps> = ({
  isOpen,
  rooms,
  items,
  onClose,
  onRoomsChanged,
  onSelectRoomFilter,
  onOpenRoomOrder,
  onOpenFloorPlan,
  onOpenRoomCategories,
}) => {
  // Creation Mode: 'individual' | 'suite'
  const [creationMode, setCreationMode] = useState<'individual' | 'suite'>('individual');

  // Individual Room Form State
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomChecklistMode, setNewRoomChecklistMode] = useState<RoomChecklistMode>('standard');

  // Suite Form State
  const [suiteName, setSuiteName] = useState('');
  const [suiteBedroomName, setSuiteBedroomName] = useState('');
  const [suiteBathroomName, setSuiteBathroomName] = useState('');
  const [userEditedBedroom, setUserEditedBedroom] = useState(false);
  const [userEditedBathroom, setUserEditedBathroom] = useState(false);

  // Loaded Suites List
  const [suites, setSuites] = useState<Suite[]>([]);

  // Editing Single Room State
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Editing Suite State
  const [editingSuite, setEditingSuite] = useState<Suite | null>(null);
  const [editSuiteName, setEditSuiteName] = useState('');
  const [editBedroomName, setEditBedroomName] = useState('');
  const [editBathroomName, setEditBathroomName] = useState('');

  // Deletion States
  const [reassigningRoom, setReassigningRoom] = useState<Room | null>(null);
  const [targetRoomId, setTargetRoomId] = useState('');
  const [confirmEmptyDeleteRoom, setConfirmEmptyDeleteRoom] = useState<Room | null>(null);
  const [suiteToDelete, setSuiteToDelete] = useState<Suite | null>(null);

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load suites whenever modal opens or rooms change
  useEffect(() => {
    if (!isOpen) return;
    loadSuitesList();
  }, [isOpen, rooms]);

  const loadSuitesList = async () => {
    try {
      const data = await fetchSuites();
      setSuites(data);
    } catch {
      // Non-critical, fallback to room relations
    }
  };

  const itemStatsByRoom = useMemo(() => {
    const map: Record<string, { entries: number; totalUnits: number }> = {};
    for (const item of items) {
      if (item.room_assignments && item.room_assignments.length > 0) {
        for (const a of item.room_assignments) {
          if (a.room_id) {
            if (!map[a.room_id]) {
              map[a.room_id] = { entries: 0, totalUnits: 0 };
            }
            map[a.room_id].entries += 1;
            map[a.room_id].totalUnits += Number(a.quantity) || 1;
          }
        }
      } else if (item.room_id) {
        if (!map[item.room_id]) {
          map[item.room_id] = { entries: 0, totalUnits: 0 };
        }
        map[item.room_id].entries += 1;
        map[item.room_id].totalUnits += item.expected_quantity;
      }
    }
    return map;
  }, [items]);

  // Handle typing suite name with intelligent suggestions
  const handleSuiteNameChange = (val: string) => {
    setSuiteName(val);
    const suggestions = deriveSuiteRoomNames(val);
    if (!userEditedBedroom) {
      setSuiteBedroomName(suggestions.bedroom);
    }
    if (!userEditedBathroom) {
      setSuiteBathroomName(suggestions.bathroom);
    }
  };

  // Group rooms into Suites vs. Individual
  const { suiteGroupList, individualRooms } = useMemo(() => {
    const suiteMap = new Map<string, { suite: Suite; bedroom?: Room; bathroom?: Room; otherRooms: Room[] }>();

    // First populate from loaded suites
    for (const s of suites) {
      suiteMap.set(s.id, { suite: s, otherRooms: [] });
    }

    const individual: Room[] = [];

    for (const r of rooms) {
      if (r.suite_id) {
        if (!suiteMap.has(r.suite_id)) {
          suiteMap.set(r.suite_id, {
            suite: r.suite || { id: r.suite_id, name: 'Suíte', created_at: '', updated_at: '' },
            otherRooms: [],
          });
        }
        const group = suiteMap.get(r.suite_id)!;
        if (r.room_type === 'suite_bedroom') {
          group.bedroom = r;
        } else if (r.room_type === 'suite_bathroom') {
          group.bathroom = r;
        } else {
          group.otherRooms.push(r);
        }
      } else {
        individual.push(r);
      }
    }

    return {
      suiteGroupList: Array.from(suiteMap.values()),
      individualRooms: individual,
    };
  }, [rooms, suites]);

  if (!isOpen) return null;

  // Toggle Room Checklist Mode (Padrão <-> Rápido)
  const handleToggleChecklistMode = async (room: Room) => {
    const nextMode: RoomChecklistMode = room.checklist_mode === 'quick' ? 'standard' : 'quick';
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await updateRoomChecklistMode(room.id, nextMode);
      setSuccessMsg(
        `Modo do checklist para "${room.name}" alterado para ${
          nextMode === 'quick' ? 'Checklist Rápido (Grade 3x3)' : 'Checklist Padrão (1 a 1)'
        }.`
      );
      await onRoomsChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao alterar modo do checklist.');
    } finally {
      setIsLoading(false);
    }
  };

  // Add Individual Room
  const handleAddIndividualRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await createRoom(newRoomName, null, 'individual', null, newRoomChecklistMode);
      setNewRoomName('');
      setNewRoomChecklistMode('standard');
      setSuccessMsg('Cômodo cadastrado com sucesso!');
      await onRoomsChanged();
      await loadSuitesList();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar cômodo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Add Suite
  const handleAddSuite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suiteName.trim() || !suiteBedroomName.trim() || !suiteBathroomName.trim()) {
      setErrorMsg('Preencha o nome da suíte, do quarto e do banheiro.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await createSuite({
        suiteName: suiteName.trim(),
        bedroomName: suiteBedroomName.trim(),
        bathroomName: suiteBathroomName.trim(),
      });
      setSuiteName('');
      setSuiteBedroomName('');
      setSuiteBathroomName('');
      setUserEditedBedroom(false);
      setUserEditedBathroom(false);
      setSuccessMsg('Suíte cadastrada com sucesso (Quarto e Banheiro criados)!');
      await onRoomsChanged();
      await loadSuitesList();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar suíte.');
    } finally {
      setIsLoading(false);
    }
  };

  // Edit Single Room
  const handleSaveEdit = async (roomId: string) => {
    if (!editingName.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateRoom(roomId, editingName);
      setEditingRoomId(null);
      setEditingName('');
      setSuccessMsg('Nome do cômodo atualizado.');
      await onRoomsChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao renomear cômodo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Open Edit Suite Modal
  const handleStartEditSuite = (group: { suite: Suite; bedroom?: Room; bathroom?: Room }) => {
    setEditingSuite(group.suite);
    setEditSuiteName(group.suite.name);
    setEditBedroomName(group.bedroom?.name || '');
    setEditBathroomName(group.bathroom?.name || '');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // Save Edit Suite
  const handleSaveEditSuite = async () => {
    if (!editingSuite || !editSuiteName.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateSuite(editingSuite.id, {
        suiteName: editSuiteName.trim(),
        bedroomName: editBedroomName.trim() || undefined,
        bathroomName: editBathroomName.trim() || undefined,
      });
      setEditingSuite(null);
      setSuccessMsg('Suíte e cômodos atualizados com sucesso.');
      await onRoomsChanged();
      await loadSuitesList();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao atualizar a suíte.');
    } finally {
      setIsLoading(false);
    }
  };

  // Unlink Suite (keeps rooms as individual)
  const handleUnlinkSuite = async (suiteId: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await unlinkSuite(suiteId);
      setSuiteToDelete(null);
      setSuccessMsg('Suíte desvinculada! O quarto e o banheiro agora são cômodos individuais.');
      await onRoomsChanged();
      await loadSuitesList();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao desvincular suíte.');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Suite & Empty Rooms
  const handleDeleteSuiteAndEmptyRooms = async (suiteId: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await deleteSuiteAndRooms(suiteId);
      setSuiteToDelete(null);
      let msg = 'Suíte excluída com sucesso.';
      if (result.deletedRooms.length > 0) {
        msg += ` Cômodos vazios excluídos: ${result.deletedRooms.join(', ')}.`;
      }
      if (result.preservedRooms.length > 0) {
        msg += ` Cômodos com itens mantidos como individuais: ${result.preservedRooms.join(', ')}.`;
      }
      setSuccessMsg(msg);
      await onRoomsChanged();
      await loadSuitesList();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir suíte.');
    } finally {
      setIsLoading(false);
    }
  };

  // Single Room Delete Trigger
  const handleInitiateDelete = (room: Room) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const stats = itemStatsByRoom[room.id] || { entries: 0, totalUnits: 0 };
    if (stats.entries > 0) {
      const otherRooms = rooms.filter((r) => r.id !== room.id);
      setTargetRoomId(otherRooms[0]?.id || '');
      setReassigningRoom(room);
      setConfirmEmptyDeleteRoom(null);
    } else {
      setConfirmEmptyDeleteRoom(room);
      setReassigningRoom(null);
    }
  };

  // Confirm Single Room Delete (Empty)
  const handleConfirmEmptyDelete = async () => {
    if (!confirmEmptyDeleteRoom) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await deleteRoom(confirmEmptyDeleteRoom.id);
      setSuccessMsg(`Cômodo "${confirmEmptyDeleteRoom.name}" excluído com sucesso.`);
      setConfirmEmptyDeleteRoom(null);
      await onRoomsChanged();
      await loadSuitesList();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir cômodo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reassign Items & Delete Single Room
  const handleReassignAndDelete = async () => {
    if (!reassigningRoom || !targetRoomId) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await reassignItemsAndDeleteRoom(reassigningRoom.id, targetRoomId);
      setSuccessMsg(`Itens transferidos e cômodo "${reassigningRoom.name}" excluído com sucesso.`);
      setReassigningRoom(null);
      setTargetRoomId('');
      await onRoomsChanged();
      await loadSuitesList();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao transferir itens e excluir cômodo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Seed Suggested Default Rooms
  const handleSeedRooms = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await seedSuggestedRooms(rooms);
      setSuccessMsg('Cômodos sugeridos cadastrados com sucesso!');
      await onRoomsChanged();
      await loadSuitesList();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao cadastrar cômodos sugeridos.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">Gerenciar Cômodos & Suítes</h2>
              <p className="text-xs text-slate-400">
                Cadastre cômodos individuais ou agrupe quartos e banheiros em suítes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenFloorPlan && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFloorPlan();
                }}
                className="px-3 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-300 hover:bg-teal-500/20 text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Abrir Planta da Chácara"
              >
                <Compass className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden sm:inline">Planta</span>
              </button>
            )}

            {onOpenRoomCategories && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRoomCategories();
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Gerenciar Categorias de Cômodos"
              >
                <FolderTree className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">Categorias</span>
              </button>
            )}

            {onOpenRoomOrder && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRoomOrder();
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Configurar Ordem dos Cômodos no Checklist"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Ordem no Checklist</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Classification Control: Individual vs Suite */}
          <div className="bg-slate-950 p-1.5 rounded-2xl border border-slate-800 flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setCreationMode('individual');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                creationMode === 'individual'
                  ? 'bg-slate-800 text-white shadow-md border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-4 h-4 text-emerald-400" />
              <span>Cômodo Individual</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCreationMode('suite');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                creationMode === 'suite'
                  ? 'bg-purple-950/70 text-purple-200 shadow-md border border-purple-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BedDouble className="w-4 h-4 text-purple-400" />
              <span>Suíte (Quarto + Banheiro)</span>
            </button>
          </div>

          {/* Creation Forms */}
          {creationMode === 'individual' ? (
            /* A. Individual Room Form */
            <form onSubmit={handleAddIndividualRoom} className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Nome do Cômodo
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Ex: Cozinha, Sala de Estar, Área da Piscina..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !newRoomName.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-sm flex items-center gap-1.5 shrink-0 transition-all shadow-md"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-900">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                  <span>Modo de Inspeção no Checklist:</span>
                </span>
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setNewRoomChecklistMode('standard')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      newRoomChecklistMode === 'standard'
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    <span>Padrão (1 a 1)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRoomChecklistMode('quick')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      newRoomChecklistMode === 'quick'
                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Rápido (Grade 3x3)</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            /* B. Suite Registration Flow */
            <form onSubmit={handleAddSuite} className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-purple-200">
                    Cadastrar Nova Suíte
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-purple-300/80 bg-purple-500/15 px-2 py-0.5 rounded-md border border-purple-500/30">
                  Cria 1 Quarto + 1 Banheiro vinculados
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nome da Suíte *
                </label>
                <input
                  type="text"
                  value={suiteName}
                  onChange={(e) => handleSuiteNameChange(e.target.value)}
                  placeholder="Ex: Suíte Master, Suíte 1, Suíte dos Hóspedes..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-purple-500/40 focus:border-purple-400 focus:outline-none text-sm text-white placeholder-slate-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <BedDouble className="w-3.5 h-3.5 text-purple-400" />
                    <span>Nome do Quarto *</span>
                  </label>
                  <input
                    type="text"
                    value={suiteBedroomName}
                    onChange={(e) => {
                      setSuiteBedroomName(e.target.value);
                      setUserEditedBedroom(true);
                    }}
                    placeholder="Ex: Quarto Master"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-purple-400 focus:outline-none text-sm text-white placeholder-slate-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Bath className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Nome do Banheiro *</span>
                  </label>
                  <input
                    type="text"
                    value={suiteBathroomName}
                    onChange={(e) => {
                      setSuiteBathroomName(e.target.value);
                      setUserEditedBathroom(true);
                    }}
                    placeholder="Ex: Banheiro Suíte Master"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-purple-400 focus:outline-none text-sm text-white placeholder-slate-500 font-medium"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-snug">
                O quarto e o banheiro serão criados como ambientes individuais no inventário e no checklist, permitindo inspeções e contagens independentes, porém logicamente agrupados nesta suíte.
              </p>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isLoading || !suiteName.trim() || !suiteBedroomName.trim() || !suiteBathroomName.trim()}
                  className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-slate-950 font-black text-sm flex items-center gap-1.5 transition-all shadow-md shadow-purple-500/20"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>Criar Suíte e Cômodos</span>
                </button>
              </div>
            </form>
          )}

          {/* Edit Suite Modal / Section */}
          {editingSuite && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-purple-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-extrabold text-purple-300 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-purple-400" />
                  <span>Editar Suíte: {editingSuite.name}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setEditingSuite(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nome da Suíte
                </label>
                <input
                  type="text"
                  value={editSuiteName}
                  onChange={(e) => setEditSuiteName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Nome do Quarto
                  </label>
                  <input
                    type="text"
                    value={editBedroomName}
                    onChange={(e) => setEditBedroomName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Nome do Banheiro
                  </label>
                  <input
                    type="text"
                    value={editBathroomName}
                    onChange={(e) => setEditBathroomName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingSuite(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditSuite}
                  disabled={isLoading || !editSuiteName.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-slate-950 text-xs font-black"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          )}

          {/* Delete Suite Dialog (2 Options) */}
          {suiteToDelete && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-extrabold text-rose-300">
                    Excluir ou Desvincular Suíte: "{suiteToDelete.name}"
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Escolha como deseja proceder com esta suíte e seus cômodos associados:
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {/* Option 1: Unlink Only */}
                <button
                  type="button"
                  onClick={() => handleUnlinkSuite(suiteToDelete.id)}
                  disabled={isLoading}
                  className="p-3 rounded-xl bg-slate-950/80 border border-slate-700 hover:border-slate-500 text-left transition-all space-y-1"
                >
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-300">
                    <Unlink className="w-4 h-4 text-amber-400" />
                    <span>1. Apenas Desvincular</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Remove apenas a suíte. O quarto e o banheiro permanecem no sistema como cômodos individuais normais com seus itens.
                  </p>
                </button>

                {/* Option 2: Delete Suite & Empty Rooms */}
                <button
                  type="button"
                  onClick={() => handleDeleteSuiteAndEmptyRooms(suiteToDelete.id)}
                  disabled={isLoading}
                  className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 hover:border-rose-400 text-left transition-all space-y-1"
                >
                  <div className="flex items-center gap-1.5 text-xs font-black text-rose-300">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>2. Excluir Suíte e Cômodos Vazios</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Exclui a suíte e qualquer cômodo que não tenha itens. Cômodos com itens serão preservados automaticamente como individuais.
                  </p>
                </button>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSuiteToDelete(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Reassignment Dialog if deleting room with items */}
          {reassigningRoom && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-start gap-2.5">
                <ArrowRightLeft className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-extrabold text-amber-300">
                    Transferir Itens antes de Excluir: "{reassigningRoom.name}"
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Este cômodo possui{' '}
                    <strong>{itemStatsByRoom[reassigningRoom.id]?.entries || 0} item(ns)</strong>{' '}
                    registrado(s). Selecione o cômodo de destino para os itens antes da exclusão:
                  </p>
                </div>
              </div>

              {rooms.filter((r) => r.id !== reassigningRoom.id).length === 0 ? (
                <p className="text-xs text-rose-300 font-semibold">
                  Crie outro cômodo primeiro para poder transferir os itens deste ambiente.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <select
                    value={targetRoomId}
                    onChange={(e) => setTargetRoomId(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-sm text-white focus:outline-none"
                  >
                    {rooms
                      .filter((r) => r.id !== reassigningRoom.id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          Transferir para: {r.name}
                        </option>
                      ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReassigningRoom(null)}
                      className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleReassignAndDelete}
                      disabled={isLoading || !targetRoomId}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors"
                    >
                      Transferir e Excluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Confirm Delete Empty Room */}
          {confirmEmptyDeleteRoom && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-slate-200">
                Tem certeza que deseja excluir o cômodo vazio{' '}
                <strong className="text-white">"{confirmEmptyDeleteRoom.name}"</strong>?
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmEmptyDeleteRoom(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmEmptyDelete}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </div>
          )}

          {/* Room List - Grouped View */}
          {rooms.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-800 rounded-2xl p-6">
              <Home className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-300">Nenhum cômodo cadastrado ainda</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Adicione individualmente, cadastre uma suíte ou carregue a lista padrão de chácara.
              </p>
              <button
                type="button"
                onClick={handleSeedRooms}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs font-bold inline-flex items-center gap-2 transition-colors"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Criar Cômodos Sugeridos (Cozinha, Quartos, Piscina...)</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>{rooms.length} ambiente(s) registrado(s)</span>
                <button
                  type="button"
                  onClick={handleSeedRooms}
                  disabled={isLoading}
                  className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Completar sugeridos</span>
                </button>
              </div>

              {/* 1. SUITES SECTION */}
              {suiteGroupList.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <BedDouble className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-purple-300">
                      Suítes Cadastradas ({suiteGroupList.length})
                    </h3>
                  </div>

                  {suiteGroupList.map((group) => {
                    const suiteRooms = [group.bedroom, group.bathroom, ...group.otherRooms].filter(
                      Boolean
                    ) as Room[];

                    return (
                      <div
                        key={group.suite.id}
                        className="rounded-2xl bg-purple-950/15 border border-purple-500/30 p-3.5 space-y-3 shadow-md"
                      >
                        {/* Suite Parent Header */}
                        <div className="flex items-center justify-between gap-3 border-b border-purple-500/20 pb-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-[11px] font-black text-purple-300 border border-purple-500/40 uppercase">
                              Suíte
                            </span>
                            <span className="font-black text-base text-white truncate">
                              {group.suite.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEditSuite(group)}
                              title="Editar suíte e nomes dos cômodos"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUnlinkSuite(group.suite.id)}
                              title="Desvincular suíte (mantém cômodos individuais)"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                            >
                              <Unlink className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSuiteToDelete(group.suite)}
                              title="Excluir suíte"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Associated Rooms Inside Suite */}
                        <div className="space-y-2 pl-1 sm:pl-2">
                          {suiteRooms.map((room) => {
                            const stats = itemStatsByRoom[room.id] || { entries: 0, totalUnits: 0 };
                            const isEditingThis = editingRoomId === room.id;
                            const isBedroom = room.room_type === 'suite_bedroom';
                            const isBathroom = room.room_type === 'suite_bathroom';

                            return (
                              <div
                                key={room.id}
                                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-between gap-3"
                              >
                                {isEditingThis ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <input
                                      type="text"
                                      value={editingName}
                                      onChange={(e) => setEditingName(e.target.value)}
                                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-emerald-500 text-sm text-white focus:outline-none"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEdit(room.id)}
                                      disabled={isLoading}
                                      className="p-1.5 rounded-lg bg-emerald-500 text-slate-950"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingRoomId(null)}
                                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      <div
                                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                          isBedroom
                                            ? 'bg-purple-500/20 text-purple-400'
                                            : isBathroom
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'bg-slate-800 text-slate-400'
                                        }`}
                                      >
                                        {isBedroom ? (
                                          <BedDouble className="w-4 h-4" />
                                        ) : isBathroom ? (
                                          <Bath className="w-4 h-4" />
                                        ) : (
                                          <Home className="w-4 h-4" />
                                        )}
                                      </div>

                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-sm text-white truncate">
                                            {room.name}
                                          </span>
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300">
                                            {isBedroom ? 'Quarto' : isBathroom ? 'Banheiro' : 'Ambiente'}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                          {stats.entries} {stats.entries === 1 ? 'item' : 'itens'} ({stats.totalUnits} un.)
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleChecklistMode(room)}
                                        title={
                                          room.checklist_mode === 'quick'
                                            ? 'Modo Rápido ativo. Clique para alternar para Padrão.'
                                            : 'Modo Padrão ativo. Clique para alternar para Rápido.'
                                        }
                                        className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                                          room.checklist_mode === 'quick'
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                            : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                                        }`}
                                      >
                                        {room.checklist_mode === 'quick' ? (
                                          <>
                                            <Zap className="w-3 h-3 text-amber-400" />
                                            <span>Rápido</span>
                                          </>
                                        ) : (
                                          <>
                                            <ClipboardList className="w-3 h-3 text-slate-400" />
                                            <span>Padrão</span>
                                          </>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onSelectRoomFilter(room.id);
                                          onClose();
                                        }}
                                        title="Filtrar inventário"
                                        className="px-2 py-1 rounded-lg text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-1"
                                      >
                                        <Filter className="w-3 h-3" />
                                        <span className="hidden sm:inline">Filtrar</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingRoomId(room.id);
                                          setEditingName(room.name);
                                        }}
                                        title="Renomear cômodo"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleInitiateDelete(room)}
                                        title="Excluir este cômodo da suíte"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2. INDIVIDUAL ROOMS SECTION */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Home className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Cômodos Individuais ({individualRooms.length})
                  </h3>
                </div>

                {individualRooms.map((room) => {
                  const stats = itemStatsByRoom[room.id] || { entries: 0, totalUnits: 0 };
                  const isEditingThis = editingRoomId === room.id;

                  return (
                    <div
                      key={room.id}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-between gap-3"
                    >
                      {isEditingThis ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-emerald-500 text-sm text-white focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(room.id)}
                            disabled={isLoading}
                            className="p-2 rounded-lg bg-emerald-500 text-slate-950"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRoomId(null)}
                            className="p-2 rounded-lg bg-slate-800 text-slate-400"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white truncate">
                                {room.name}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-semibold text-slate-300">
                                {stats.entries} {stats.entries === 1 ? 'registro' : 'registros'} ({stats.totalUnits} un.)
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleChecklistMode(room)}
                              title={
                                room.checklist_mode === 'quick'
                                  ? 'Modo Rápido ativo. Clique para alternar para Padrão.'
                                  : 'Modo Padrão ativo. Clique para alternar para Rápido.'
                              }
                              className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                                room.checklist_mode === 'quick'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                              }`}
                            >
                              {room.checklist_mode === 'quick' ? (
                                <>
                                  <Zap className="w-3 h-3 text-amber-400" />
                                  <span>Rápido</span>
                                </>
                              ) : (
                                <>
                                  <ClipboardList className="w-3 h-3 text-slate-400" />
                                  <span>Padrão</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectRoomFilter(room.id);
                                onClose();
                              }}
                              title="Filtrar inventário por este cômodo"
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-1 transition-colors"
                            >
                              <Filter className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Filtrar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingRoomId(room.id);
                                setEditingName(room.name);
                              }}
                              title="Renomear cômodo"
                              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleInitiateDelete(room)}
                              title="Excluir cômodo"
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/95 flex justify-end shrink-0">
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
