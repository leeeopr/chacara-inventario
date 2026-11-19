import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Globe,
  Hash,
  Home,
  Image as ImageIcon,
  Layers,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Split,
  Tag,
  Trash2,
  Upload,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { registerBackHandler } from '../lib/backNavigation';
import {
  generateNextCodes,
  getCodePrefixRules,
  inferPrefixForItem,
} from '../lib/codeGenerator';
import {
  CONDITION_OPTIONS,
  getConditionConfig,
} from '../lib/conditionUtils';
import {
  CompressedImageResult,
  compressImageForUpload,
  formatBytes,
} from '../lib/imageCompression';
import {
  INSPECTION_TYPE_OPTIONS,
  InspectionType,
} from '../lib/inspectionTypeUtils';
import { getInventoryImageUrl } from '../lib/supabase';
import {
  createCategory,
  createInventoryItem,
  createInventoryItemsBatch,
  createRoom,
  deleteInventoryPhotoIfUnused,
  updateInventoryItem,
  uploadInventoryPhoto,
} from '../services/inventoryService';
import {
  ConditionStatus,
  FloorPlanShape,
  InventoryCategory,
  InventoryItem,
  InventoryType,
  Room,
  RoomCategory,
  UpsertRoomAssignmentInput,
} from '../types/inventory';
import { CameraCaptureModal } from './CameraCaptureModal';
import { FloorPlanView } from './FloorPlanView';

interface FormDistributionRow {
  key: string;
  room_id: string;
  quantity: number;
  condition_status: ConditionStatus;
  condition_notes: string;
}

interface InventoryItemFormModalProps {
  isOpen: boolean;
  editingItem: InventoryItem | null;
  rooms: Room[];
  roomCategories?: RoomCategory[];
  floorPlanShapes?: FloorPlanShape[];
  categories: InventoryCategory[];
  existingItems: InventoryItem[];
  defaultRoomId?: string;
  onClose: () => void;
  onSaved: (savedItems: InventoryItem[], keepOpen: boolean) => void;
  onRoomCreated: (room: Room) => void;
  onCategoryCreated: (category: InventoryCategory) => void;
  onOpenPrefixConfig: () => void;
  onOpenRoomCategories?: () => void;
}

export const InventoryItemFormModal: React.FC<InventoryItemFormModalProps> = ({
  isOpen,
  editingItem,
  rooms,
  roomCategories = [],
  floorPlanShapes = [],
  categories,
  existingItems,
  defaultRoomId,
  onClose,
  onSaved,
  onRoomCreated,
  onCategoryCreated,
  onOpenPrefixConfig,
  onOpenRoomCategories,
}) => {
  const isEditing = Boolean(editingItem);

  // Workflow Step: 1 = Local de aplicação, 2 = Imagem do item, 3 = Informações do item
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Scope & Location states
  const [distributionMode, setDistributionMode] = useState<'single' | 'multiple' | 'none'>('single');
  const [roomId, setRoomId] = useState('');
  const [distributionRows, setDistributionRows] = useState<FormDistributionRow[]>([]);
  const [selectedFloorPlanCategoryId, setSelectedFloorPlanCategoryId] = useState<string | null>(null);
  const [isFloorPlanExpanded, setIsFloorPlanExpanded] = useState<boolean>(true);
  const [uncategorizedRoomWarning, setUncategorizedRoomWarning] = useState<Room | null>(null);

  // Step 2: Photograph states
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null);
  const [compressedImage, setCompressedImage] = useState<CompressedImageResult | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);

  // Step 3: Information states
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [inventoryType, setInventoryType] = useState<InventoryType>('individual');
  const [inspectionType, setInspectionType] = useState<InspectionType>('physical_integrity');
  const [expectedQuantity, setExpectedQuantity] = useState<number>(1);
  const [identificationCode, setIdentificationCode] = useState('');
  const [customCodeEdited, setCustomCodeEdited] = useState(false);
  const [selectedPrefix, setSelectedPrefix] = useState('TG');
  const [prefixDigits, setPrefixDigits] = useState(2);
  const [batchGenerateIndividual, setBatchGenerateIndividual] = useState(true);
  const [description, setDescription] = useState('');
  const [singleCondition, setSingleCondition] = useState<ConditionStatus>('good');
  const [singleNotes, setSingleNotes] = useState('');

  // Quick-add Room / Category inline states
  const [showQuickRoom, setShowQuickRoom] = useState(false);
  const [quickRoomName, setQuickRoomName] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const [showQuickCategory, setShowQuickCategory] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Submission & Feedback states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fastSuccessBanner, setFastSuccessBanner] = useState<string | null>(null);

  // Register Android Hardware Back Button and Gesture Handler for InventoryItemFormModal
  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerBackHandler('InventoryItemFormModal', 60, () => {
      // 1. Close live camera modal if active
      if (isLiveCameraOpen) {
        setIsLiveCameraOpen(false);
        return true;
      }
      // 2. Close quick add room popup if open
      if (showQuickRoom) {
        setShowQuickRoom(false);
        return true;
      }
      // 3. Close quick add category popup if open
      if (showQuickCategory) {
        setShowQuickCategory(false);
        return true;
      }
      // 4. Multi-step form step back: Step 3 -> Step 2
      if (currentStep === 3) {
        setCurrentStep(2);
        return true;
      }
      // 5. Multi-step form step back: Step 2 -> Step 1
      if (currentStep === 2) {
        setCurrentStep(1);
        return true;
      }
      // 6. At Step 1, close modal
      if (currentStep === 1) {
        onClose();
        return true;
      }
      return false;
    });

    return unregister;
  }, [
    isOpen,
    isLiveCameraOpen,
    showQuickRoom,
    showQuickCategory,
    currentStep,
    onClose,
  ]);

  // File inputs
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const prefixRules = useMemo(() => getCodePrefixRules(), [isOpen]);

  const existingCodes = useMemo(
    () =>
      existingItems
        .filter((it) => !editingItem || it.id !== editingItem.id)
        .map((it) => it.identification_code),
    [existingItems, editingItem]
  );

  const distributionTotal = useMemo(() => {
    return distributionRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  }, [distributionRows]);

  // Selected room and category objects for display
  const selectedRoomObj = useMemo(
    () => rooms.find((r) => r.id === roomId) || null,
    [rooms, roomId]
  );

  const selectedCategoryObj = useMemo(
    () => roomCategories.find((c) => c.id === selectedFloorPlanCategoryId) || null,
    [roomCategories, selectedFloorPlanCategoryId]
  );

  // Reset or initialize form
  const resetFormState = (initialRoomId?: string) => {
    setCurrentStep(1);
    setName('');
    setCategoryId('');
    setInventoryType('individual');
    setInspectionType('physical_integrity');
    setCustomCodeEdited(false);
    setDescription('');
    setBatchGenerateIndividual(true);
    setSingleCondition('good');
    setSingleNotes('');
    setExistingImagePath(null);
    if (compressedImage?.previewUrl) {
      URL.revokeObjectURL(compressedImage.previewUrl);
    }
    setCompressedImage(null);
    setSelectedFloorPlanCategoryId(null);
    setUncategorizedRoomWarning(null);

    const targetRoomId = initialRoomId || defaultRoomId;
    if (targetRoomId && targetRoomId !== 'all') {
      setDistributionMode('single');
      setRoomId(targetRoomId);
      setExpectedQuantity(1);
      setDistributionRows([]);
    } else if (rooms.length > 0) {
      setDistributionMode('single');
      setRoomId(rooms[0].id);
      setExpectedQuantity(1);
      setDistributionRows([]);
    } else {
      setDistributionMode('none');
      setRoomId('');
      setExpectedQuantity(1);
      setDistributionRows([]);
    }

    const defaultPref = prefixRules[0]?.prefix || 'TG';
    const defaultDig = prefixRules[0]?.digits || 2;
    setSelectedPrefix(defaultPref);
    setPrefixDigits(defaultDig);
    const next = generateNextCodes(defaultPref, existingCodes, 1, defaultDig);
    setIdentificationCode(next[0] || 'TG01');
  };

  // Initialize form when opened or when editingItem changes
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setFastSuccessBanner(null);
    setShowQuickRoom(false);
    setShowQuickCategory(false);

    if (editingItem) {
      setCurrentStep(1);
      setName(editingItem.name);
      setCategoryId(editingItem.category_id || '');
      setInventoryType(editingItem.inventory_type);
      setInspectionType(editingItem.inspection_type || 'physical_integrity');
      setIdentificationCode(editingItem.identification_code || '');
      setCustomCodeEdited(true);
      setExistingImagePath(editingItem.image_path || null);
      setDescription(editingItem.description || '');
      setBatchGenerateIndividual(false);

      const existingAssignments = editingItem.room_assignments || [];
      if (existingAssignments.length > 1) {
        setDistributionMode('multiple');
        setDistributionRows(
          existingAssignments.map((a, idx) => ({
            key: a.id || `row-${idx}-${Date.now()}`,
            room_id: a.room_id,
            quantity: a.quantity || 1,
            condition_status: a.condition_status || 'good',
            condition_notes: a.condition_notes || '',
          }))
        );
        const firstRoom = rooms.find((r) => r.id === existingAssignments[0]?.room_id);
        setRoomId(firstRoom?.id || '');
        setSelectedFloorPlanCategoryId(firstRoom?.room_category_id || null);
        setSingleCondition('good');
        setSingleNotes('');
        setExpectedQuantity(editingItem.total_quantity || editingItem.expected_quantity || 1);
      } else if (existingAssignments.length === 1) {
        const singleAss = existingAssignments[0];
        setDistributionMode('single');
        setRoomId(singleAss.room_id);
        setSelectedFloorPlanCategoryId(null);
        setSingleCondition(singleAss.condition_status || 'good');
        setSingleNotes(singleAss.condition_notes || '');
        setExpectedQuantity(singleAss.quantity || 1);
        setDistributionRows([]);
      } else if (editingItem.room_id) {
        setDistributionMode('single');
        setRoomId(editingItem.room_id);
        setSelectedFloorPlanCategoryId(null);
        setSingleCondition('good');
        setSingleNotes('');
        setExpectedQuantity(editingItem.expected_quantity || 1);
        setDistributionRows([]);
      } else {
        // Global item
        setDistributionMode('none');
        setRoomId('');
        setSelectedFloorPlanCategoryId(null);
        setSingleCondition('good');
        setSingleNotes('');
        setExpectedQuantity(editingItem.total_quantity ?? editingItem.expected_quantity ?? 1);
        setDistributionRows([]);
      }
    } else {
      resetFormState();
    }
  }, [isOpen, editingItem]);

  // Auto-update suggested prefix & code when item name or category changes (unless manually edited)
  useEffect(() => {
    if (!isOpen || isEditing || inventoryType !== 'individual' || customCodeEdited) {
      return;
    }
    const catObj = categories.find((c) => c.id === categoryId);
    if (name.trim().length >= 2) {
      const inferred = inferPrefixForItem(name, catObj?.name, prefixRules);
      setSelectedPrefix(inferred.prefix);
      setPrefixDigits(inferred.digits);
      const next = generateNextCodes(inferred.prefix, existingCodes, 1, inferred.digits);
      if (next[0]) {
        setIdentificationCode(next[0]);
      }
    }
  }, [name, categoryId, inventoryType, customCodeEdited, existingCodes, isOpen, isEditing]);

  // Check if current identificationCode is a duplicate
  const isDuplicateCode = useMemo(() => {
    if (!identificationCode.trim()) return false;
    const upper = identificationCode.trim().toUpperCase();
    return existingCodes.some((c) => c && c.trim().toUpperCase() === upper);
  }, [identificationCode, existingCodes]);

  // Preview of batch codes if registering multiple individual units at once
  const batchCodesPreview = useMemo(() => {
    if (
      isEditing ||
      inventoryType !== 'individual' ||
      expectedQuantity <= 1 ||
      !batchGenerateIndividual
    ) {
      return [];
    }
    const count = Math.min(expectedQuantity, 50);
    return generateNextCodes(selectedPrefix, existingCodes, count, prefixDigits);
  }, [
    isEditing,
    inventoryType,
    expectedQuantity,
    batchGenerateIndividual,
    selectedPrefix,
    existingCodes,
    prefixDigits,
  ]);

  if (!isOpen) return null;

  // Prefix selection handler
  const handleSelectPrefixRule = (prefix: string, digits = 2) => {
    setSelectedPrefix(prefix);
    setPrefixDigits(digits);
    setCustomCodeEdited(false);
    const next = generateNextCodes(prefix, existingCodes, 1, digits);
    if (next[0]) {
      setIdentificationCode(next[0]);
    }
  };

  const handleRegenerateCode = () => {
    const next = generateNextCodes(selectedPrefix, existingCodes, 1, prefixDigits);
    if (next[0]) {
      setIdentificationCode(next[0]);
      setCustomCodeEdited(false);
    }
  };

  // Image handlers
  const handlePhotoSelected = async (fileOrBlob: File | Blob) => {
    setErrorMsg(null);
    setIsCompressingPhoto(true);
    try {
      const result = await compressImageForUpload(fileOrBlob, 1280, 0.82);
      if (compressedImage?.previewUrl) {
        URL.revokeObjectURL(compressedImage.previewUrl);
      }
      setCompressedImage(result);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao processar a fotografia selecionada.');
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePhotoSelected(file);
    }
    e.target.value = '';
  };

  const handleRemovePhoto = () => {
    if (compressedImage?.previewUrl) {
      URL.revokeObjectURL(compressedImage.previewUrl);
    }
    setCompressedImage(null);
    setExistingImagePath(null);
  };

  // Quick Room & Category creation
  const handleQuickCreateRoom = async () => {
    if (!quickRoomName.trim()) return;
    setIsCreatingRoom(true);
    setErrorMsg(null);
    try {
      const newRoom = await createRoom(quickRoomName);
      onRoomCreated(newRoom);
      setRoomId(newRoom.id);
      setQuickRoomName('');
      setShowQuickRoom(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar cômodo.');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleQuickCreateCategory = async () => {
    if (!quickCategoryName.trim()) return;
    setIsCreatingCategory(true);
    setErrorMsg(null);
    try {
      const newCat = await createCategory(quickCategoryName);
      onCategoryCreated(newCat);
      setCategoryId(newCat.id);
      setQuickCategoryName('');
      setShowQuickCategory(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar categoria.');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  // Multi-room category activation
  const activateMultipleRoomsForRoom = (targetRoomId: string) => {
    const targetRoom = rooms.find((r) => r.id === targetRoomId);
    setDistributionMode('multiple');
    setRoomId(targetRoomId);

    if (targetRoom?.room_category_id) {
      const cat = roomCategories.find((c) => c.id === targetRoom.room_category_id);
      setSelectedFloorPlanCategoryId(targetRoom.room_category_id);
      setUncategorizedRoomWarning(null);

      // Find all physical rooms belonging to this category
      const matchingRooms = rooms.filter((r) => r.room_category_id === targetRoom.room_category_id);
      const existingMap = new Map(distributionRows.map((row) => [row.room_id, row]));

      const newRows: FormDistributionRow[] = matchingRooms.map((r, idx) => {
        const existing = existingMap.get(r.id);
        return {
          key: existing?.key || `cat-dist-${r.id}-${Date.now()}-${idx}`,
          room_id: r.id,
          quantity: existing ? existing.quantity : 1,
          condition_status: existing ? existing.condition_status : 'good',
          condition_notes: existing ? existing.condition_notes : '',
        };
      });

      setDistributionRows(newRows);
      const sum = newRows.reduce((acc, row) => acc + (Number(row.quantity) || 0), 0);
      setExpectedQuantity(sum || 1);
    } else {
      // Room has no category!
      setSelectedFloorPlanCategoryId(null);
      setUncategorizedRoomWarning(targetRoom || null);

      const existingMap = new Map(distributionRows.map((row) => [row.room_id, row]));
      if (!existingMap.has(targetRoomId)) {
        setDistributionRows([
          {
            key: `dist-${Date.now()}-1`,
            room_id: targetRoomId,
            quantity: expectedQuantity || 1,
            condition_status: singleCondition,
            condition_notes: singleNotes,
          },
        ]);
      }
    }
  };

  const handleSelectCategoryOnFloorPlan = (cat: RoomCategory | null) => {
    if (!cat) {
      setSelectedFloorPlanCategoryId(null);
      return;
    }
    setSelectedFloorPlanCategoryId(cat.id);
    setDistributionMode('multiple');
    setUncategorizedRoomWarning(null);

    const matchingRooms = rooms.filter((r) => r.room_category_id === cat.id);
    if (matchingRooms.length > 0) {
      if (!roomId || !matchingRooms.some((r) => r.id === roomId)) {
        setRoomId(matchingRooms[0].id);
      }
      const existingMap = new Map(distributionRows.map((r) => [r.room_id, r]));
      const newRows: FormDistributionRow[] = matchingRooms.map((r, idx) => {
        const existing = existingMap.get(r.id);
        return {
          key: existing?.key || `cat-dist-${r.id}-${Date.now()}-${idx}`,
          room_id: r.id,
          quantity: existing ? existing.quantity : 1,
          condition_status: existing ? existing.condition_status : 'good',
          condition_notes: existing ? existing.condition_notes : '',
        };
      });
      setDistributionRows(newRows);
      const sum = newRows.reduce((acc, row) => acc + (Number(row.quantity) || 0), 0);
      setExpectedQuantity(sum || 1);
    }
  };

  const handleSelectRoomOnFloorPlan = (selectedRoom: Room) => {
    if (distributionMode === 'multiple') {
      activateMultipleRoomsForRoom(selectedRoom.id);
    } else {
      setDistributionMode('single');
      setRoomId(selectedRoom.id);
      setSelectedFloorPlanCategoryId(null);
      setUncategorizedRoomWarning(null);
    }
  };

  const handleAddDistributionRow = () => {
    const usedRoomIds = new Set(distributionRows.map((r) => r.room_id));
    const availableRoom = rooms.find((r) => !usedRoomIds.has(r.id)) || rooms[0];
    if (!availableRoom) return;

    setDistributionRows((prev) => [
      ...prev,
      {
        key: `dist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        room_id: availableRoom.id,
        quantity: 1,
        condition_status: 'good',
        condition_notes: '',
      },
    ]);
  };

  const handleUpdateDistributionRow = (
    index: number,
    field: keyof FormDistributionRow,
    value: any
  ) => {
    setDistributionRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'quantity') {
        const sum = updated.reduce((acc, row) => acc + (parseInt(row.quantity as any, 10) || 0), 0);
        setExpectedQuantity(sum || 1);
      }
      return updated;
    });
  };

  const handleRemoveDistributionRow = (index: number) => {
    setDistributionRows((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      const sum = updated.reduce((acc, row) => acc + (parseInt(row.quantity as any, 10) || 0), 0);
      setExpectedQuantity(sum || 1);
      return updated;
    });
  };

  // Step 1 Validation before proceeding
  const validateStep1 = (): boolean => {
    setErrorMsg(null);
    if (distributionMode === 'single') {
      if (!roomId) {
        setErrorMsg('Selecione exatamente um cômodo na planta ou na lista para continuar.');
        return false;
      }
    } else if (distributionMode === 'multiple') {
      if (distributionRows.length === 0) {
        setErrorMsg('Selecione um cômodo na planta para identificar a categoria ou adicione cômodos à distribuição.');
        return false;
      }
      const hasEmptyRoom = distributionRows.some((r) => !r.room_id);
      if (hasEmptyRoom) {
        setErrorMsg('Selecione o cômodo para todas as linhas de distribuição.');
        return false;
      }
    }
    return true;
  };

  const handleGoToStep = (target: 1 | 2 | 3) => {
    if (target === currentStep) return;
    if (target > currentStep && currentStep === 1) {
      if (!validateStep1()) return;
    }
    setErrorMsg(null);
    setCurrentStep(target);
  };

  // Final submission in Step 3
  const handleSubmit = async (keepOpenForNext: boolean) => {
    setErrorMsg(null);
    setFastSuccessBanner(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('Informe o nome do item.');
      return;
    }

    if (distributionMode === 'single') {
      if (!roomId) {
        setErrorMsg('Selecione o cômodo onde o item fica alocado ou mude para "Global".');
        return;
      }
      if (!Number.isInteger(expectedQuantity) || expectedQuantity < 1) {
        setErrorMsg('A quantidade esperada deve ser pelo menos 1.');
        return;
      }
    } else if (distributionMode === 'multiple') {
      if (distributionRows.length === 0) {
        setErrorMsg('Adicione pelo menos um cômodo na lista de distribuição ou altere o escopo.');
        return;
      }
      const hasEmptyRoom = distributionRows.some((r) => !r.room_id);
      if (hasEmptyRoom) {
        setErrorMsg('Selecione o cômodo para todas as linhas de distribuição.');
        return;
      }
      const hasInvalidQty = distributionRows.some((r) => !Number.isInteger(r.quantity) || r.quantity < 1);
      if (hasInvalidQty) {
        setErrorMsg('Todas as quantidades na distribuição devem ser números inteiros maiores que zero.');
        return;
      }
      const roomIds = distributionRows.map((r) => r.room_id);
      if (new Set(roomIds).size !== roomIds.length) {
        setErrorMsg('Existem cômodos duplicados na distribuição. Ajuste para que cada cômodo apareça apenas uma vez.');
        return;
      }
    } else {
      if (!Number.isInteger(expectedQuantity) || expectedQuantity < 0) {
        setErrorMsg('A quantidade total prevista não pode ser negativa.');
        return;
      }
    }

    const effectiveTotalQuantity =
      distributionMode === 'multiple'
        ? Math.max(1, distributionTotal)
        : Math.max(1, expectedQuantity);

    const isBatchIndividual =
      !isEditing &&
      inventoryType === 'individual' &&
      effectiveTotalQuantity > 1 &&
      batchGenerateIndividual;

    if (inventoryType === 'individual' && !isBatchIndividual) {
      if (!identificationCode.trim()) {
        setErrorMsg('Itens individuais exigem um código de identificação.');
        return;
      }
      if (isDuplicateCode) {
        setErrorMsg(
          `O código "${identificationCode.trim().toUpperCase()}" já está cadastrado. Gere o próximo código disponível ou altere manualmente.`
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      let finalImagePath = existingImagePath;

      // Upload new compressed photo to Supabase Storage if selected
      if (compressedImage) {
        finalImagePath = await uploadInventoryPhoto(compressedImage.blob, cleanName);
      }

      let targetRoomId: string | null = null;
      let finalAssignments: UpsertRoomAssignmentInput[] = [];

      if (distributionMode === 'single') {
        targetRoomId = roomId;
        finalAssignments = [
          {
            room_id: roomId,
            quantity: effectiveTotalQuantity,
            condition_status: singleCondition,
            condition_notes: singleNotes.trim() || null,
          },
        ];
      } else if (distributionMode === 'multiple') {
        targetRoomId = distributionRows[0]?.room_id || null;
        finalAssignments = distributionRows.map((r) => ({
          room_id: r.room_id,
          quantity: Math.max(1, r.quantity),
          condition_status: r.condition_status,
          condition_notes: r.condition_notes.trim() || null,
        }));
      } else {
        targetRoomId = null;
        finalAssignments = [];
      }

      let savedRecords: InventoryItem[] = [];

      if (isEditing && editingItem) {
        const prevImage = editingItem.image_path;
        const updated = await updateInventoryItem(editingItem.id, {
          name: cleanName,
          room_id: targetRoomId,
          category_id: categoryId || null,
          inventory_type: inventoryType,
          inspection_type: inspectionType,
          expected_quantity: effectiveTotalQuantity,
          identification_code:
            inventoryType === 'individual'
              ? identificationCode.trim().toUpperCase()
              : identificationCode.trim()
              ? identificationCode.trim().toUpperCase()
              : null,
          image_path: finalImagePath,
          description: description.trim() || null,
          assignments: finalAssignments,
        });

        if (prevImage && prevImage !== finalImagePath) {
          await deleteInventoryPhotoIfUnused(prevImage, editingItem.id).catch(() => {});
        }

        savedRecords = [updated];
      } else if (isBatchIndividual) {
        if (effectiveTotalQuantity > 50) {
          throw new Error('O cadastro em lote individual suporta até 50 unidades por vez.');
        }
        const codes = generateNextCodes(
          selectedPrefix,
          existingCodes,
          effectiveTotalQuantity,
          prefixDigits
        );
        const batchInputs = codes.map((code) => ({
          name: cleanName,
          identification_code: code,
          room_id: targetRoomId,
          category_id: categoryId || null,
          inventory_type: 'individual' as InventoryType,
          inspection_type: inspectionType,
          expected_quantity: 1,
          image_path: finalImagePath,
          description: description.trim() || null,
          initial_assignments:
            distributionMode === 'single' && roomId
              ? [
                  {
                    room_id: roomId,
                    quantity: 1,
                    condition_status: singleCondition,
                    condition_notes: singleNotes.trim() || null,
                  },
                ]
              : [],
        }));
        savedRecords = await createInventoryItemsBatch(batchInputs);
      } else {
        const created = await createInventoryItem({
          name: cleanName,
          identification_code:
            inventoryType === 'individual'
              ? identificationCode.trim().toUpperCase()
              : identificationCode.trim()
              ? identificationCode.trim().toUpperCase()
              : null,
          room_id: targetRoomId,
          category_id: categoryId || null,
          inventory_type: inventoryType,
          inspection_type: inspectionType,
          expected_quantity: effectiveTotalQuantity,
          image_path: finalImagePath,
          description: description.trim() || null,
          initial_assignments: finalAssignments,
        });
        savedRecords = [created];
      }

      onSaved(savedRecords, keepOpenForNext);

      if (keepOpenForNext) {
        // Completely reset form and return to Step 1 for the next item
        resetFormState();
        setFastSuccessBanner(
          savedRecords.length > 1
            ? `${savedRecords.length} itens individuais salvos com sucesso! O formulário foi redefinido para o próximo item.`
            : `Item "${cleanName}" salvo com sucesso! O formulário está pronto para o próximo cadastro.`
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível salvar o item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentPreviewUrl =
    compressedImage?.previewUrl || getInventoryImageUrl(existingImagePath);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${
          currentStep === 1
            ? 'max-w-7xl 2xl:max-w-[1500px] h-[92vh] max-h-[95vh]'
            : 'max-w-3xl max-h-[95vh]'
        } rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col transition-all duration-200`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {isEditing ? 'Editar Item do Inventário' : 'Novo Item do Inventário'}
              </h2>
              <p className="text-xs text-slate-400">
                Fluxo guiado em 3 etapas • Local, Fotografia e Informações
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Step Guided Progress Indicator */}
        <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800">
          <div className="flex items-center justify-between max-w-xl mx-auto">
            {/* Step 1 */}
            <button
              type="button"
              onClick={() => handleGoToStep(1)}
              className="flex items-center gap-2.5 group cursor-pointer text-left"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  currentStep === 1
                    ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 font-black shadow-md shadow-emerald-500/30'
                    : currentStep > 1
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {currentStep > 1 ? <Check className="w-4 h-4 stroke-[3]" /> : '1'}
              </div>
              <div className="hidden sm:block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Etapa 1
                </span>
                <span
                  className={`block text-xs font-extrabold ${
                    currentStep === 1 ? 'text-white' : 'text-slate-300'
                  }`}
                >
                  Local de Aplicação
                </span>
              </div>
            </button>

            <div
              className={`flex-1 h-0.5 mx-3 sm:mx-5 transition-all ${
                currentStep > 1 ? 'bg-emerald-500/60' : 'bg-slate-800'
              }`}
            />

            {/* Step 2 */}
            <button
              type="button"
              onClick={() => handleGoToStep(2)}
              className="flex items-center gap-2.5 group cursor-pointer text-left"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  currentStep === 2
                    ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 font-black shadow-md shadow-emerald-500/30'
                    : currentStep > 2
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {currentStep > 2 ? <Check className="w-4 h-4 stroke-[3]" /> : '2'}
              </div>
              <div className="hidden sm:block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Etapa 2
                </span>
                <span
                  className={`block text-xs font-extrabold ${
                    currentStep === 2 ? 'text-white' : 'text-slate-300'
                  }`}
                >
                  Imagem do Item
                </span>
              </div>
            </button>

            <div
              className={`flex-1 h-0.5 mx-3 sm:mx-5 transition-all ${
                currentStep > 2 ? 'bg-emerald-500/60' : 'bg-slate-800'
              }`}
            />

            {/* Step 3 */}
            <button
              type="button"
              onClick={() => handleGoToStep(3)}
              className="flex items-center gap-2.5 group cursor-pointer text-left"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  currentStep === 3
                    ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 font-black shadow-md shadow-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                3
              </div>
              <div className="hidden sm:block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Etapa 3
                </span>
                <span
                  className={`block text-xs font-extrabold ${
                    currentStep === 3 ? 'text-white' : 'text-slate-300'
                  }`}
                >
                  Informações
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Global Feedback Banners */}
        {fastSuccessBanner && (
          <div className="mx-5 mt-4 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{fastSuccessBanner}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mx-5 mt-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP BODY */}
        <div
          className={`flex-1 ${
            currentStep === 1
              ? 'min-h-0 overflow-y-auto lg:overflow-hidden p-4 sm:p-5'
              : 'overflow-y-auto p-5 space-y-6'
          }`}
        >
          {/* =========================================================================
              STEP 1: LOCAL DE APLICAÇÃO (2/3 PLANTA À ESQUERDA, 1/3 PAINEL À DIREITA)
             ========================================================================= */}
          {currentStep === 1 && (
            <div className="flex flex-col lg:h-full lg:grid lg:grid-cols-12 gap-5 animate-fadeIn min-h-0">
              {/* LEFT COLUMN: 2/3 Interactive Floor Plan (Vertical Rectangle) */}
              <div className="order-1 lg:order-1 lg:col-span-8 flex flex-col shrink-0 lg:shrink h-[68vh] min-h-[580px] sm:min-h-[660px] lg:h-full rounded-3xl border border-slate-800 bg-slate-950 overflow-hidden shadow-inner relative">
                {distributionMode !== 'none' ? (
                  <FloorPlanView
                    key={`floorplan-selector-${distributionMode}`}
                    rooms={rooms}
                    roomCategories={roomCategories}
                    shapes={floorPlanShapes}
                    mode="selector"
                    selectedCategoryId={
                      distributionMode === 'multiple' ? selectedFloorPlanCategoryId : null
                    }
                    selectedRoomId={distributionMode === 'single' ? roomId : null}
                    selectedRoomIds={
                      distributionMode === 'multiple'
                        ? distributionRows.map((r) => r.room_id)
                        : roomId
                        ? [roomId]
                        : []
                    }
                    onSelectRoom={handleSelectRoomOnFloorPlan}
                    onSelectCategory={handleSelectCategoryOnFloorPlan}
                    className="h-full w-full border-0 rounded-none flex-1 min-h-0"
                  />
                ) : (
                  <div className="h-full w-full relative flex flex-col items-center justify-center p-6 bg-slate-950">
                    <FloorPlanView
                      rooms={rooms}
                      roomCategories={roomCategories}
                      shapes={floorPlanShapes}
                      mode="selector"
                      selectedCategoryId={null}
                      selectedRoomId={null}
                      selectedRoomIds={[]}
                      className="h-full w-full border-0 rounded-none absolute inset-0 opacity-20 pointer-events-none"
                    />
                    <div className="relative z-10 max-w-md p-6 sm:p-8 rounded-3xl bg-slate-900/95 border-2 border-indigo-500/40 text-center space-y-3 shadow-2xl backdrop-blur-md">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
                        <Globe className="w-8 h-8" />
                      </div>
                      <h4 className="text-lg font-black text-white">Item de Escopo Global</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Este item pertence ao catálogo geral da chácara e não fica alocado em um cômodo específico.
                        A seleção de cômodo na planta baixa não é necessária.
                      </p>
                      <div className="pt-2">
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Clique em "Continuar" para foto e informações</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: 1/3 Selection Options & Context Panel (4 cols of 12 = 33.33%) */}
              <div className="order-2 lg:order-2 lg:col-span-4 flex flex-col gap-3.5 overflow-y-auto pr-1">
                {/* Header */}
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    Etapa 1 • Local de Aplicação
                  </span>
                  <h3 className="text-sm font-black text-white">
                    Escopo de Localização
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Defina onde o item existirá na propriedade:
                  </p>
                </div>

                {/* 3 Scope Selection Cards */}
                <div className="space-y-2">
                  {/* Option 1: Cômodo individual */}
                  <button
                    type="button"
                    onClick={() => {
                      setDistributionMode('single');
                      setSelectedFloorPlanCategoryId(null);
                      setUncategorizedRoomWarning(null);
                      const activeId = roomId || distributionRows[0]?.room_id || rooms[0]?.id || '';
                      if (activeId) {
                        setRoomId(activeId);
                      }
                    }}
                    className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all flex items-center gap-3 ${
                      distributionMode === 'single'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                        : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        distributionMode === 'single'
                          ? 'bg-emerald-500 text-slate-950 font-black'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Home className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white">Cômodo individual</span>
                        {distributionMode === 'single' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20" />
                        )}
                      </div>
                      <span className="block text-[11px] text-slate-400 mt-0.5 truncate leading-tight">
                        Alocado em apenas 1 cômodo físico
                      </span>
                    </div>
                  </button>

                  {/* Option 2: Vários cômodos */}
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = roomId || distributionRows[0]?.room_id || rooms[0]?.id || '';
                      if (targetId) {
                        activateMultipleRoomsForRoom(targetId);
                      } else {
                        setDistributionMode('multiple');
                      }
                    }}
                    className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all flex items-center gap-3 ${
                      distributionMode === 'multiple'
                        ? 'bg-sky-500/15 border-sky-500 text-white shadow-lg shadow-sky-500/10'
                        : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        distributionMode === 'multiple'
                          ? 'bg-sky-500 text-slate-950 font-black'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white">Vários cômodos</span>
                        {distributionMode === 'multiple' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-sky-400 ring-4 ring-sky-500/20" />
                        )}
                      </div>
                      <span className="block text-[11px] text-slate-400 mt-0.5 truncate leading-tight">
                        Por categoria (ex: todos os Quartos)
                      </span>
                    </div>
                  </button>

                  {/* Option 3: Global */}
                  <button
                    type="button"
                    onClick={() => {
                      setDistributionMode('none');
                      setRoomId('');
                      setSelectedFloorPlanCategoryId(null);
                      setUncategorizedRoomWarning(null);
                      setDistributionRows([]);
                    }}
                    className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all flex items-center gap-3 ${
                      distributionMode === 'none'
                        ? 'bg-indigo-500/15 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                        : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        distributionMode === 'none'
                          ? 'bg-indigo-500 text-white font-black'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Globe className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white">Global</span>
                        {distributionMode === 'none' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 ring-4 ring-indigo-500/20" />
                        )}
                      </div>
                      <span className="block text-[11px] text-slate-400 mt-0.5 truncate leading-tight">
                        Sem cômodo específico (geral da chácara)
                      </span>
                    </div>
                  </button>
                </div>

                {/* Contextual Details Panel */}
                <div className="space-y-3 pt-1">
                  {/* Single Room Context */}
                  {distributionMode === 'single' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="w-4 h-4 stroke-[2.5]" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                              Cômodo Selecionado
                            </span>
                            <p className="text-sm font-black text-white leading-tight">
                              {selectedRoomObj
                                ? `${selectedRoomObj.name}${
                                    selectedRoomObj.suite?.name
                                      ? ` (${selectedRoomObj.suite.name})`
                                      : ''
                                  }`
                                : 'Toque em um cômodo na planta'}
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-snug">
                          Apenas este cômodo receberá o item cadastrado. Toque em outro cômodo na planta ao lado para alterar.
                        </p>
                      </div>

                      {/* Dropdown alternative & quick add room */}
                      <div className="space-y-1.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                        <label className="text-[11px] font-bold text-slate-400 block">
                          Ou escolha na lista de cômodos:
                        </label>
                        {showQuickRoom ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={quickRoomName}
                              onChange={(e) => setQuickRoomName(e.target.value)}
                              placeholder="Nome do cômodo (ex: Lavabo)"
                              className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-emerald-500/60 text-xs text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleQuickCreateRoom}
                              disabled={isCreatingRoom}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold shrink-0"
                            >
                              {isCreatingRoom ? '...' : 'Criar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowQuickRoom(false)}
                              className="p-1.5 rounded-xl bg-slate-800 text-slate-400 shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={roomId}
                              onChange={(e) => setRoomId(e.target.value)}
                              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-medium focus:border-emerald-500 focus:outline-none"
                            >
                              <option value="">Selecione um cômodo...</option>
                              {rooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} {r.suite?.name ? `(${r.suite.name})` : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setShowQuickRoom(true)}
                              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 shrink-0"
                              title="Cadastrar novo cômodo"
                            >
                              <Plus className="w-4 h-4 text-emerald-400" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Multiple Rooms Context */}
                  {distributionMode === 'multiple' && (
                    <div className="space-y-3 animate-fadeIn">
                      {selectedFloorPlanCategoryId ? (
                        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-2.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold"
                              style={{
                                backgroundColor: `${selectedCategoryObj?.color || '#38bdf8'}25`,
                                color: selectedCategoryObj?.color || '#38bdf8',
                              }}
                            >
                              <Layers className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 block">
                                Categoria Identificada
                              </span>
                              <p className="text-sm font-black text-white leading-tight">
                                {selectedCategoryObj?.name || 'Categoria'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs font-bold text-sky-200 bg-slate-950/70 p-2.5 rounded-xl border border-sky-500/20">
                            <span>Cômodos selecionados:</span>
                            <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-mono font-black">
                              {distributionRows.length} cômodos
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                            {distributionRows.map((row) => {
                              const r = rooms.find((rm) => rm.id === row.room_id);
                              return (
                                <span
                                  key={row.key}
                                  className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-semibold text-slate-300 flex items-center gap-1"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                                  {r?.name || 'Cômodo'}
                                </span>
                              );
                            })}
                          </div>

                          <p className="text-[10px] text-slate-400 italic leading-snug">
                            Toque em outro cômodo na planta para alternar a categoria. As quantidades individuais de cada cômodo serão configuradas na Etapa 3.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 space-y-1">
                          <p className="font-bold text-slate-300">Nenhum cômodo selecionado</p>
                          <p className="text-[11px] text-slate-400 leading-snug">
                            Toque em qualquer cômodo na planta ao lado (ex: um quarto) para que o sistema identifique sua categoria e selecione automaticamente todos os cômodos correspondentes.
                          </p>
                        </div>
                      )}

                      {/* Warning if room without category was picked */}
                      {uncategorizedRoomWarning && (
                        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-amber-300 block">
                                Cômodo sem categoria
                              </span>
                              <p className="text-[11px] leading-snug">
                                <strong>"{uncategorizedRoomWarning.name}"</strong> não possui categoria vinculada.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setUncategorizedRoomWarning(null)}
                              className="flex-1 py-1 rounded-xl bg-amber-500/20 text-amber-300 text-[11px] font-bold border border-amber-500/40"
                            >
                              Continuar com este cômodo
                            </button>
                            {onOpenRoomCategories && (
                              <button
                                type="button"
                                onClick={onOpenRoomCategories}
                                className="px-2.5 py-1 rounded-xl bg-slate-900 text-purple-300 text-[11px] font-bold border border-purple-500/40 flex items-center gap-1"
                              >
                                <Tag className="w-3 h-3 text-purple-400" />
                                <span>Categorias</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Global Context */}
                  {distributionMode === 'none' && (
                    <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2 text-xs animate-fadeIn">
                      <div className="flex items-center gap-2 text-indigo-400 font-black">
                        <Globe className="w-4 h-4" />
                        <span>Escopo Global Ativo</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        O item pertencerá ao inventário geral da propriedade sem vinculação a cômodo físico específico.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-2 hidden lg:block">
                  <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Toque e arraste na planta ao lado para navegar e dar zoom.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              STEP 2: IMAGEM DO ITEM
             ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Fotografia do Item
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tire uma foto ou selecione da galeria. Esta etapa é opcional.
                </p>
              </div>

              {/* Hidden Native File Inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {currentPreviewUrl ? (
                <div className="relative rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl space-y-3 p-4">
                  <div className="aspect-[16/9] w-full flex items-center justify-center bg-slate-950 rounded-2xl overflow-hidden border border-slate-900">
                    <img
                      src={currentPreviewUrl}
                      alt="Pré-visualização do item"
                      className="max-h-72 w-full object-contain"
                    />
                  </div>

                  {compressedImage && (
                    <div className="px-4 py-2 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                      <span>
                        Imagem otimizada ({compressedImage.width}x{compressedImage.height}px)
                      </span>
                      <span className="text-emerald-400 font-bold">
                        {formatBytes(compressedImage.originalBytes)} →{' '}
                        {formatBytes(compressedImage.compressedBytes)}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5 transition-colors border border-slate-700"
                      >
                        <Camera className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Trocar (Câmera)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsLiveCameraOpen(true)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5 transition-colors border border-slate-700"
                      >
                        <Video className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Visor ao Vivo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5 transition-colors border border-slate-700"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                        <span>Galeria</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs font-bold flex items-center gap-1.5 transition-colors border border-rose-500/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover Foto</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-3xl border-2 border-dashed border-slate-800 bg-slate-950/40 flex flex-col items-center justify-center text-center gap-4">
                  {isCompressingPhoto ? (
                    <div className="py-8 flex flex-col items-center gap-3 text-emerald-400">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="text-xs font-bold">
                        Otimizando fotografia para armazenamento...
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shadow-inner">
                        <Camera className="w-7 h-7" />
                      </div>
                      <div className="space-y-1 max-w-sm">
                        <p className="text-sm font-bold text-slate-200">
                          Tire uma foto ou escolha da galeria do aparelho
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          As imagens são automaticamente comprimidas para carregamento rápido nas conferências de checklist.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-500/10 transition-all"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Câmera do Celular</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsLiveCameraOpen(true)}
                          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700 transition-colors"
                        >
                          <Video className="w-4 h-4 text-emerald-400" />
                          <span>Visor ao Vivo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700 transition-colors"
                        >
                          <Upload className="w-4 h-4 text-sky-400" />
                          <span>Escolher da Galeria</span>
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-500 italic pt-2">
                        Caso prefira cadastrar sem foto, basta clicar em "Continuar" abaixo.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              STEP 3: INFORMAÇÕES DO ITEM
             ========================================================================= */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              {/* Context Summary Header Bar */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {currentPreviewUrl ? (
                    <img
                      src={currentPreviewUrl}
                      alt="Thumbnail"
                      className="w-10 h-10 rounded-xl object-cover border border-slate-800 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Escopo Definido na Etapa 1
                    </span>
                    <div className="flex items-center gap-2 text-xs font-black text-white">
                      {distributionMode === 'single' ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Home className="w-3.5 h-3.5" />
                          {selectedRoomObj?.name || 'Cômodo Único'}
                        </span>
                      ) : distributionMode === 'multiple' ? (
                        <span className="text-sky-400 flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          Categoria: {selectedCategoryObj?.name || 'Vários Cômodos'} ({distributionRows.length} cômodos)
                        </span>
                      ) : (
                        <span className="text-indigo-400 flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5" />
                          Item Global (Catálogo Geral)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleGoToStep(1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 text-slate-400 hover:text-white text-[11px] font-bold border border-slate-800"
                >
                  Alterar Local
                </button>
              </div>

              {/* Group 1: Basic Identification */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                <span className="text-xs font-black uppercase tracking-wider text-slate-300 block">
                  1. Identificação Básica do Item
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Nome do Item *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={
                        inventoryType === 'individual'
                          ? 'Ex: Pote Plástico Grande, Smart TV 50", Liquidificador...'
                          : 'Ex: Travesseiros, Copos de Vidro, Pratos Rasos, Toalhas...'
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder-slate-500 font-semibold"
                    />
                  </div>

                  {/* Category Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-sky-400" />
                        <span>Categoria de Inventário</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickCategory((v) => !v)}
                        className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-0.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nova</span>
                      </button>
                    </div>

                    {showQuickCategory ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={quickCategoryName}
                          onChange={(e) => setQuickCategoryName(e.target.value)}
                          placeholder="Ex: Utensílios de Cozinha"
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-sky-500/60 text-xs text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleQuickCreateCategory}
                          disabled={isCreatingCategory}
                          className="px-3 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-bold"
                        >
                          {isCreatingCategory ? '...' : 'Criar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowQuickCategory(false)}
                          className="p-2 rounded-xl bg-slate-800 text-slate-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-500 focus:outline-none text-xs text-white"
                      >
                        <option value="">Sem categoria específica</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Description / Notes */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Descrição / Observações (Opcional)
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ex: Marca Marinex, cor azul, detalhes de fábrica..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs text-white placeholder-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* Group 2: Control Type */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                <span className="text-xs font-black uppercase tracking-wider text-slate-300 block">
                  2. Tipo de Controle no Inventário
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setInventoryType('individual');
                      if (!identificationCode) {
                        const next = generateNextCodes(selectedPrefix, existingCodes, 1, prefixDigits);
                        setIdentificationCode(next[0] || 'TG01');
                      }
                    }}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all flex items-start gap-3 ${
                      inventoryType === 'individual'
                        ? 'bg-indigo-500/15 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        inventoryType === 'individual'
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Hash className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="block text-xs font-extrabold text-white">
                        Item Individual (Com Código Único)
                      </span>
                      <span className="block text-[11px] text-slate-400 mt-0.5 leading-snug">
                        Identificado com etiqueta única (ex: TG01, TM02, TV01, Liquidificador)
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInventoryType('quantity');
                    }}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all flex items-start gap-3 ${
                      inventoryType === 'quantity'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        inventoryType === 'quantity'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="block text-xs font-extrabold text-white">
                        Por Quantidade Total
                      </span>
                      <span className="block text-[11px] text-slate-400 mt-0.5 leading-snug">
                        Contagem física de unidades (ex: 17 travesseiros, 12 copos, pratos, toalhas)
                      </span>
                    </div>
                  </button>
                </div>

                {/* Identification Code Section (if individual) */}
                {inventoryType === 'individual' && (
                  <div className="p-3.5 rounded-2xl bg-indigo-950/25 border border-indigo-500/30 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-200">
                          Código de Identificação
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenPrefixConfig}
                        className="text-[11px] font-semibold text-indigo-300 hover:text-white flex items-center gap-1 underline underline-offset-2"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        <span>Configurar Prefixos (TG, TM, TP...)</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-400 mr-1">Prefixo rápido:</span>
                      {prefixRules.map((rule) => (
                        <button
                          key={rule.id}
                          type="button"
                          onClick={() => handleSelectPrefixRule(rule.prefix, rule.digits)}
                          title={rule.label}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            selectedPrefix === rule.prefix
                              ? 'bg-amber-400 text-slate-950 shadow'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {rule.prefix}
                        </button>
                      ))}
                    </div>

                    {(!batchGenerateIndividual || expectedQuantity === 1 || isEditing) && (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Hash className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={identificationCode}
                            onChange={(e) => {
                              setIdentificationCode(e.target.value.toUpperCase());
                              setCustomCodeEdited(true);
                            }}
                            placeholder="Ex: TG01, TM02, TP01, TV01..."
                            className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border font-mono font-bold text-sm text-amber-300 uppercase focus:outline-none ${
                              isDuplicateCode
                                ? 'border-rose-500 focus:border-rose-500'
                                : 'border-slate-800 focus:border-amber-400'
                            }`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleRegenerateCode}
                          title="Gerar próximo código disponível"
                          className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 shrink-0 border border-slate-700 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                          <span>Próximo Livre</span>
                        </button>
                      </div>
                    )}

                    {isDuplicateCode && (
                      <p className="text-xs text-rose-400 font-semibold flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Este código já está cadastrado no inventário.</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Group 3: Inspection Types (Perguntas de Conferência no Checklist) */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-300 block">
                      3. Tipo de Conferência no Checklist *
                    </span>
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
                      Perguntas Guiadas
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Define qual roteiro de perguntas simples a pessoa responsável pelo checklist verá no celular ao conferir este item.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {INSPECTION_TYPE_OPTIONS.map((opt) => {
                    const isSelected = inspectionType === opt.type;
                    const IconComponent =
                      opt.iconName === 'Zap' ? Zap : opt.iconName === 'Sparkles' ? Sparkles : ShieldCheck;

                    return (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => setInspectionType(opt.type)}
                        className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-3 relative ${
                          isSelected
                            ? `${opt.badgeBg} ${opt.badgeBorder} shadow-lg shadow-black/40`
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}

                        <div className="space-y-2">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isSelected
                                ? `${opt.badgeText} bg-slate-900 border border-current`
                                : 'bg-slate-900 text-slate-500 border border-slate-800'
                            }`}
                          >
                            <IconComponent className="w-5 h-5" />
                          </div>

                          <div>
                            <span
                              className={`block text-xs font-black uppercase tracking-wider ${
                                isSelected ? opt.badgeText : 'text-white'
                              }`}
                            >
                              {opt.title}
                            </span>
                            <span className="block text-[11px] text-slate-300 mt-1 leading-snug">
                              {opt.description}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80">
                          <span className="block text-[10px] text-slate-400 italic leading-tight">
                            Ex: {opt.detailedScope}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group 4: Quantities, Distribution & Physical Condition */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
                <span className="text-xs font-black uppercase tracking-wider text-slate-300 block">
                  4. Quantidade e Estado Físico de Conservação
                </span>

                {/* 3.1 INDIVIDUAL ROOM FIELDS */}
                {distributionMode === 'single' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                          Quantidade no Cômodo ({selectedRoomObj?.name || 'Cômodo'}) *
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Número de unidades presentes neste local
                        </span>
                      </div>
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setExpectedQuantity((q) => Math.max(1, q - 1))}
                          className="px-3 py-2 rounded-l-xl bg-slate-800 hover:bg-slate-700 text-white font-bold border border-r-0 border-slate-700 text-xs"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          value={expectedQuantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setExpectedQuantity(isNaN(val) || val < 1 ? 1 : val);
                          }}
                          className="w-16 px-1 py-2 bg-slate-950 border-y border-slate-700 text-center font-extrabold text-emerald-400 text-sm focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setExpectedQuantity((q) => q + 1)}
                          className="px-3 py-2 rounded-r-xl bg-slate-800 hover:bg-slate-700 text-white font-bold border border-l-0 border-slate-700 text-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Condition Status Selector */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                        Estado Físico / Condição de Conservação *
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {CONDITION_OPTIONS.map((cfg) => {
                          const isSelected = singleCondition === cfg.value;
                          return (
                            <button
                              key={cfg.value}
                              type="button"
                              onClick={() => setSingleCondition(cfg.value)}
                              className={`p-2.5 rounded-xl border text-left transition-all ${
                                isSelected
                                  ? `${cfg.badgeBg} ${cfg.badgeBorder} shadow`
                                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotColor}`} />
                                <span
                                  className={`text-xs font-extrabold truncate ${
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

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                        Observação sobre o Estado Físico (Opcional)
                      </label>
                      <input
                        type="text"
                        value={singleNotes}
                        onChange={(e) => setSingleNotes(e.target.value)}
                        placeholder="Ex: Pequeno desgaste na borda, tecido amarelado, alça com folga..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* 3.2 MULTIPLE ROOMS DISTRIBUTION TABLE */}
                {distributionMode === 'multiple' && (
                  <div className="space-y-3">
                    {/* Distribution Summary & Calculation */}
                    <div className="p-3.5 rounded-2xl bg-sky-950/30 border border-sky-500/40 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 block">
                          Total Calculado na Propriedade
                        </span>
                        <p className="text-base font-black text-white">
                          {distributionTotal} unidades{' '}
                          <span className="text-xs font-semibold text-slate-400">
                            em {distributionRows.length} cômodo(s)
                          </span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddDistributionRow}
                        disabled={distributionRows.length >= rooms.length}
                        className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar Cômodo</span>
                      </button>
                    </div>

                    {/* Room Rows */}
                    <div className="space-y-2.5">
                      {distributionRows.map((row, idx) => {
                        const targetRoom = rooms.find((r) => r.id === row.room_id);
                        const usedInOtherRows = new Set(
                          distributionRows.filter((_, i) => i !== idx).map((r) => r.room_id)
                        );
                        const currentConditionCfg = getConditionConfig(row.condition_status);

                        return (
                          <div
                            key={row.key}
                            className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-white flex items-center gap-1.5">
                                <Home className="w-3.5 h-3.5 text-sky-400" />
                                {targetRoom?.name || `Cômodo #${idx + 1}`}
                                {targetRoom?.suite?.name ? ` (${targetRoom.suite.name})` : ''}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleRemoveDistributionRow(idx)}
                                title="Remover este cômodo da distribuição"
                                className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                  Cômodo
                                </label>
                                <select
                                  value={row.room_id}
                                  onChange={(e) =>
                                    handleUpdateDistributionRow(idx, 'room_id', e.target.value)
                                  }
                                  className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                                >
                                  {rooms.map((r) => (
                                    <option
                                      key={r.id}
                                      value={r.id}
                                      disabled={usedInOtherRows.has(r.id)}
                                    >
                                      {r.name} {r.suite?.name ? `(${r.suite.name})` : ''}{' '}
                                      {usedInOtherRows.has(r.id) ? '— já adicionado' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                  Quantidade
                                </label>
                                <div className="flex items-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateDistributionRow(
                                        idx,
                                        'quantity',
                                        Math.max(1, row.quantity - 1)
                                      )
                                    }
                                    className="px-2.5 py-2 rounded-l-xl bg-slate-800 hover:bg-slate-700 text-white font-bold border border-r-0 border-slate-700 text-xs"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    max={9999}
                                    value={row.quantity}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value, 10);
                                      handleUpdateDistributionRow(
                                        idx,
                                        'quantity',
                                        isNaN(v) || v < 1 ? 1 : v
                                      );
                                    }}
                                    className="w-full px-1 py-2 bg-slate-900 border-y border-slate-700 text-center font-black text-sky-400 text-xs focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateDistributionRow(
                                        idx,
                                        'quantity',
                                        row.quantity + 1
                                      )
                                    }
                                    className="px-2.5 py-2 rounded-r-xl bg-slate-800 hover:bg-slate-700 text-white font-bold border border-l-0 border-slate-700 text-xs"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Condition for this room */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Estado neste cômodo:
                                </label>
                                <span
                                  className={`text-[10px] font-extrabold ${currentConditionCfg.badgeText}`}
                                >
                                  {currentConditionCfg.shortLabel}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                {CONDITION_OPTIONS.map((cfg) => {
                                  const isSel = row.condition_status === cfg.value;
                                  return (
                                    <button
                                      key={cfg.value}
                                      type="button"
                                      onClick={() =>
                                        handleUpdateDistributionRow(
                                          idx,
                                          'condition_status',
                                          cfg.value
                                        )
                                      }
                                      className={`px-2 py-1.5 rounded-lg border text-center transition-all ${
                                        isSel
                                          ? `${cfg.badgeBg} ${cfg.badgeBorder} ${cfg.badgeText} font-black shadow-sm`
                                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`}
                                        />
                                        <span className="text-[10px] truncate">
                                          {cfg.shortLabel}
                                        </span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <input
                              type="text"
                              value={row.condition_notes}
                              onChange={(e) =>
                                handleUpdateDistributionRow(idx, 'condition_notes', e.target.value)
                              }
                              placeholder="Observação de estado neste cômodo (opcional)..."
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3.3 GLOBAL FIELDS */}
                {distributionMode === 'none' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                          Quantidade Total Prevista na Propriedade *
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Total de unidades no catálogo geral
                        </span>
                      </div>
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setExpectedQuantity((q) => Math.max(0, q - 1))}
                          className="px-3 py-2 rounded-l-xl bg-slate-800 hover:bg-slate-700 text-white font-bold border border-r-0 border-slate-700 text-xs"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          value={expectedQuantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setExpectedQuantity(isNaN(val) || val < 0 ? 0 : val);
                          }}
                          className="w-16 px-1 py-2 bg-slate-950 border-y border-slate-700 text-center font-extrabold text-indigo-400 text-sm focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setExpectedQuantity((q) => q + 1)}
                          className="px-3 py-2 rounded-r-xl bg-slate-800 hover:bg-slate-700 text-white font-bold border border-l-0 border-slate-700 text-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                        Estado Físico / Condição do Item
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {CONDITION_OPTIONS.map((cfg) => {
                          const isSelected = singleCondition === cfg.value;
                          return (
                            <button
                              key={cfg.value}
                              type="button"
                              onClick={() => setSingleCondition(cfg.value)}
                              className={`p-2.5 rounded-xl border text-left transition-all ${
                                isSelected
                                  ? `${cfg.badgeBg} ${cfg.badgeBorder} shadow`
                                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotColor}`} />
                                <span
                                  className={`text-xs font-extrabold truncate ${
                                    isSelected ? cfg.badgeText : 'text-slate-300'
                                  }`}
                                >
                                  {cfg.shortLabel}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* STEP FOOTER NAVIGATION & ACTIONS */}
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-3">
          {/* Left Back / Cancel Button */}
          {currentStep === 1 ? (
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleGoToStep((currentStep - 1) as 1 | 2)}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          )}

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {currentStep < 3 ? (
              <button
                type="button"
                onClick={() => handleGoToStep((currentStep + 1) as 2 | 3)}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-black flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </button>
            ) : (
              <>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => handleSubmit(true)}
                    disabled={isSubmitting || isCompressingPhoto}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>Salvar e Adicionar Outro</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={isSubmitting || isCompressingPhoto}
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-black flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Package className="w-4 h-4" />
                      <span>{isEditing ? 'Salvar Alterações' : 'Salvar Item'}</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Live WebRTC Camera Modal */}
      <CameraCaptureModal
        isOpen={isLiveCameraOpen}
        onClose={() => setIsLiveCameraOpen(false)}
        onCapture={(blob) => handlePhotoSelected(blob)}
      />
    </div>
  );
};
