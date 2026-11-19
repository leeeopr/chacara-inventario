import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { registerBackHandler, setRootBackAction } from './lib/backNavigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpDown,
  Boxes,
  Camera,
  CheckCircle2,
  ClipboardList,
  Compass,
  Database,
  Edit3,
  Eye,
  Filter,
  FolderTree,
  Hash,
  Home,
  LayoutGrid,
  Layers,
  List,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { BulkPhotoUploadModal } from './components/BulkPhotoUploadModal';
import { CategoryManagementModal } from './components/CategoryManagementModal';
import { ChecklistHistoryModal } from './components/ChecklistHistoryModal';
import { CodePrefixesModal } from './components/CodePrefixesModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DiscreetAdminDrawer } from './components/DiscreetAdminDrawer';
import { FloorPlanModal } from './components/FloorPlanModal';
import { InventoryItemCard } from './components/InventoryItemCard';
import { InventoryItemDetailModal } from './components/InventoryItemDetailModal';
import { InventoryItemFormModal } from './components/InventoryItemFormModal';
import { OtaSettingsModal } from './components/OtaSettingsModal';
import { OtaUpdateModal } from './components/OtaUpdateModal';
import { QuickRoomInspection } from './components/QuickRoomInspection';
import { RoomCategoryManagementModal } from './components/RoomCategoryManagementModal';
import { RoomManagementModal } from './components/RoomManagementModal';
import { RoomOrderManagementModal } from './components/RoomOrderManagementModal';
import { PreChecklistConfigModal } from './components/PreChecklistConfigModal';
import { PreChecklistExecutionModal } from './components/PreChecklistExecutionModal';
import { SeniorChecklistMain } from './components/SeniorChecklistMain';
import { SeniorRoomInspection } from './components/SeniorRoomInspection';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { VisualAccessibilityModal } from './components/VisualAccessibilityModal';
import { getInventoryImageUrl, isSupabaseConfigured } from './lib/supabase';
import { checkForUpdate } from './services/otaUpdateService';
import {
  fetchPreChecklistActions,
  fetchPreChecklistCompletions,
  togglePreChecklistCompletion,
} from './services/preChecklistService';
import { UpdateInfo } from './types/ota';
import { PreChecklistAction } from './types/preChecklist';
import {
  finalizeChecklistSession,
  getOrCreateActiveChecklistSession,
  markRoomCompleted,
  recordItemInspection,
} from './services/checklistService';
import {
  deleteInventoryItem,
  fetchCategories,
  fetchFloorPlanShapes,
  fetchInventoryItems,
  fetchRoomCategories,
  fetchRooms,
  getItemsForRoom,
  seedSuggestedCategories,
  seedSuggestedRooms,
} from './services/inventoryService';
import {
  ChecklistItemResult,
  ChecklistOccurrence,
  ChecklistRoomProgress,
  ChecklistSession,
} from './types/checklist';
import {
  FloorPlanShape,
  InventoryCategory,
  InventoryFilters,
  InventoryItem,
  Room,
  RoomCategory,
} from './types/inventory';

export function App() {
  // Navigation: Primary entry point is always 'checklist_main'
  const [appScreen, setAppScreen] = useState<
    'checklist_main' | 'room_inspection' | 'admin_inventory'
  >('checklist_main');

  // Currently inspected room
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);

  // Database entities
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomCategories, setRoomCategories] = useState<RoomCategory[]>([]);
  const [floorPlanShapes, setFloorPlanShapes] = useState<FloorPlanShape[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  // Checklist Session State
  const [activeSession, setActiveSession] = useState<ChecklistSession | null>(null);
  const [roomProgressList, setRoomProgressList] = useState<ChecklistRoomProgress[]>([]);
  const [itemResults, setItemResults] = useState<ChecklistItemResult[]>([]);
  const [occurrences, setOccurrences] = useState<ChecklistOccurrence[]>([]);

  // UI & Feedback states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [supabaseReady, setSupabaseReady] = useState<boolean>(() => isSupabaseConfigured());

  // Modals state
  const [isAdminDrawerOpen, setIsAdminDrawerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [isBulkPhotoUploadOpen, setIsBulkPhotoUploadOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [isDeletingLoading, setIsDeletingLoading] = useState(false);

  const [isRoomsModalOpen, setIsRoomsModalOpen] = useState(false);
  const [isRoomOrderModalOpen, setIsRoomOrderModalOpen] = useState(false);
  const [isFloorPlanModalOpen, setIsFloorPlanModalOpen] = useState(false);
  const [isRoomCategoriesModalOpen, setIsRoomCategoriesModalOpen] = useState(false);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [isPrefixesModalOpen, setIsPrefixesModalOpen] = useState(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  // Visual Accessibility State
  const [isVisualScaleModalOpen, setIsVisualScaleModalOpen] = useState(false);

  // Pre-Checklist Actions and Execution State
  const [preChecklistActions, setPreChecklistActions] = useState<PreChecklistAction[]>([]);
  const [preChecklistCompletions, setPreChecklistCompletions] = useState<Set<string>>(new Set());
  const [isPreChecklistConfigOpen, setIsPreChecklistConfigOpen] = useState(false);
  const [isPreChecklistExecutionOpen, setIsPreChecklistExecutionOpen] = useState(false);

  // OTA Updates State
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [isOtaModalOpen, setIsOtaModalOpen] = useState(false);
  const [isOtaSettingsModalOpen, setIsOtaSettingsModalOpen] = useState(false);

  // Inventory Filter & Search state (for Admin View)
  const [filters, setFilters] = useState<InventoryFilters>({
    search: '',
    roomId: 'all',
    categoryId: 'all',
    inventoryType: 'all',
    status: 'all',
    sortBy: 'newest',
  });

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  // Register Android Hardware Back Button and Gesture Handler for App modals and secondary screens
  useEffect(() => {
    const unregister = registerBackHandler('AppModalsAndScreens', 10, () => {
      // 1. Modals & Dialogs (Priority order)
      if (isPreChecklistExecutionOpen) {
        setIsPreChecklistExecutionOpen(false);
        return true;
      }
      if (isBulkPhotoUploadOpen) {
        setIsBulkPhotoUploadOpen(false);
        return true;
      }
      if (isPreChecklistConfigOpen) {
        setIsPreChecklistConfigOpen(false);
        return true;
      }
      if (isVisualScaleModalOpen) {
        setIsVisualScaleModalOpen(false);
        return true;
      }
      if (selectedDetailItem) {
        setSelectedDetailItem(null);
        return true;
      }
      if (deletingItem) {
        setDeletingItem(null);
        return true;
      }
      if (isAdminDrawerOpen) {
        setIsAdminDrawerOpen(false);
        return true;
      }
      if (isHistoryModalOpen) {
        setIsHistoryModalOpen(false);
        return true;
      }
      if (isFloorPlanModalOpen) {
        setIsFloorPlanModalOpen(false);
        return true;
      }
      if (isRoomsModalOpen) {
        setIsRoomsModalOpen(false);
        return true;
      }
      if (isRoomOrderModalOpen) {
        setIsRoomOrderModalOpen(false);
        return true;
      }
      if (isRoomCategoriesModalOpen) {
        setIsRoomCategoriesModalOpen(false);
        return true;
      }
      if (isCategoriesModalOpen) {
        setIsCategoriesModalOpen(false);
        return true;
      }
      if (isPrefixesModalOpen) {
        setIsPrefixesModalOpen(false);
        return true;
      }
      if (isSupabaseModalOpen) {
        setIsSupabaseModalOpen(false);
        return true;
      }
      if (isOtaModalOpen) {
        setIsOtaModalOpen(false);
        return true;
      }
      if (isOtaSettingsModalOpen) {
        setIsOtaSettingsModalOpen(false);
        return true;
      }

      // 2. Secondary screen navigation (e.g. Admin Inventory -> Checklist Main)
      if (appScreen === 'admin_inventory') {
        setAppScreen('checklist_main');
        return true;
      }

      return false;
    });

    return unregister;
  }, [
    isPreChecklistExecutionOpen,
    isBulkPhotoUploadOpen,
    isPreChecklistConfigOpen,
    isVisualScaleModalOpen,
    selectedDetailItem,
    deletingItem,
    isAdminDrawerOpen,
    isHistoryModalOpen,
    isFloorPlanModalOpen,
    isRoomsModalOpen,
    isRoomOrderModalOpen,
    isRoomCategoriesModalOpen,
    isCategoriesModalOpen,
    isPrefixesModalOpen,
    isSupabaseModalOpen,
    isOtaModalOpen,
    isOtaSettingsModalOpen,
    appScreen,
  ]);

  // Root screen exit protection (double back tap within 2.5s to exit app from main checklist screen)
  const lastBackPressRef = useRef<number>(0);

  useEffect(() => {
    setRootBackAction(() => {
      const now = Date.now();
      if (now - lastBackPressRef.current < 2500) {
        try {
          CapApp.exitApp();
        } catch {
          // In standard web browser fallback
        }
      } else {
        lastBackPressRef.current = now;
        showToast('Pressione novamente para sair do aplicativo');
      }
    });

    return () => {
      setRootBackAction(null);
    };
  }, [showToast]);

  // Load inventory items, rooms, categories and active checklist session
  const loadAllData = useCallback(async () => {
    const configured = isSupabaseConfigured();
    setSupabaseReady(configured);
    setIsLoading(true);
    setErrorMsg(null);

    try {
      let loadedRooms: Room[] = [];
      let loadedRoomCategories: RoomCategory[] = [];
      let loadedShapes: FloorPlanShape[] = [];
      let loadedCategories: InventoryCategory[] = [];
      let loadedItems: InventoryItem[] = [];

      if (configured) {
        [loadedRooms, loadedRoomCategories, loadedShapes, loadedCategories, loadedItems] =
          await Promise.all([
            fetchRooms().catch(() => []),
            fetchRoomCategories().catch(() => []),
            fetchFloorPlanShapes().catch(() => []),
            fetchCategories().catch(() => []),
            fetchInventoryItems().catch(() => []),
          ]);
      }

      setRooms(loadedRooms);
      setRoomCategories(loadedRoomCategories);
      setFloorPlanShapes(loadedShapes);
      setCategories(loadedCategories);
      setItems(loadedItems);
      setSelectedDetailItem((curr) => {
        if (!curr) return null;
        return loadedItems.find((it) => it.id === curr.id) || curr;
      });

      // Load or resume active checklist session
      const sessionDetail = await getOrCreateActiveChecklistSession(loadedRooms);
      setActiveSession(sessionDetail.session);
      setRoomProgressList(sessionDetail.roomProgressList);
      setItemResults(sessionDetail.itemResults);
      setOccurrences(sessionDetail.occurrences);

      // Load pre-checklist actions & completions safely (never blocks app loading)
      try {
        const actions = await fetchPreChecklistActions(loadedItems);
        setPreChecklistActions(actions || []);
        if (sessionDetail.session?.id && actions && actions.length > 0) {
          const completions = await fetchPreChecklistCompletions(sessionDetail.session.id);
          setPreChecklistCompletions(completions || new Set());
        } else {
          setPreChecklistCompletions(new Set());
        }
      } catch (preErr) {
        // Supabase table may not exist yet or offline; pre-checklist is optional
        setPreChecklistActions([]);
        setPreChecklistCompletions(new Set());
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao sincronizar dados.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Check for OTA updates silently in the background on startup
  useEffect(() => {
    checkForUpdate(false)
      .then((info) => {
        if (info && info.hasUpdate) {
          setAvailableUpdate(info);
          setIsOtaModalOpen(true);
        }
      })
      .catch(() => {
        // Silent failure in background
      });
  }, []);

  // Map of room progress for quick lookup
  const roomProgressMap = useMemo(() => {
    const map = new Map<string, ChecklistRoomProgress>();
    for (const p of roomProgressList) {
      if (p.room_id) {
        map.set(p.room_id, p);
      }
    }
    return map;
  }, [roomProgressList]);

  // Set of completed room IDs
  const completedRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of roomProgressList) {
      if (p.room_id && p.status === 'completed') {
        set.add(p.room_id);
      }
    }
    return set;
  }, [roomProgressList]);

  // Start a fresh new checklist inspection session
  const handleStartNewInspection = async () => {
    setIsLoading(true);
    try {
      const newSessionDetail = await getOrCreateActiveChecklistSession(rooms, true);
      setActiveSession(newSessionDetail.session);
      setRoomProgressList(newSessionDetail.roomProgressList);
      setItemResults(newSessionDetail.itemResults);
      setOccurrences(newSessionDetail.occurrences);
      setPreChecklistCompletions(new Set());
      setActiveRoom(null);
      setAppScreen('checklist_main');
      showToast('Nova vistoria iniciada com sucesso!');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao iniciar nova vistoria.');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle pre-checklist equipment completion status
  const handleTogglePreChecklistAction = async (actionId: string, isCompleted: boolean) => {
    if (!activeSession) return;
    // Optimistic UI update
    setPreChecklistCompletions((prev) => {
      const next = new Set(prev);
      if (isCompleted) next.add(actionId);
      else next.delete(actionId);
      return next;
    });

    try {
      await togglePreChecklistCompletion(activeSession.id, actionId, isCompleted);
    } catch (err: any) {
      console.error('Failed to toggle pre-checklist completion:', err);
      // Revert optimistic update on failure
      setPreChecklistCompletions((prev) => {
        const next = new Set(prev);
        if (isCompleted) next.delete(actionId);
        else next.add(actionId);
        return next;
      });
      showToast('Erro ao atualizar preparação do equipamento.');
    }
  };

  // Seed default rooms if none exist
  const handleSeedRooms = async () => {
    setIsLoading(true);
    try {
      const [seededRooms, seededCats] = await Promise.all([
        seedSuggestedRooms(rooms),
        seedSuggestedCategories(categories),
      ]);
      setRooms(seededRooms);
      setCategories(seededCats);
      await loadAllData();
      showToast('Cômodos padrão criados com sucesso!');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar cômodos padrão.');
    } finally {
      setIsLoading(false);
    }
  };

  // Record item inspection during guided room walkthrough
  const handleRecordInspection = async (params: {
    item: InventoryItem;
    status: 'found' | 'missing' | 'damaged';
    foundQuantity: number;
    notes?: string | null;
    occurrenceType?: 'missing' | 'damaged' | null;
    missingQuantity?: number;
    occurrenceDescription?: string | null;
    inspectionTypeSnapshot?: InspectionType | null;
    inspectionAnswers?: Record<string, boolean> | null;
    failedQuestion?: string | null;
  }) => {
    if (!activeSession) return;

    const { result, occurrence } = await recordItemInspection({
      sessionId: activeSession.id,
      ...params,
    });

    setItemResults((prev) => {
      const idx = prev.findIndex(
        (r) =>
          r.checklist_session_id === activeSession.id &&
          r.inventory_item_id === params.item.id
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = result;
        return copy;
      }
      return [...prev, result];
    });

    if (occurrence) {
      setOccurrences((prev) => [...prev, occurrence]);
    }
  };

  // Complete a single room
  const handleCompleteRoom = async (roomId: string) => {
    if (!activeSession) return;
    const updated = await markRoomCompleted(activeSession.id, roomId);
    setRoomProgressList((prev) => {
      const idx = prev.findIndex(
        (p) => p.checklist_session_id === activeSession.id && p.room_id === roomId
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [...prev, updated];
    });
  };

  // Finalize entire inspection session
  const handleCompleteAllChecklist = async () => {
    if (!activeSession) return;
    await finalizeChecklistSession(activeSession.id);
    setActiveRoom(null);
    setAppScreen('checklist_main');
    showToast('🎉 Vistoria finalizada com sucesso!');
  };

  // Inventory filtering & metrics for Admin View
  const filteredItems = useMemo(() => {
    const q = filters.search.trim().toLowerCase();

    const list = items.filter((item) => {
      if (filters.status && filters.status !== 'all') {
        const itemStatus = item.status || 'completed';
        if (itemStatus !== filters.status) return false;
      }
      if (filters.roomId !== 'all') {
        const matchesDirect = item.room_id === filters.roomId;
        const matchesAssignment = item.room_assignments?.some((a) => a.room_id === filters.roomId);
        if (!matchesDirect && !matchesAssignment) return false;
      }
      if (filters.categoryId === 'uncategorized') {
        if (item.category_id) return false;
      } else if (filters.categoryId !== 'all' && item.category_id !== filters.categoryId) {
        return false;
      }
      if (filters.inventoryType !== 'all' && item.inventory_type !== filters.inventoryType) {
        return false;
      }
      if (q) {
        const matchName = item.name.toLowerCase().includes(q);
        const matchCode = item.identification_code?.toLowerCase().includes(q) || false;
        const matchDesc = item.description?.toLowerCase().includes(q) || false;
        const matchRoom = item.room?.name.toLowerCase().includes(q) || false;
        const matchCat = item.category?.name.toLowerCase().includes(q) || false;
        const matchAssignment = item.room_assignments?.some((a) =>
          a.room?.name.toLowerCase().includes(q)
        ) || false;
        return matchName || matchCode || matchDesc || matchRoom || matchCat || matchAssignment;
      }
      return true;
    });

    return list.sort((a, b) => {
      switch (filters.sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name, 'pt-BR');
        case 'code_asc':
          return (a.identification_code || 'ZZZZ').localeCompare(
            b.identification_code || 'ZZZZ',
            'pt-BR',
            { numeric: true }
          );
        case 'room_asc':
          return (a.room?.name || '').localeCompare(b.room?.name || '', 'pt-BR');
        case 'quantity_desc':
          return (b.total_quantity ?? b.expected_quantity) - (a.total_quantity ?? a.expected_quantity);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [items, filters]);

  const metrics = useMemo(() => {
    let totalPhysicalUnits = 0;
    let individualCount = 0;
    let quantityBasedCount = 0;
    let pendingCount = 0;

    for (const it of items) {
      if (it.status === 'pending_information') {
        pendingCount += 1;
      } else {
        totalPhysicalUnits += it.total_quantity ?? it.expected_quantity;
        if (it.inventory_type === 'individual') individualCount += 1;
        else quantityBasedCount += 1;
      }
    }

    return {
      totalEntries: items.length,
      completedEntries: items.length - pendingCount,
      totalPhysicalUnits,
      individualCount,
      quantityBasedCount,
      pendingCount,
    };
  }, [items]);

  const countByRoom = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      // Pending draft items must NOT be counted in room metrics or checklists
      if (item.status === 'pending_information') continue;

      if (item.room_assignments && item.room_assignments.length > 0) {
        for (const a of item.room_assignments) {
          if (a.room_id) {
            map[a.room_id] = (map[a.room_id] || 0) + 1;
          }
        }
      } else if (item.room_id) {
        map[item.room_id] = (map[item.room_id] || 0) + 1;
      }
    }
    return map;
  }, [items]);

  const handleConfirmDeleteItem = async () => {
    if (!deletingItem) return;
    setIsDeletingLoading(true);
    try {
      await deleteInventoryItem(deletingItem);
      setItems((prev) => prev.filter((it) => it.id !== deletingItem.id));
      if (selectedDetailItem?.id === deletingItem.id) {
        setSelectedDetailItem(null);
      }
      showToast(`Item "${deletingItem.name}" excluído.`);
      setDeletingItem(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir item.');
      setDeletingItem(null);
    } finally {
      setIsDeletingLoading(false);
    }
  };

  const handleItemSaved = (savedItems: InventoryItem[], keepOpen: boolean) => {
    if (editingItem) {
      const updated = savedItems[0];
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      if (selectedDetailItem?.id === updated.id) {
        setSelectedDetailItem(updated);
      }
      showToast(`Item "${updated.name}" atualizado!`);
    } else {
      setItems((prev) => [...savedItems, ...prev]);
      showToast(
        savedItems.length > 1
          ? `${savedItems.length} itens cadastrados!`
          : `Item "${savedItems[0].name}" cadastrado!`
      );
    }

    if (!keepOpen) {
      setIsItemFormOpen(false);
      setEditingItem(null);
    }
  };

  // Toast feedback
  const toastNotification = toastMsg && (
    <div className="fixed bottom-6 right-4 z-50 max-w-sm rounded-2xl bg-emerald-500 text-slate-950 px-4 py-3 shadow-2xl flex items-center gap-2.5 font-black text-sm">
      <CheckCircle2 className="w-5 h-5 shrink-0" />
      <span>{toastMsg}</span>
    </div>
  );

  // 1. SCREEN: Room Inspection (Quick 3x3 Grid or Standard Guided 1-by-1)
  if (appScreen === 'room_inspection' && activeRoom && activeSession) {
    const roomItems = getItemsForRoom(items, activeRoom.id);
    const isQuickMode = activeRoom.checklist_mode === 'quick';

    const pendingRoomPreActions = preChecklistActions.filter(
      (a) =>
        a.is_active &&
        (a.room_id === activeRoom.id ||
          (a.room_name &&
            a.room_name.trim().toLowerCase() === activeRoom.name.trim().toLowerCase())) &&
        !preChecklistCompletions.has(a.id)
    );

    return (
      <>
        {isQuickMode ? (
          <QuickRoomInspection
            room={activeRoom}
            roomItems={roomItems}
            sessionId={activeSession.id}
            itemResults={itemResults}
            allRooms={rooms}
            completedRoomIds={completedRoomIds}
            pendingRoomPreActions={pendingRoomPreActions}
            onOpenPreChecklist={() => setIsPreChecklistExecutionOpen(true)}
            onBackToRooms={() => setAppScreen('checklist_main')}
            onRecordInspection={handleRecordInspection}
            onCompleteRoom={handleCompleteRoom}
            onNavigateToRoom={(nextRoom) => setActiveRoom(nextRoom)}
            onCompleteAllChecklist={handleCompleteAllChecklist}
          />
        ) : (
          <SeniorRoomInspection
            room={activeRoom}
            roomItems={roomItems}
            sessionId={activeSession.id}
            itemResults={itemResults}
            allRooms={rooms}
            completedRoomIds={completedRoomIds}
            pendingRoomPreActions={pendingRoomPreActions}
            onOpenPreChecklist={() => setIsPreChecklistExecutionOpen(true)}
            onBackToRooms={() => setAppScreen('checklist_main')}
            onRecordInspection={handleRecordInspection}
            onCompleteRoom={handleCompleteRoom}
            onNavigateToRoom={(nextRoom) => setActiveRoom(nextRoom)}
            onCompleteAllChecklist={handleCompleteAllChecklist}
          />
        )}
        <PreChecklistExecutionModal
          isOpen={isPreChecklistExecutionOpen}
          onClose={() => setIsPreChecklistExecutionOpen(false)}
          actions={preChecklistActions.filter((a) => a.is_active)}
          inventoryItems={items}
          completedActionIds={preChecklistCompletions}
          onToggleAction={handleTogglePreChecklistAction}
          onContinueToInspection={() => setIsPreChecklistExecutionOpen(false)}
        />
        {toastNotification}
      </>
    );
  }

  // 2. SCREEN: Administrative Inventory View (Property Owner)
  if (appScreen === 'admin_inventory') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 pb-24 sm:pb-12">
        {/* Admin Navigation Bar */}
        <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setAppScreen('checklist_main')}
              className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 font-extrabold text-xs sm:text-sm flex items-center gap-2 transition-all shadow"
            >
              <ArrowLeft className="w-4 h-4 stroke-[3]" />
              <span>Voltar à Conferência</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFloorPlanModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-xs font-bold text-teal-300 flex items-center gap-1.5 transition-all shadow-sm"
                title="Abrir Planta da Chácara"
              >
                <Compass className="w-4 h-4 text-teal-400" />
                <span className="hidden sm:inline">Planta da Chácara</span>
              </button>

              <button
                type="button"
                onClick={() => setIsRoomsModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 flex items-center gap-1.5"
              >
                <Home className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Cômodos ({rooms.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsRoomCategoriesModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 flex items-center gap-1.5"
                title="Categorias de Cômodos"
              >
                <FolderTree className="w-4 h-4 text-purple-400" />
                <span className="hidden md:inline">Cat. Cômodos</span>
              </button>

              <button
                type="button"
                onClick={() => setIsRoomOrderModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 flex items-center gap-1.5"
                title="Configurar Ordem dos Cômodos na Conferência"
              >
                <ArrowUpDown className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Ordem</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCategoriesModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 flex items-center gap-1.5"
              >
                <Tag className="w-4 h-4 text-sky-400" />
                <span className="hidden sm:inline">Categorias ({categories.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOtaSettingsModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 flex items-center gap-1.5"
                title="Atualizações do Aplicativo (OTA)"
              >
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span className="hidden lg:inline">Atualizações</span>
              </button>

              <button
                type="button"
                onClick={() => setIsVisualScaleModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-all"
                title="Ajustar tamanho da interface (Acessibilidade visual)"
                aria-label="Ajustar tamanho da interface"
              >
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Acessibilidade</span>
              </button>

              <button
                type="button"
                onClick={() => setIsBulkPhotoUploadOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                title="Cadastrar múltiplos itens através de fotos em lote"
              >
                <Camera className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Cadastro em Lote</span>
                <span className="sm:hidden">Lote</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setIsItemFormOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Novo Item</span>
              </button>
            </div>
          </div>
        </header>

        {/* Admin Inventory Management Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5 space-y-5">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Itens Cadastrados
                </span>
                <p className="text-2xl font-black text-white mt-0.5">{metrics.completedEntries}</p>
                <span className="text-[11px] text-slate-500">
                  {metrics.totalPhysicalUnits} unidades físicas
                </span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                <Boxes className="w-5 h-5" />
              </div>
            </div>

            {/* Pending Draft Items KPI Card */}
            <div
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  status: f.status === 'pending_information' ? 'all' : 'pending_information',
                }))
              }
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                filters.status === 'pending_information'
                  ? 'bg-amber-500/25 border-amber-500 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/10'
                  : metrics.pendingCount > 0
                  ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/60'
                  : 'bg-slate-900/90 border-slate-800/90'
              }`}
              title="Filtrar itens pendentes de informações"
            >
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Itens Pendentes
                </span>
                <p className="text-2xl font-black text-amber-400 mt-0.5">
                  {metrics.pendingCount}
                </p>
                <span className="text-[11px] text-slate-400">
                  {metrics.pendingCount > 0
                    ? filters.status === 'pending_information'
                      ? 'Filtro ativo'
                      : 'Toque para filtrar'
                    : 'Nenhum rascunho'}
                </span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Itens Individuais
                </span>
                <p className="text-2xl font-black text-indigo-400 mt-0.5">
                  {metrics.individualCount}
                </p>
                <span className="text-[11px] text-slate-500">Com código único (ex: TG01)</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
                <Hash className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Por Quantidade
                </span>
                <p className="text-2xl font-black text-emerald-400 mt-0.5">
                  {metrics.quantityBasedCount}
                </p>
                <span className="text-[11px] text-slate-500">Contagem total</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Cômodos & Categorias
                </span>
                <p className="text-2xl font-black text-amber-400 mt-0.5">
                  {rooms.length}{' '}
                  <span className="text-sm font-semibold text-slate-400">
                    / {categories.length} cat.
                  </span>
                </p>
                <span className="text-[11px] text-slate-500">Ambientes cadastrados</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-400/10 border border-amber-400/25 flex items-center justify-center text-amber-400">
                <Home className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Search, Filter & View Controls */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Buscar item por nome, código (ex: TG01, TM02), cômodo ou descrição..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <select
                  value={filters.roomId}
                  onChange={(e) => setFilters((f) => ({ ...f, roomId: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200"
                >
                  <option value="all">Cômodo: Todos</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.suite?.name ? `(${r.suite.name})` : ''}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.categoryId}
                  onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200"
                >
                  <option value="all">Categoria: Todas</option>
                  <option value="uncategorized">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.inventoryType}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      inventoryType: e.target.value as InventoryFilters['inventoryType'],
                    }))
                  }
                  className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200"
                >
                  <option value="all">Tipo: Todos</option>
                  <option value="individual">Individuais</option>
                  <option value="quantity">Por Quantidade</option>
                </select>

                <select
                  value={filters.status || 'all'}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      status: e.target.value as InventoryFilters['status'],
                    }))
                  }
                  className={`px-3 py-2.5 rounded-xl border text-xs font-semibold ${
                    filters.status === 'pending_information'
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-200'
                  }`}
                >
                  <option value="all">Status: Todos</option>
                  <option value="completed">Concluídos</option>
                  <option value="pending_information">
                    {metrics.pendingCount > 0
                      ? `⚠️ Pendentes (${metrics.pendingCount})`
                      : 'Pendentes (0)'}
                  </option>
                </select>

                <select
                  value={filters.sortBy}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      sortBy: e.target.value as InventoryFilters['sortBy'],
                    }))
                  }
                  className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200"
                >
                  <option value="newest">Mais recentes</option>
                  <option value="name_asc">Nome (A-Z)</option>
                  <option value="code_asc">Código (TG01...)</option>
                  <option value="quantity_desc">Maior Qtd.</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2">
                <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                      viewMode === 'cards'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                      viewMode === 'table'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Lista</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Actionable Banner for Pending Information Items */}
          {metrics.pendingCount > 0 && filters.status !== 'pending_information' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-amber-300">
                <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  Você possui <strong>{metrics.pendingCount}</strong> {metrics.pendingCount === 1 ? 'item' : 'itens'} com fotos enviadas aguardando preenchimento de informações.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, status: 'pending_information' }))}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <span>Ver Itens Pendentes</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          )}

          {filters.status === 'pending_information' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-amber-300">
                <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  Exibindo apenas <strong>Itens Pendentes de Informações</strong> ({filteredItems.length}). Toque em <strong>Completar cadastro</strong> para preencher cômodo e informações do item.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, status: 'all' }))}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs shrink-0 transition-colors cursor-pointer"
              >
                Mostrar todos os itens
              </button>
            </div>
          )}

          {/* Cards or Table */}
          {items.length === 0 ? (
            <div className="py-14 text-center rounded-3xl bg-slate-900 border-2 border-dashed border-slate-800 p-8 space-y-4">
              <Package className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-lg font-black text-white">Nenhum item cadastrado</h3>
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setIsItemFormOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm"
              >
                Cadastrar Primeiro Item
              </button>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map((item) => (
                <InventoryItemCard
                  key={item.id}
                  item={item}
                  onSelect={(it) => setSelectedDetailItem(it)}
                  onEdit={(it) => {
                    setEditingItem(it);
                    setIsItemFormOpen(true);
                  }}
                  onDelete={(it) => setDeletingItem(it)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-extrabold uppercase text-slate-400">
                    <th className="py-3 px-4">Item</th>
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Cômodo</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4 text-center">Qtd.</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedDetailItem(item)}
                      className="hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="py-3 px-4 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <span className={item.status === 'pending_information' ? 'text-amber-300' : ''}>
                            {item.name}
                          </span>
                          {item.status === 'pending_information' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-extrabold text-[10px] border border-amber-500/40 uppercase">
                              Pendente
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-amber-300">
                        {item.identification_code || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-300">{item.room?.name || '—'}</td>
                      <td className="py-3 px-4 text-xs font-bold text-slate-400">
                        {item.inventory_type === 'individual' ? 'Individual' : 'Quantidade'}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-emerald-400">
                        {item.expected_quantity}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {item.status === 'pending_information' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem(item);
                              setIsItemFormOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all"
                          >
                            Completar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem(item);
                              setIsItemFormOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-white"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* Reusable Modals */}
        <InventoryItemFormModal
          isOpen={isItemFormOpen}
          editingItem={editingItem}
          rooms={rooms}
          roomCategories={roomCategories}
          floorPlanShapes={floorPlanShapes}
          categories={categories}
          existingItems={items}
          defaultRoomId={filters.roomId}
          onClose={() => {
            setIsItemFormOpen(false);
            setEditingItem(null);
          }}
          onSaved={handleItemSaved}
          onRoomCreated={(r) => setRooms((prev) => [...prev, r])}
          onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
          onOpenPrefixConfig={() => setIsPrefixesModalOpen(true)}
          onOpenRoomCategories={() => setIsRoomCategoriesModalOpen(true)}
        />

        <InventoryItemDetailModal
          item={selectedDetailItem}
          rooms={rooms}
          onItemChanged={loadAllData}
          onClose={() => setSelectedDetailItem(null)}
          onEdit={(it) => {
            setEditingItem(it);
            setIsItemFormOpen(true);
          }}
          onDelete={(it) => setDeletingItem(it)}
        />

        <ConfirmDialog
          isOpen={Boolean(deletingItem)}
          title="Excluir Item do Inventário"
          description={
            deletingItem
              ? `Tem certeza que deseja excluir "${deletingItem.name}"?`
              : ''
          }
          confirmLabel="Sim, Excluir"
          isLoading={isDeletingLoading}
          onConfirm={handleConfirmDeleteItem}
          onCancel={() => setDeletingItem(null)}
        />

        <FloorPlanModal
          isOpen={isFloorPlanModalOpen}
          rooms={rooms}
          roomCategories={roomCategories}
          items={items}
          onClose={() => setIsFloorPlanModalOpen(false)}
          onRoomsChanged={loadAllData}
          onOpenRoomCategories={() => setIsRoomCategoriesModalOpen(true)}
          onSelectRoomFilter={(rId) => setFilters((f) => ({ ...f, roomId: rId }))}
        />

        <RoomCategoryManagementModal
          isOpen={isRoomCategoriesModalOpen}
          roomCategories={roomCategories}
          rooms={rooms}
          items={items}
          onClose={() => setIsRoomCategoriesModalOpen(false)}
          onCategoriesChanged={loadAllData}
        />

        <RoomManagementModal
          isOpen={isRoomsModalOpen}
          rooms={rooms}
          items={items}
          onClose={() => setIsRoomsModalOpen(false)}
          onRoomsChanged={loadAllData}
          onSelectRoomFilter={(rId) => setFilters((f) => ({ ...f, roomId: rId }))}
          onOpenRoomOrder={() => setIsRoomOrderModalOpen(true)}
          onOpenFloorPlan={() => setIsFloorPlanModalOpen(true)}
          onOpenRoomCategories={() => setIsRoomCategoriesModalOpen(true)}
        />

        <RoomOrderManagementModal
          isOpen={isRoomOrderModalOpen}
          onClose={() => setIsRoomOrderModalOpen(false)}
          rooms={rooms}
          items={items}
          onOrderSaved={(updated) => {
            setRooms(updated);
            showToast('Ordem dos cômodos salva com sucesso!');
          }}
        />

        <CategoryManagementModal
          isOpen={isCategoriesModalOpen}
          categories={categories}
          items={items}
          onClose={() => setIsCategoriesModalOpen(false)}
          onCategoriesChanged={loadAllData}
          onSelectCategoryFilter={(cId) => setFilters((f) => ({ ...f, categoryId: cId }))}
        />

        <CodePrefixesModal
          isOpen={isPrefixesModalOpen}
          items={items}
          onClose={() => setIsPrefixesModalOpen(false)}
        />

        {/* OTA Update Prompt Modal */}
        <OtaUpdateModal
          isOpen={isOtaModalOpen}
          updateInfo={availableUpdate}
          onClose={() => setIsOtaModalOpen(false)}
          onUpdateSuccess={() => {
            showToast('Instalador iniciado com sucesso!');
            setIsOtaModalOpen(false);
          }}
        />

        {/* Admin OTA Settings Modal */}
        <OtaSettingsModal
          isOpen={isOtaSettingsModalOpen}
          onClose={() => setIsOtaSettingsModalOpen(false)}
          onUpdateAvailable={(info) => {
            setAvailableUpdate(info);
            setIsOtaModalOpen(true);
          }}
          onToast={showToast}
        />

        {/* Visual Accessibility Settings Modal */}
        <VisualAccessibilityModal
          isOpen={isVisualScaleModalOpen}
          onClose={() => setIsVisualScaleModalOpen(false)}
        />

        {/* Pre-Checklist Configuration Modal */}
        <PreChecklistConfigModal
          isOpen={isPreChecklistConfigOpen}
          onClose={() => setIsPreChecklistConfigOpen(false)}
          actions={preChecklistActions}
          inventoryItems={items}
          rooms={rooms}
          onActionsUpdated={(updated) => setPreChecklistActions(updated)}
          onActionsChanged={loadAllData}
          onToast={showToast}
        />

        {/* Bulk Photo Upload Modal */}
        <BulkPhotoUploadModal
          isOpen={isBulkPhotoUploadOpen}
          onClose={() => setIsBulkPhotoUploadOpen(false)}
          onSuccess={async (count) => {
            await loadAllData();
            showToast(`${count} ${count === 1 ? 'item preliminar criado' : 'itens preliminares criados'} com sucesso!`);
          }}
          onGoToPendingItems={async () => {
            await loadAllData();
            setIsBulkPhotoUploadOpen(false);
            setFilters((f) => ({ ...f, status: 'pending_information' }));
            showToast('Exibindo itens pendentes de informações.');
          }}
        />

        {toastNotification}
      </div>
    );
  }

  // 3. PRIMARY SCREEN: Senior-Friendly Checklist Main View (Entry Point!)
  return (
    <>
      <SeniorChecklistMain
        rooms={rooms}
        roomProgressMap={roomProgressMap}
        session={activeSession}
        preChecklistActions={preChecklistActions}
        preChecklistCompletions={preChecklistCompletions}
        onOpenPreChecklist={() => setIsPreChecklistExecutionOpen(true)}
        onSelectRoom={(room) => {
          setActiveRoom(room);
          setAppScreen('room_inspection');
        }}
        onOpenAdminMenu={() => setIsAdminDrawerOpen(true)}
        onOpenAccessibility={() => setIsVisualScaleModalOpen(true)}
        onStartNewSession={handleStartNewInspection}
        onSeedDefaultRooms={handleSeedRooms}
      />

      {/* Discreet Admin Navigation Drawer (Three Horizontal Lines Menu) */}
      <DiscreetAdminDrawer
        isOpen={isAdminDrawerOpen}
        onClose={() => setIsAdminDrawerOpen(false)}
        onOpenInventory={() => setAppScreen('admin_inventory')}
        onOpenFloorPlan={() => setIsFloorPlanModalOpen(true)}
        onOpenRooms={() => setIsRoomsModalOpen(true)}
        onOpenRoomCategories={() => setIsRoomCategoriesModalOpen(true)}
        onOpenRoomOrder={() => setIsRoomOrderModalOpen(true)}
        onOpenCategories={() => setIsCategoriesModalOpen(true)}
        onOpenPrefixes={() => setIsPrefixesModalOpen(true)}
        onOpenSupabase={() => setIsSupabaseModalOpen(true)}
        onOpenPreChecklistConfig={() => setIsPreChecklistConfigOpen(true)}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onOpenVisualScale={() => setIsVisualScaleModalOpen(true)}
        onStartNewInspection={handleStartNewInspection}
        onOpenOtaSettings={() => setIsOtaSettingsModalOpen(true)}
      />

      {/* Floor Plan (Planta da Chácara) Modal */}
      <FloorPlanModal
        isOpen={isFloorPlanModalOpen}
        rooms={rooms}
        roomCategories={roomCategories}
        items={items}
        onClose={() => setIsFloorPlanModalOpen(false)}
        onRoomsChanged={loadAllData}
        onOpenRoomCategories={() => setIsRoomCategoriesModalOpen(true)}
        onSelectRoomFilter={(roomId) => {
          setFilters((f) => ({ ...f, roomId }));
          setAppScreen('admin_inventory');
        }}
      />

      {/* Room Category Management Modal */}
      <RoomCategoryManagementModal
        isOpen={isRoomCategoriesModalOpen}
        roomCategories={roomCategories}
        rooms={rooms}
        items={items}
        onClose={() => setIsRoomCategoriesModalOpen(false)}
        onCategoriesChanged={loadAllData}
      />

      {/* Checklist Inspection History Modal */}
      <ChecklistHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onStartNewInspection={handleStartNewInspection}
      />

      {/* Admin Room Management Modal */}
      <RoomManagementModal
        isOpen={isRoomsModalOpen}
        rooms={rooms}
        items={items}
        onClose={() => setIsRoomsModalOpen(false)}
        onRoomsChanged={loadAllData}
        onSelectRoomFilter={(roomId) => {
          setFilters((f) => ({ ...f, roomId }));
          setAppScreen('admin_inventory');
        }}
        onOpenRoomOrder={() => setIsRoomOrderModalOpen(true)}
        onOpenFloorPlan={() => setIsFloorPlanModalOpen(true)}
        onOpenRoomCategories={() => setIsRoomCategoriesModalOpen(true)}
      />

      {/* Admin Room Inspection Order Modal */}
      <RoomOrderManagementModal
        isOpen={isRoomOrderModalOpen}
        onClose={() => setIsRoomOrderModalOpen(false)}
        rooms={rooms}
        items={items}
        onOrderSaved={(updated) => {
          setRooms(updated);
          showToast('Ordem dos cômodos salva com sucesso!');
        }}
      />

      {/* Admin Category Management Modal */}
      <CategoryManagementModal
        isOpen={isCategoriesModalOpen}
        categories={categories}
        items={items}
        onClose={() => setIsCategoriesModalOpen(false)}
        onCategoriesChanged={loadAllData}
        onSelectCategoryFilter={(categoryId) => {
          setFilters((f) => ({ ...f, categoryId }));
          setAppScreen('admin_inventory');
        }}
      />

      {/* Admin Code Prefixes Modal */}
      <CodePrefixesModal
        isOpen={isPrefixesModalOpen}
        items={items}
        onClose={() => setIsPrefixesModalOpen(false)}
      />

      {/* Supabase Connection & SQL Migration Modal */}
      <SupabaseConfigModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        onConfigUpdated={loadAllData}
      />

      {/* OTA Update Prompt Modal */}
      <OtaUpdateModal
        isOpen={isOtaModalOpen}
        updateInfo={availableUpdate}
        onClose={() => setIsOtaModalOpen(false)}
        onUpdateSuccess={() => {
          showToast('Instalador iniciado com sucesso!');
          setIsOtaModalOpen(false);
        }}
      />

      {/* Admin OTA Settings Modal */}
      <OtaSettingsModal
        isOpen={isOtaSettingsModalOpen}
        onClose={() => setIsOtaSettingsModalOpen(false)}
        onUpdateAvailable={(info) => {
          setAvailableUpdate(info);
          setIsOtaModalOpen(true);
        }}
        onToast={showToast}
      />

      {/* Visual Accessibility Settings Modal */}
      <VisualAccessibilityModal
        isOpen={isVisualScaleModalOpen}
        onClose={() => setIsVisualScaleModalOpen(false)}
      />

      {/* Pre-Checklist Configuration Modal */}
      <PreChecklistConfigModal
        isOpen={isPreChecklistConfigOpen}
        onClose={() => setIsPreChecklistConfigOpen(false)}
        actions={preChecklistActions}
        inventoryItems={items}
        rooms={rooms}
        onActionsUpdated={(updated) => setPreChecklistActions(updated)}
        onActionsChanged={loadAllData}
        onToast={showToast}
      />

      {/* Pre-Checklist Execution Modal */}
      <PreChecklistExecutionModal
        isOpen={isPreChecklistExecutionOpen}
        onClose={() => setIsPreChecklistExecutionOpen(false)}
        actions={preChecklistActions.filter((a) => a.is_active)}
        inventoryItems={items}
        completedActionIds={preChecklistCompletions}
        onToggleAction={handleTogglePreChecklistAction}
        onContinueToInspection={() => setIsPreChecklistExecutionOpen(false)}
      />

      {toastNotification}
    </>
  );
}

export default App;
