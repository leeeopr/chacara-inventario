import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { registerBackHandler, setRootBackAction } from './lib/backNavigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Boxes,
  Calendar as CalendarIcon,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
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
  Menu,
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
import { BatchAiClassificationModal } from './components/BatchAiClassificationModal';
import { BulkPhotoUploadModal } from './components/BulkPhotoUploadModal';
import { CategoryManagementModal } from './components/CategoryManagementModal';
import { ChecklistHistoryModal } from './components/ChecklistHistoryModal';
import { CodePrefixesModal } from './components/CodePrefixesModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DiscreetAdminDrawer } from './components/DiscreetAdminDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FloorPlanModal } from './components/FloorPlanModal';
import { InventoryItemCard } from './components/InventoryItemCard';
import { InventoryItemDetailModal } from './components/InventoryItemDetailModal';
import { InventoryItemFormModal } from './components/InventoryItemFormModal';
import { AuthLoginScreen } from './components/AuthLoginScreen';
import { OtaSettingsModal } from './components/OtaSettingsModal';
import { OtaUpdateModal } from './components/OtaUpdateModal';
import { PiscineiroDashboard } from './components/PiscineiroDashboard';
import { QuickRoomInspection } from './components/QuickRoomInspection';
import { RoomCategoryManagementModal } from './components/RoomCategoryManagementModal';
import { RoomManagementModal } from './components/RoomManagementModal';
import { RoomOrderManagementModal } from './components/RoomOrderManagementModal';
import { SelectStayModal } from './components/SelectStayModal';
import { PreChecklistConfigModal } from './components/PreChecklistConfigModal';
import { PreChecklistExecutionModal } from './components/PreChecklistExecutionModal';
import { SeniorChecklistMain } from './components/SeniorChecklistMain';
import { SeniorRoomInspection } from './components/SeniorRoomInspection';
import { StaysCalendarModal } from './components/StaysCalendarModal';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { VisualAccessibilityModal } from './components/VisualAccessibilityModal';
import { InspectionType } from './lib/inspectionTypeUtils';
import { getInventoryImageUrl, isSupabaseConfigured } from './lib/supabase';
import { getCurrentUserProfile, signOutAppUser } from './services/authService';
import { checkForUpdate } from './services/otaUpdateService';
import { fetchStays, getLocalTodayDateStr, startChecklistForStay } from './services/staysService';
import { AppUserProfile } from './types/auth';
import { Stay } from './types/stay';
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
  updateInventoryItem,
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
  // Authentication & Role State (Faxineira, Piscineiro, Admin)
  const [authProfile, setAuthProfile] = useState<AppUserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  // Navigation: Primary entry point depends on user role
  const [appScreen, setAppScreen] = useState<
    'checklist_main' | 'room_inspection' | 'admin_inventory' | 'piscineiro_view'
  >('checklist_main');

  // Main Bottom Tab Navigation: 'agenda' (Página Inicial - Calendário) vs 'checklists' (Aba ao lado)
  const [mainTab, setMainTab] = useState<'agenda' | 'checklists'>('agenda');
  const [isSelectStayModalOpen, setIsSelectStayModalOpen] = useState(false);
  const [allStays, setAllStays] = useState<Stay[]>([]);

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
  const [isBatchAiModalOpen, setIsBatchAiModalOpen] = useState(false);
  const [itemsToClassifyWithAi, setItemsToClassifyWithAi] = useState<InventoryItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
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

  // Stays & Calendar State
  const [isStaysCalendarOpen, setIsStaysCalendarOpen] = useState(false);
  const [isServiceFormAutoOpen, setIsServiceFormAutoOpen] = useState(false);
  const [pendingStaysCount, setPendingStaysCount] = useState(0);
  const [pendingCleaningCount, setPendingCleaningCount] = useState(0);

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
      if (isStaysCalendarOpen) {
        setIsStaysCalendarOpen(false);
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
      if (isSelectStayModalOpen) {
        setIsSelectStayModalOpen(false);
        return true;
      }

      // 2. Secondary screen navigation (e.g. Admin Inventory -> Checklist Main)
      if (appScreen === 'admin_inventory') {
        setAppScreen('checklist_main');
        return true;
      }

      // 3. Main tab navigation (Checklists tab -> Agenda home tab)
      if (mainTab === 'checklists') {
        setMainTab('agenda');
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
    isStaysCalendarOpen,
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

      // Load pending stays & cleaning counts safely
      try {
        const stays = await fetchStays();
        setAllStays(stays);
        const todayStr = getLocalTodayDateStr();
        const pending = stays.filter((s) => s.checklist_status === 'pending').length;
        const pendingClean = stays.filter(
          (s) => s.status !== 'CANCELADA' && s.checkout_date <= todayStr && s.cleaning_status === 'pending'
        ).length;
        setPendingStaysCount(pending);
        setPendingCleaningCount(pendingClean);
      } catch (stayErr) {
        // Safe fallback if offline
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao sincronizar dados.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshStaysCounts = useCallback(async () => {
    try {
      const stays = await fetchStays();
      setAllStays(stays);
      const todayStr = getLocalTodayDateStr();
      setPendingStaysCount(stays.filter((s) => s.checklist_status === 'pending').length);
      setPendingCleaningCount(
        stays.filter(
          (s) => s.status !== 'CANCELADA' && s.checkout_date <= todayStr && s.cleaning_status === 'pending'
        ).length
      );
    } catch {}
  }, []);

  // Restore Supabase Auth Session on App Startup
  useEffect(() => {
    let active = true;
    getCurrentUserProfile()
      .then((profile) => {
        if (!active) return;
        setAuthProfile(profile);
        if (profile?.role === 'piscineiro') {
          setAppScreen('piscineiro_view');
        }
      })
      .finally(() => {
        if (active) setIsAuthChecking(false);
      });
    return () => {
      active = false;
    };
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

  // Handle Auth Login & Logout
  const handleLoginSuccess = async (profile: AppUserProfile) => {
    setAuthProfile(profile);
    setAppScreen(profile.role === 'piscineiro' ? 'piscineiro_view' : 'checklist_main');
    showToast(`Bem-vindo(a), ${profile.full_name}!`);
    await loadAllData();
  };

  const handleLogout = async () => {
    await signOutAppUser();
    setAuthProfile(null);
    setIsAdminDrawerOpen(false);
    setIsStaysCalendarOpen(false);
    setAppScreen('checklist_main');
    setActiveRoom(null);
    showToast('Você saiu da conta.');
  };

  // Start a fresh new checklist inspection session
  const handleStartNewInspection = async () => {
    setIsLoading(true);
    try {
      const newSessionDetail = await getOrCreateActiveChecklistSession(
        rooms,
        true,
        undefined,
        authProfile?.full_name || 'Responsável'
      );
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

  // Start a checklist inspection session linked to a reservation/stay
  const handleStartChecklistForStay = async (stay: Stay) => {
    setIsLoading(true);
    try {
      const newSessionDetail = await startChecklistForStay(
        stay,
        rooms,
        authProfile?.full_name || 'Responsável'
      );
      setActiveSession(newSessionDetail.session);
      setRoomProgressList(newSessionDetail.roomProgressList);
      setItemResults(newSessionDetail.itemResults);
      setOccurrences(newSessionDetail.occurrences);
      setPreChecklistCompletions(new Set());
      setActiveRoom(null);
      setAppScreen('checklist_main');
      setIsStaysCalendarOpen(false);
      showToast(
        `Vistoria vinculada à estadia de ${stay.guest_name} (${stay.code || 'Reserva'}) iniciada!`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao iniciar vistoria para esta estadia.');
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
        const matchName = (item.name || '').toLowerCase().includes(q);
        const matchCode = item.identification_code?.toLowerCase().includes(q) || false;
        const matchDesc = item.description?.toLowerCase().includes(q) || false;
        const matchRoom = (item.room?.name || '').toLowerCase().includes(q);
        const matchCat = (item.category?.name || '').toLowerCase().includes(q);
        const matchAssignment = item.room_assignments?.some((a) =>
          (a.room?.name || '').toLowerCase().includes(q)
        ) || false;
        return matchName || matchCode || matchDesc || matchRoom || matchCat || matchAssignment;
      }
      return true;
    });

    return list.sort((a, b) => {
      switch (filters.sortBy) {
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '', 'pt-BR');
        case 'code_asc':
          return (a.identification_code || 'ZZZZ').localeCompare(
            b.identification_code || 'ZZZZ',
            'pt-BR',
            { numeric: true }
          );
        case 'room_asc':
          return (a.room?.name || '').localeCompare(b.room?.name || '', 'pt-BR');
        case 'quantity_desc':
          return (
            (b.total_quantity ?? b.expected_quantity ?? 0) -
            (a.total_quantity ?? a.expected_quantity ?? 0)
          );
        case 'newest':
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
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

  // AI Classification Selection & Handlers
  const handleToggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredItems.map((it) => it.id);
    if (selectedItemIds.size === allFilteredIds.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(allFilteredIds));
    }
  };

  const handleOpenAiClassification = (customItems?: InventoryItem[]) => {
    let target: InventoryItem[] = [];
    if (customItems && customItems.length > 0) {
      target = customItems;
    } else if (selectedItemIds.size > 0) {
      target = items.filter((it) => selectedItemIds.has(it.id));
    } else if (filters.status === 'pending_information') {
      target = filteredItems;
    } else {
      target = filteredItems;
    }

    if (target.length === 0) {
      alert('Nenhum item selecionado para classificação.');
      return;
    }
    setItemsToClassifyWithAi(target);
    setIsBatchAiModalOpen(true);
  };

  const handleSaveBatchAiUpdates = async (
    updates: Array<{
      id: string;
      name: string;
      category_id: string | null;
      room_id: string | null;
      description: string | null;
      status: 'completed' | 'pending_information';
    }>
  ) => {
    await Promise.all(
      updates.map((u) =>
        updateInventoryItem(u.id, {
          name: u.name,
          category_id: u.category_id,
          room_id: u.room_id,
          description: u.description,
          status: u.status,
        })
      )
    );
    await loadAllData();
    setSelectedItemIds(new Set());
    setIsSelectionMode(false);
    showToast(`✨ ${updates.length} itens foram atualizados com sucesso pela IA!`);
  };

  // Toast feedback
  const toastNotification = toastMsg && (
    <div className="fixed bottom-6 right-4 z-[95] max-w-sm rounded-2xl bg-emerald-500 text-slate-950 px-4 py-3 shadow-2xl flex items-center gap-2.5 font-black text-sm">
      <CheckCircle2 className="w-5 h-5 shrink-0" />
      <span>{toastMsg}</span>
    </div>
  );

  // 0A. Auth Loading Splash
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 gap-4">
        <img
          src="/logo.png"
          alt="Logo Chácara"
          className="w-20 h-20 rounded-3xl object-cover shadow-2xl shadow-emerald-500/20 border-2 border-slate-800"
        />
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-sm font-black text-slate-300">Verificando acesso da equipe...</p>
      </div>
    );
  }

  // 0B. Authentication Gate (Supabase Auth Login Screen)
  if (!authProfile) {
    return (
      <>
        <AuthLoginScreen
          onLoginSuccess={handleLoginSuccess}
          onOpenAccessibility={() => setIsVisualScaleModalOpen(true)}
        />
        <VisualAccessibilityModal
          isOpen={isVisualScaleModalOpen}
          onClose={() => setIsVisualScaleModalOpen(false)}
        />
        {toastNotification}
      </>
    );
  }

  // 0C. PISCINEIRO EXCLUSIVE DASHBOARD (Role = 'piscineiro' or Admin previewing)
  if (authProfile.role === 'piscineiro' || (authProfile.role === 'admin' && appScreen === 'piscineiro_view')) {
    return (
      <>
        <PiscineiroDashboard
          userProfile={authProfile}
          onLogout={handleLogout}
          onOpenAccessibility={() => setIsVisualScaleModalOpen(true)}
          onBackToAdmin={
            authProfile.role === 'admin' ? () => setAppScreen('checklist_main') : undefined
          }
          onToast={showToast}
        />
        <VisualAccessibilityModal
          isOpen={isVisualScaleModalOpen}
          onClose={() => setIsVisualScaleModalOpen(false)}
        />
        {toastNotification}
      </>
    );
  }

  // 1. SCREEN: Room Inspection (Quick 3x3 Grid or Standard Guided 1-by-1)
  if (appScreen === 'room_inspection' && activeRoom && activeSession) {
    const roomItems = getItemsForRoom(items, activeRoom.id);
    const isQuickMode = activeRoom.checklist_mode === 'quick';

    const pendingRoomPreActions = preChecklistActions.filter(
      (a) =>
        a.is_active &&
        (a.room_id === activeRoom.id ||
          a.inventory_item?.room_id === activeRoom.id ||
          a.inventory_item?.room_assignments?.some((as) => as.room_id === activeRoom.id) ||
          (a.room_name &&
            a.room_name.trim().toLowerCase() === activeRoom.name.trim().toLowerCase()) ||
          (a.room_name_snapshot &&
            a.room_name_snapshot.trim().toLowerCase() === activeRoom.name.trim().toLowerCase())) &&
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

  // 2. SCREEN: Administrative Inventory View (Property Owner only)
  if (appScreen === 'admin_inventory' && authProfile.role === 'admin') {
    return (
      <ErrorBoundary
        fallbackTitle="Erro na Gestão do Inventário"
        onReset={() => {
          setAppScreen('checklist_main');
          loadAllData();
        }}
      >
        <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 pb-24 sm:pb-12 max-w-full overflow-x-hidden">
        {/* Admin Navigation Bar - Strictly Responsive & Mobile-Proportional */}
        <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 max-w-full overflow-x-hidden">
          {/* Main Top Bar */}
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setAppScreen('checklist_main')}
              className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow shrink-0"
              title="Retornar à tela de conferência"
            >
              <ArrowLeft className="w-4 h-4 stroke-[3]" />
              <span className="hidden xs:inline">Voltar à Conferência</span>
              <span className="xs:hidden">Voltar</span>
            </button>

            {/* Primary Action Buttons (Always fitting on mobile screens) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsBulkPhotoUploadOpen(true)}
                className="px-2.5 sm:px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0"
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
                className="px-3 sm:px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span className="hidden sm:inline">Novo Item</span>
                <span className="sm:hidden">Novo</span>
              </button>

              {/* Drawer Menu Button for quick access to all administrative features */}
              <button
                type="button"
                onClick={() => setIsAdminDrawerOpen(true)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all shadow shrink-0"
                title="Abrir menu administrativo completo"
                aria-label="Menu administrativo"
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Secondary Scrollable Management Strip (Safely contained horizontally without breaking page width) */}
          <div className="border-t border-slate-850/80 bg-slate-950/70 px-3 sm:px-4 py-1.5 overflow-x-auto scrollbar-none flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setIsFloorPlanModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 font-bold text-teal-300 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              title="Abrir Planta da Chácara"
            >
              <Compass className="w-3.5 h-3.5 text-teal-400" />
              <span>Planta da Chácara</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRoomsModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 font-bold text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Home className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cômodos ({rooms.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRoomCategoriesModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 font-bold text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              title="Categorias de Cômodos"
            >
              <FolderTree className="w-3.5 h-3.5 text-purple-400" />
              <span>Cat. Cômodos</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRoomOrderModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 font-bold text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              title="Configurar Ordem dos Cômodos na Conferência"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ordem</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCategoriesModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 font-bold text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Tag className="w-3.5 h-3.5 text-sky-400" />
              <span>Categorias ({categories.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOtaSettingsModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 font-bold text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              title="Atualizações do Aplicativo (OTA)"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span>Atualizações</span>
            </button>

            <button
              type="button"
              onClick={() => setIsVisualScaleModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 font-bold text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              title="Ajustar tamanho da interface (Acessibilidade visual)"
              aria-label="Ajustar tamanho da interface"
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Acessibilidade</span>
            </button>
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
          <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 space-y-3 min-w-0">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Buscar item por nome, código (ex: TG01, TM02), cômodo ou descrição..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs sm:text-sm text-white placeholder-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 min-w-0">
                <select
                  value={filters.roomId}
                  onChange={(e) => setFilters((f) => ({ ...f, roomId: e.target.value }))}
                  className="w-full min-w-0 truncate px-2.5 sm:px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200"
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
                  className="w-full min-w-0 truncate px-2.5 sm:px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200"
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
                  className="w-full min-w-0 truncate px-2.5 sm:px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200"
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
                  className={`w-full min-w-0 truncate px-2.5 sm:px-3 py-2.5 rounded-xl border text-xs font-semibold ${
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
                  className="w-full min-w-0 truncate px-2.5 sm:px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200"
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
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-amber-300">
                <Clock className="w-5 h-5 shrink-0 text-amber-400" />
                <div>
                  <p className="font-bold text-white text-sm">
                    Itens Pendentes de Informações ({filteredItems.length})
                  </p>
                  <p className="text-amber-200/80 text-[11px] mt-0.5">
                    Fotos do lote prontas para identificação. Você pode selecionar itens ou classificar todos de uma vez com IA.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => handleOpenAiClassification(filteredItems)}
                  className="flex-1 md:flex-initial px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-500/25 transition-all cursor-pointer"
                  title="Analisar todos os itens pendentes com a Inteligência Artificial Gemini"
                >
                  <Sparkles className="w-4 h-4 fill-slate-950" />
                  <span>Classificar com IA ({filteredItems.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsSelectionMode((v) => !v);
                    setSelectedItemIds(new Set());
                  }}
                  className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isSelectionMode
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <span>{isSelectionMode ? 'Encerrar Seleção' : 'Selecionar Vários'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, status: 'all' }))}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs shrink-0 transition-colors cursor-pointer"
                >
                  Ver Todos
                </button>
              </div>
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
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedItemIds.has(item.id)}
                  onToggleSelect={(it) => handleToggleSelectItem(it.id)}
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
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-x-auto shadow-xl scrollbar-none">
              <table className="w-full min-w-[600px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-extrabold uppercase text-slate-400">
                    {isSelectionMode && (
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            filteredItems.length > 0 &&
                            selectedItemIds.size === filteredItems.length
                          }
                          onChange={handleSelectAllFiltered}
                          className="w-4 h-4 rounded text-purple-500 bg-slate-900 border-slate-700 cursor-pointer"
                        />
                      </th>
                    )}
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
                      onClick={() => {
                        if (isSelectionMode) {
                          handleToggleSelectItem(item.id);
                        } else {
                          setSelectedDetailItem(item);
                        }
                      }}
                      className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                        isSelectionMode && selectedItemIds.has(item.id)
                          ? 'bg-purple-950/25'
                          : ''
                      }`}
                    >
                      {isSelectionMode && (
                        <td
                          className="py-3 px-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => handleToggleSelectItem(item.id)}
                            className="w-4 h-4 rounded text-purple-500 bg-slate-900 border-slate-700 cursor-pointer"
                          />
                        </td>
                      )}
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
          onClassifyWithAi={async (createdItemIds) => {
            const reloaded = await fetchInventoryItems().catch(() => []);
            setItems(reloaded);
            const targets = reloaded.filter((it) => createdItemIds.includes(it.id));
            if (targets.length > 0) {
              handleOpenAiClassification(targets);
            } else {
              setFilters((f) => ({ ...f, status: 'pending_information' }));
            }
          }}
        />

        {/* Batch AI Vision Classification Modal */}
        <BatchAiClassificationModal
          isOpen={isBatchAiModalOpen}
          onClose={() => setIsBatchAiModalOpen(false)}
          items={itemsToClassifyWithAi}
          categories={categories}
          rooms={rooms}
          onSaveBatch={handleSaveBatchAiUpdates}
        />

        {/* Floating Multi-Selection Action Bar */}
        {isSelectionMode && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[95%] bg-slate-900/95 border border-purple-500/50 backdrop-blur-md p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-purple-500/20 text-purple-300 font-extrabold text-xs flex items-center justify-center border border-purple-500/30">
                {selectedItemIds.size}
              </span>
              <span className="text-xs font-bold text-white hidden xs:inline">
                {selectedItemIds.size === 1 ? 'item selecionado' : 'itens selecionados'}
              </span>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-xs text-purple-300 hover:text-white underline font-bold ml-1 cursor-pointer"
              >
                {selectedItemIds.size === filteredItems.length ? 'Desmarcar' : 'Todos'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={selectedItemIds.size === 0}
                onClick={() => handleOpenAiClassification()}
                className="py-2 px-3.5 rounded-xl bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-purple-500/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                <span>Classificar com IA ({selectedItemIds.size})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedItemIds(new Set());
                }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Sair do modo seleção"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {toastNotification}
      </div>
      </ErrorBoundary>
    );
  }

  // 3. PRIMARY SCREEN: Tabbed View (Agenda / Calendário as Default Home + Checklists as Adjacent Tab)
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {mainTab === 'agenda' ? (
        <div className="flex-1 flex flex-col pb-20">
          <StaysCalendarModal
            isOpen={true}
            isEmbedded={true}
            onStartChecklistForStay={handleStartChecklistForStay}
            onViewHistoryForStay={() => setIsHistoryModalOpen(true)}
            userRole={authProfile.role}
            userName={authProfile.full_name}
            userEmail={authProfile.email}
            onStaysUpdated={refreshStaysCounts}
            onOpenChecklistsTab={() => setMainTab('checklists')}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col pb-20">
          <SeniorChecklistMain
            rooms={rooms}
            roomProgressMap={roomProgressMap}
            session={activeSession}
            preChecklistActions={preChecklistActions}
            preChecklistCompletions={preChecklistCompletions}
            pendingStaysCount={pendingStaysCount}
            pendingCleaningCount={pendingCleaningCount}
            userProfile={authProfile}
            onLogout={handleLogout}
            onOpenStaysCalendar={() => setMainTab('agenda')}
            onOpenNewService={() => {
              setMainTab('agenda');
              setIsServiceFormAutoOpen(true);
            }}
            onOpenPreChecklist={() => setIsPreChecklistExecutionOpen(true)}
            onSelectRoom={(room) => {
              setActiveRoom(room);
              setAppScreen('room_inspection');
            }}
            onOpenAdminMenu={() => setIsAdminDrawerOpen(true)}
            onOpenAccessibility={() => setIsVisualScaleModalOpen(true)}
            onStartNewSession={() => setIsSelectStayModalOpen(true)}
            onPromptSelectStay={() => setIsSelectStayModalOpen(true)}
            onSeedDefaultRooms={handleSeedRooms}
          />
        </div>
      )}

      {/* Persistent Bottom Navigation Bar for Staff & Owner */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-slate-800 backdrop-blur-md px-4 py-2 flex items-center justify-around shadow-2xl">
        {/* Tab 1: Agenda (Página Inicial - Calendário) */}
        <button
          type="button"
          onClick={() => setMainTab('agenda')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-2xl transition-all cursor-pointer ${
            mainTab === 'agenda'
              ? 'text-purple-400 font-black'
              : 'text-slate-400 hover:text-slate-200 font-bold'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${mainTab === 'agenda' ? 'bg-purple-500/20 shadow-sm' : ''}`}>
            <CalendarIcon className="w-5 h-5" />
          </div>
          <span className="text-[11px]">Agenda</span>
        </button>

        {/* Tab 2: Checklists (A aba ao lado!) */}
        <button
          type="button"
          onClick={() => setMainTab('checklists')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-2xl transition-all cursor-pointer ${
            mainTab === 'checklists'
              ? 'text-emerald-400 font-black'
              : 'text-slate-400 hover:text-slate-200 font-bold'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${mainTab === 'checklists' ? 'bg-emerald-500/20 shadow-sm' : ''}`}>
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <span className="text-[11px]">Checklists</span>
        </button>

        {/* Admin Shortcuts */}
        {authProfile.role === 'admin' && (
          <>
            <button
              type="button"
              onClick={() => setAppScreen('admin_inventory')}
              className="flex flex-col items-center gap-1 py-1 px-4 rounded-2xl text-slate-400 hover:text-slate-200 font-bold transition-all cursor-pointer"
            >
              <div className="p-1.5 rounded-xl">
                <Layers className="w-5 h-5" />
              </div>
              <span className="text-[11px]">Inventário</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAdminDrawerOpen(true)}
              className="flex flex-col items-center gap-1 py-1 px-4 rounded-2xl text-slate-400 hover:text-slate-200 font-bold transition-all cursor-pointer"
            >
              <div className="p-1.5 rounded-xl">
                <Menu className="w-5 h-5" />
              </div>
              <span className="text-[11px]">Mais</span>
            </button>
          </>
        )}
      </nav>

      {/* Select Stay Modal: Prompt "Qual estadia você está checando?" */}
      <SelectStayModal
        isOpen={isSelectStayModalOpen}
        onClose={() => setIsSelectStayModalOpen(false)}
        stays={allStays}
        onSelectStay={handleStartChecklistForStay}
        onStartWithoutStay={handleStartNewInspection}
      />

      {/* Discreet Admin Navigation Drawer (Three Horizontal Lines Menu) */}
      <DiscreetAdminDrawer
        isOpen={isAdminDrawerOpen}
        onClose={() => setIsAdminDrawerOpen(false)}
        userProfile={authProfile}
        onLogout={handleLogout}
        onOpenPiscineiroView={() => setAppScreen('piscineiro_view')}
        onOpenInventory={() => setAppScreen('admin_inventory')}
        onOpenFloorPlan={() => setIsFloorPlanModalOpen(true)}
        onOpenRooms={() => setIsRoomsModalOpen(true)}
        onOpenRoomCategories={() => setIsRoomCategoriesModalOpen(true)}
        onOpenRoomOrder={() => setIsRoomOrderModalOpen(true)}
        onOpenCategories={() => setIsCategoriesModalOpen(true)}
        onOpenPrefixes={() => setIsPrefixesModalOpen(true)}
        onOpenSupabase={() => {
          if (authProfile.role === 'admin') {
            setIsSupabaseModalOpen(true);
          }
        }}
        onOpenPreChecklistConfig={() => setIsPreChecklistConfigOpen(true)}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onOpenStaysCalendar={() => setIsStaysCalendarOpen(true)}
        onOpenVisualScale={() => setIsVisualScaleModalOpen(true)}
        onStartNewInspection={handleStartNewInspection}
        onOpenOtaSettings={() => setIsOtaSettingsModalOpen(true)}
      />

      {/* Stays & Calendar Modal (Unified Agenda: Chácara & Serviços Particulares) */}
      <StaysCalendarModal
        isOpen={isStaysCalendarOpen}
        onClose={() => {
          setIsStaysCalendarOpen(false);
          setIsServiceFormAutoOpen(false);
        }}
        initialOpenServiceForm={isServiceFormAutoOpen}
        onStartChecklistForStay={handleStartChecklistForStay}
        onViewHistoryForStay={() => setIsHistoryModalOpen(true)}
        userRole={authProfile.role}
        userName={authProfile.full_name}
        userEmail={authProfile.email}
        onStaysUpdated={refreshStaysCounts}
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

      {/* Supabase Connection & SQL Migration Modal (Proprietário / Admin only) */}
      {authProfile.role === 'admin' && (
        <SupabaseConfigModal
          isOpen={isSupabaseModalOpen}
          onClose={() => setIsSupabaseModalOpen(false)}
          onConfigUpdated={loadAllData}
        />
      )}

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
    </div>
  );
}

export default App;
