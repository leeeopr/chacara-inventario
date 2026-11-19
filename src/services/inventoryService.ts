import { getSupabaseClient, isSupabaseConfigured, STORAGE_BUCKET } from '../lib/supabase';
import {
  ConditionStatus,
  CreateInventoryItemInput,
  CreateRoomCategoryInput,
  CreateSuiteInput,
  FloorPlanPoint,
  FloorPlanShape,
  FloorPlanShapeType,
  InventoryCategory,
  InventoryItem,
  InventoryRoomAssignment,
  Room,
  RoomCategory,
  RoomChecklistMode,
  RoomType,
  Suite,
  UpdateInventoryItemInput,
  UpdateRoomCategoryInput,
  UpdateSuiteInput,
  UpsertRoomAssignmentInput,
} from '../types/inventory';

function ensureConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'O Supabase ainda não está configurado. Abra "Banco & Nuvem" no topo do aplicativo para informar a URL e a Anon Key do seu projeto Supabase.'
    );
  }
}

function formatSupabaseError(error: any, fallbackMessage: string): Error {
  if (!error) return new Error(fallbackMessage);
  const msg = String(error.message || error.error_description || fallbackMessage);
  const code = String(error.code || '');
  const details = String(error.details || '');

  if (code === '23505' || msg.toLowerCase().includes('duplicate key') || msg.toLowerCase().includes('unique')) {
    if (msg.includes('identification_code')) {
      return new Error('Já existe um item cadastrado com este código de identificação.');
    }
    if (msg.includes('rooms')) {
      return new Error('Já existe um cômodo cadastrado com este nome.');
    }
    if (msg.includes('suites')) {
      return new Error('Já existe uma suíte cadastrada com este nome.');
    }
    if (msg.includes('inventory_categories')) {
      return new Error('Já existe uma categoria cadastrada com este nome.');
    }
    if (msg.includes('inventory_room_assignments') || msg.includes('uq_inventory_item_room')) {
      return new Error('Este item já está distribuído neste cômodo. Edite a distribuição existente.');
    }
    return new Error('Registro duplicado detectado no banco de dados.');
  }

  if (code === '23503' || msg.toLowerCase().includes('foreign key') || details.toLowerCase().includes('foreign key')) {
    if (
      msg.includes('inventory_items') ||
      details.includes('inventory_items') ||
      msg.includes('inventory_room_assignments') ||
      details.includes('inventory_room_assignments')
    ) {
      return new Error('Este cômodo possui itens vinculados ou distribuídos e não pode ser excluído diretamente.');
    }
    if (
      msg.includes('checklist_room_progress') ||
      details.includes('checklist_room_progress') ||
      msg.includes('checklist_item_results') ||
      details.includes('checklist_item_results') ||
      msg.includes('checklist_occurrences') ||
      details.includes('checklist_occurrences')
    ) {
      return new Error(
        'Este cômodo possui registros em conferências anteriores. Aplique a migração 0003 no SQL Editor do Supabase para atualizar a regra de histórico (ON DELETE SET NULL).'
      );
    }
    if (msg.includes('suites') || details.includes('suites')) {
      return new Error('Este registro está associado a uma suíte.');
    }
    return new Error('Este registro possui vínculos no banco de dados e não pode ser removido diretamente.');
  }

  if (
    msg.includes('relation "public.rooms" does not exist') ||
    msg.includes('relation "public.inventory_items" does not exist') ||
    msg.includes('relation "public.inventory_categories" does not exist') ||
    msg.includes('Could not find the table')
  ) {
    return new Error(
      'As tabelas do inventário ainda não foram criadas no Supabase. Abra "Banco & Nuvem" e execute o script SQL no SQL Editor do Supabase.'
    );
  }

  return new Error(msg);
}

// ============================================================================
// ROOMS CRUD
// ============================================================================

export const DEFAULT_ROOM_CATEGORIES: RoomCategory[] = [
  { id: 'cat-quartos', name: 'Quartos', color: '#8b5cf6', icon: 'BedDouble', display_order: 1 },
  { id: 'cat-banheiros', name: 'Banheiros', color: '#06b6d4', icon: 'Bath', display_order: 2 },
  { id: 'cat-sociais', name: 'Áreas Sociais', color: '#3b82f6', icon: 'Users', display_order: 3 },
  { id: 'cat-gourmet', name: 'Área Gourmet', color: '#f59e0b', icon: 'Utensils', display_order: 4 },
  { id: 'cat-externas', name: 'Áreas Externas', color: '#10b981', icon: 'Trees', display_order: 5 },
];

export async function fetchRooms(): Promise<Room[]> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  // Try fetching with suite relation, inspection_order, room_category, and checklist_mode
  const { data, error } = await supabase
    .from('rooms')
    .select(
      'id, name, suite_id, room_type, inspection_order, room_category_id, checklist_mode, created_at, suite:suites(id, name, created_at, updated_at), room_category:room_categories(id, name, color, icon, display_order)'
    )
    .order('inspection_order', { ascending: true })
    .order('created_at', { ascending: true });

  let rawList: any[] = [];

  if (error) {
    // If room_categories table or checklist_mode column does not exist yet, fallback
    const fallback0 = await supabase
      .from('rooms')
      .select('id, name, suite_id, room_type, inspection_order, checklist_mode, created_at, suite:suites(id, name, created_at, updated_at)')
      .order('inspection_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!fallback0.error && fallback0.data) {
      rawList = fallback0.data;
    } else {
      const fallback1 = await supabase
        .from('rooms')
        .select('id, name, inspection_order, created_at')
        .order('inspection_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (!fallback1.error && fallback1.data) {
        rawList = fallback1.data;
      } else {
        const fallback2 = await supabase
          .from('rooms')
          .select('id, name, created_at')
          .order('created_at', { ascending: true });
        if (fallback2.error) throw formatSupabaseError(fallback2.error, 'Erro ao carregar os cômodos.');
        rawList = fallback2.data || [];
      }
    }
  } else {
    rawList = data || [];
  }

  // Local cache overrides for inspection order, room categories, and checklist mode
  let localOrderMap: Map<string, number> | null = null;
  let localCategoryMap: Map<string, string> | null = null;
  let localModeMap: Map<string, RoomChecklistMode> | null = null;
  if (typeof window !== 'undefined') {
    try {
      const savedOrder = localStorage.getItem('chacara_room_inspection_order_v1');
      if (savedOrder) {
        const idList: string[] = JSON.parse(savedOrder);
        localOrderMap = new Map(idList.map((id, idx) => [id, idx + 1]));
      }
      const savedCatMap = localStorage.getItem('chacara_room_category_assignments_v1');
      if (savedCatMap) {
        localCategoryMap = new Map(Object.entries(JSON.parse(savedCatMap)));
      }
      const savedModeMap = localStorage.getItem('chacara_room_checklist_modes_v1');
      if (savedModeMap) {
        localModeMap = new Map(Object.entries(JSON.parse(savedModeMap)));
      }
    } catch {
      // ignore
    }
  }

  // Load floor plan shapes cache if available
  let shapesMap = new Map<string, FloorPlanShape>();
  if (typeof window !== 'undefined') {
    try {
      const savedShapes = localStorage.getItem('chacara_floor_plan_shapes_v1');
      if (savedShapes) {
        const parsed: FloorPlanShape[] = JSON.parse(savedShapes);
        parsed.forEach((s) => {
          if (s.room_id) shapesMap.set(s.room_id, s);
        });
      }
    } catch {
      // ignore
    }
  }

  const mapped = rawList.map((row: any, idx: number) => {
    let order = row.inspection_order ?? (idx + 1);
    if (localOrderMap && localOrderMap.has(row.id)) {
      order = localOrderMap.get(row.id)!;
    }

    let catId = row.room_category_id || null;
    if (localCategoryMap && localCategoryMap.has(row.id)) {
      catId = localCategoryMap.get(row.id) || null;
    }

    let mode: RoomChecklistMode = (row.checklist_mode as RoomChecklistMode) || 'standard';
    if (localModeMap && localModeMap.has(row.id)) {
      mode = localModeMap.get(row.id)!;
    }

    const catObj = Array.isArray(row.room_category) ? row.room_category[0] || null : row.room_category || null;

    return {
      id: row.id,
      name: row.name,
      suite_id: row.suite_id || null,
      room_type: (row.room_type || 'individual') as RoomType,
      inspection_order: order,
      room_category_id: catId,
      room_category: catObj,
      floor_plan_shape: shapesMap.get(row.id) || null,
      checklist_mode: mode,
      created_at: row.created_at,
      suite: Array.isArray(row.suite) ? row.suite[0] || null : row.suite || null,
    };
  });

  // Always sort deterministically by inspection_order, tie-breaking on created_at
  mapped.sort((a, b) => {
    const orderA = a.inspection_order ?? 999999;
    const orderB = b.inspection_order ?? 999999;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return mapped as Room[];
}

export async function updateRoomsInspectionOrder(orderedRoomIds: string[]): Promise<Room[]> {
  ensureConfigured();
  if (orderedRoomIds.length === 0) return fetchRooms();

  // 1. Save to local storage cache immediately
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chacara_room_inspection_order_v1', JSON.stringify(orderedRoomIds));
    } catch {
      // ignore
    }
  }

  const supabase = getSupabaseClient();

  // 2. Update each room's inspection_order in Supabase
  try {
    const updatePromises = orderedRoomIds.map((id, index) =>
      supabase
        .from('rooms')
        .update({ inspection_order: index + 1 })
        .eq('id', id)
    );

    await Promise.all(updatePromises);
  } catch (err) {
    console.warn('Erro ao atualizar inspection_order no Supabase:', err);
  }

  return fetchRooms();
}

export async function createRoom(
  name: string,
  suiteId: string | null = null,
  roomType: RoomType = 'individual',
  roomCategoryId: string | null = null,
  checklistMode: RoomChecklistMode = 'standard'
): Promise<Room> {
  ensureConfigured();
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('O nome do cômodo é obrigatório.');
  }

  const supabase = getSupabaseClient();

  // Find highest existing inspection_order to append new room at the end
  let nextOrder = 1;
  try {
    const { data: maxRow } = await supabase
      .from('rooms')
      .select('inspection_order')
      .order('inspection_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxRow && typeof maxRow.inspection_order === 'number') {
      nextOrder = maxRow.inspection_order + 1;
    }
  } catch {
    // Non-critical if column not present yet
  }

  const payload: any = {
    name: cleanName,
    inspection_order: nextOrder,
    checklist_mode: checklistMode,
  };
  if (suiteId) {
    payload.suite_id = suiteId;
    payload.room_type = roomType;
  }
  if (roomCategoryId) {
    payload.room_category_id = roomCategoryId;
  }

  const { data, error } = await supabase
    .from('rooms')
    .insert(payload)
    .select('id, name, suite_id, room_type, inspection_order, room_category_id, checklist_mode, created_at')
    .single();

  if (error) {
    // If inspection_order, suite_id or checklist_mode column doesn't exist yet, retry fallback
    const fallback = await supabase
      .from('rooms')
      .insert({ name: cleanName })
      .select('id, name, created_at')
      .single();
    if (fallback.error) throw formatSupabaseError(fallback.error, 'Erro ao criar cômodo.');
    
    // Save checklistMode to local cache
    if (typeof window !== 'undefined' && fallback.data?.id) {
      try {
        const raw = localStorage.getItem('chacara_room_checklist_modes_v1') || '{}';
        const map = JSON.parse(raw);
        map[fallback.data.id] = checklistMode;
        localStorage.setItem('chacara_room_checklist_modes_v1', JSON.stringify(map));
      } catch {}
    }

    return { ...fallback.data, inspection_order: nextOrder, room_category_id: roomCategoryId, checklist_mode: checklistMode } as Room;
  }

  // Save to local cache
  if (typeof window !== 'undefined' && data?.id) {
    try {
      const raw = localStorage.getItem('chacara_room_checklist_modes_v1') || '{}';
      const map = JSON.parse(raw);
      map[data.id] = checklistMode;
      localStorage.setItem('chacara_room_checklist_modes_v1', JSON.stringify(map));
    } catch {}
  }

  return data as Room;
}

export async function updateRoom(
  id: string,
  name: string,
  suiteId?: string | null,
  roomType?: RoomType,
  roomCategoryId?: string | null,
  checklistMode?: RoomChecklistMode
): Promise<Room> {
  ensureConfigured();
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('O nome do cômodo não pode ficar vazio.');
  }

  const supabase = getSupabaseClient();
  const updatePayload: any = { name: cleanName };
  if (suiteId !== undefined) {
    updatePayload.suite_id = suiteId;
  }
  if (roomType !== undefined) {
    updatePayload.room_type = roomType;
  }
  if (roomCategoryId !== undefined) {
    updatePayload.room_category_id = roomCategoryId;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('chacara_room_category_assignments_v1') || '{}';
        const map = JSON.parse(raw);
        if (roomCategoryId) map[id] = roomCategoryId;
        else delete map[id];
        localStorage.setItem('chacara_room_category_assignments_v1', JSON.stringify(map));
      } catch {}
    }
  }
  if (checklistMode !== undefined) {
    updatePayload.checklist_mode = checklistMode;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('chacara_room_checklist_modes_v1') || '{}';
        const map = JSON.parse(raw);
        map[id] = checklistMode;
        localStorage.setItem('chacara_room_checklist_modes_v1', JSON.stringify(map));
      } catch {}
    }
  }

  const { data, error } = await supabase
    .from('rooms')
    .update(updatePayload)
    .eq('id', id)
    .select('id, name, suite_id, room_type, inspection_order, room_category_id, checklist_mode, created_at')
    .single();

  if (error) {
    // If suite or room_category columns are not recognized yet, fallback to just name update
    if (String(error.message || '').includes('suite') || error.code === '42703') {
      const fallback = await supabase
        .from('rooms')
        .update({ name: cleanName })
        .eq('id', id)
        .select('id, name, created_at')
        .single();
      if (fallback.error) throw formatSupabaseError(fallback.error, 'Erro ao atualizar o cômodo.');
      return { ...fallback.data, checklist_mode: checklistMode || 'standard' } as Room;
    }
    throw formatSupabaseError(error, 'Erro ao atualizar o cômodo.');
  }

  return data as Room;
}

export async function updateRoomChecklistMode(
  roomId: string,
  mode: RoomChecklistMode
): Promise<void> {
  ensureConfigured();
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('chacara_room_checklist_modes_v1') || '{}';
      const map = JSON.parse(raw);
      map[roomId] = mode;
      localStorage.setItem('chacara_room_checklist_modes_v1', JSON.stringify(map));
    } catch {}
  }

  const supabase = getSupabaseClient();
  try {
    const { error } = await supabase.from('rooms').update({ checklist_mode: mode }).eq('id', roomId);
    if (error) {
      console.warn('Erro ao atualizar checklist_mode no Supabase (usando fallback local):', error.message);
    }
  } catch (err) {
    console.warn('Exceção ao atualizar checklist_mode no Supabase (usando cache local):', err);
  }
}

export async function deleteRoom(id: string): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  // 1. Verify if room has registered inventory items or distributions
  const [itemsRes, assignmentsRes] = await Promise.all([
    supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('room_id', id),
    Promise.resolve(
      supabase
        .from('inventory_room_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', id)
    ).catch(() => ({ count: 0, error: null } as any)),
  ]);

  if (itemsRes.error) throw formatSupabaseError(itemsRes.error, 'Erro ao verificar itens do cômodo.');

  const itemsCount = itemsRes.count || 0;
  const assignmentsCount = (assignmentsRes as any)?.count || 0;

  if (itemsCount > 0 || assignmentsCount > 0) {
    const total = Math.max(itemsCount, assignmentsCount);
    throw new Error(
      `Este cômodo possui ${total} item(ns) cadastrado(s) ou distribuído(s) nele. Transfira as distribuições para outro cômodo antes de excluí-lo.`
    );
  }

  // 2. Fetch room name to preserve snapshot in checklist records
  let roomName = '';
  try {
    const { data: roomData } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    roomName = roomData?.name || '';
  } catch {
    // Non-critical
  }

  // 3. Clean up pending uninspected progress in active checklist sessions
  try {
    await supabase
      .from('checklist_room_progress')
      .delete()
      .eq('room_id', id)
      .eq('status', 'pending');
  } catch {
    // Non-critical
  }

  // 4. Preserve room name snapshot on historical records if empty
  if (roomName) {
    try {
      await Promise.allSettled([
        supabase
          .from('checklist_room_progress')
          .update({ room_name_snapshot: roomName })
          .eq('room_id', id),
        supabase
          .from('checklist_item_results')
          .update({ room_name_snapshot: roomName })
          .eq('room_id', id),
        supabase
          .from('checklist_occurrences')
          .update({ room_name_snapshot: roomName })
          .eq('room_id', id),
      ]);
    } catch {
      // Non-critical if columns not yet created
    }
  }

  // 5. Delete room record
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  if (error) {
    const msg = String(error.message || error.details || '');
    if (
      msg.includes('checklist_room_progress') ||
      msg.includes('checklist_item_results') ||
      msg.includes('checklist_occurrences')
    ) {
      throw new Error(
        'Este cômodo possui registros em conferências anteriores. Aplique a migração 0003 no SQL Editor do Supabase para atualizar a regra de histórico (ON DELETE SET NULL).'
      );
    }
    throw formatSupabaseError(error, 'Erro ao excluir o cômodo.');
  }

  // 6. Clean local checklist progress cache
  if (typeof window !== 'undefined') {
    try {
      const LS_KEY = 'chacara_checklist_room_progress_backup_v2';
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        const updated = list
          .filter((p: any) => !(p.room_id === id && p.status === 'pending'))
          .map((p: any) =>
            p.room_id === id ? { ...p, room_id: null, room_name_snapshot: p.room_name_snapshot || roomName } : p
          );
        localStorage.setItem(LS_KEY, JSON.stringify(updated));
      }
    } catch {
      // Ignore
    }
  }
}

export async function reassignItemsAndDeleteRoom(sourceRoomId: string, targetRoomId: string): Promise<void> {
  ensureConfigured();
  if (!targetRoomId || sourceRoomId === targetRoomId) {
    throw new Error('Selecione um cômodo de destino válido e diferente do cômodo atual.');
  }

  const supabase = getSupabaseClient();

  // 1. Reassign direct room_id in inventory_items
  const { error: updateErr } = await supabase
    .from('inventory_items')
    .update({ room_id: targetRoomId })
    .eq('room_id', sourceRoomId);

  if (updateErr) throw formatSupabaseError(updateErr, 'Erro ao transferir os itens para o novo cômodo.');

  // 2. Reassign room assignments in inventory_room_assignments
  try {
    const { data: sourceAssignments } = await supabase
      .from('inventory_room_assignments')
      .select('*')
      .eq('room_id', sourceRoomId);

    if (sourceAssignments && sourceAssignments.length > 0) {
      for (const sa of sourceAssignments) {
        const { data: targetAssignment } = await supabase
          .from('inventory_room_assignments')
          .select('id, quantity')
          .eq('inventory_item_id', sa.inventory_item_id)
          .eq('room_id', targetRoomId)
          .maybeSingle();

        if (targetAssignment) {
          await supabase
            .from('inventory_room_assignments')
            .update({ quantity: targetAssignment.quantity + sa.quantity })
            .eq('id', targetAssignment.id);
          await supabase
            .from('inventory_room_assignments')
            .delete()
            .eq('id', sa.id);
        } else {
          await supabase
            .from('inventory_room_assignments')
            .update({ room_id: targetRoomId })
            .eq('id', sa.id);
        }
      }
    }
  } catch {
    // Non-critical if table not yet created
  }

  // 3. Now delete source room safely
  await deleteRoom(sourceRoomId);
}

// ============================================================================
// SUITES CRUD
// ============================================================================

export async function fetchSuites(): Promise<Suite[]> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('suites')
      .select('id, name, created_at, updated_at, rooms:rooms(id, name, suite_id, room_type, created_at)')
      .order('name', { ascending: true });

    if (error) {
      // If table doesn't exist yet, return empty array
      if (error.code === '42P01' || error.code === 'PGRST205' || String(error.message).includes('does not exist')) {
        return [];
      }
      throw formatSupabaseError(error, 'Erro ao carregar as suítes.');
    }

    return (data || []) as Suite[];
  } catch (err: any) {
    if (String(err?.message || '').includes('does not exist')) {
      return [];
    }
    throw err;
  }
}

export async function createSuite(input: CreateSuiteInput): Promise<{
  suite: Suite;
  bedroom: Room;
  bathroom: Room;
}> {
  ensureConfigured();
  const suiteName = input.suiteName.trim();
  const bedroomName = input.bedroomName.trim();
  const bathroomName = input.bathroomName.trim();

  if (!suiteName) throw new Error('O nome da suíte é obrigatório (ex: Suíte Master).');
  if (!bedroomName) throw new Error('O nome do quarto da suíte é obrigatório (ex: Quarto Master).');
  if (!bathroomName) throw new Error('O nome do banheiro da suíte é obrigatório (ex: Banheiro Suíte Master).');

  const supabase = getSupabaseClient();

  // 1. Create suite record
  const { data: suiteData, error: suiteErr } = await supabase
    .from('suites')
    .insert({ name: suiteName })
    .select('id, name, created_at, updated_at')
    .single();

  if (suiteErr) {
    if (suiteErr.code === '42P01' || String(suiteErr.message).includes('does not exist')) {
      throw new Error(
        'A tabela de suítes ainda não foi criada no Supabase. Abra "Banco & Nuvem" no menu e execute a migração 0003 no SQL Editor do Supabase.'
      );
    }
    throw formatSupabaseError(suiteErr, 'Erro ao criar a suíte.');
  }

  const suite = suiteData as Suite;

  // 2. Create bedroom linked to suite
  let bedroom: Room;
  try {
    bedroom = await createRoom(bedroomName, suite.id, 'suite_bedroom');
  } catch (err: any) {
    // Rollback suite on error
    await supabase.from('suites').delete().eq('id', suite.id);
    throw err;
  }

  // 3. Create bathroom linked to suite
  let bathroom: Room;
  try {
    bathroom = await createRoom(bathroomName, suite.id, 'suite_bathroom');
  } catch (err: any) {
    // Rollback bedroom and suite
    await deleteRoom(bedroom.id).catch(() => {});
    await supabase.from('suites').delete().eq('id', suite.id);
    throw err;
  }

  return { suite, bedroom, bathroom };
}

export async function updateSuite(suiteId: string, input: UpdateSuiteInput): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  if (input.suiteName?.trim()) {
    const { error: suiteErr } = await supabase
      .from('suites')
      .update({ name: input.suiteName.trim(), updated_at: new Date().toISOString() })
      .eq('id', suiteId);
    if (suiteErr) throw formatSupabaseError(suiteErr, 'Erro ao atualizar o nome da suíte.');
  }

  if (input.bedroomName?.trim()) {
    const { error: bedErr } = await supabase
      .from('rooms')
      .update({ name: input.bedroomName.trim() })
      .eq('suite_id', suiteId)
      .eq('room_type', 'suite_bedroom');
    if (bedErr) throw formatSupabaseError(bedErr, 'Erro ao atualizar o quarto da suíte.');
  }

  if (input.bathroomName?.trim()) {
    const { error: bathErr } = await supabase
      .from('rooms')
      .update({ name: input.bathroomName.trim() })
      .eq('suite_id', suiteId)
      .eq('room_type', 'suite_bathroom');
    if (bathErr) throw formatSupabaseError(bathErr, 'Erro ao atualizar o banheiro da suíte.');
  }
}

export async function unlinkSuite(suiteId: string): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  // 1. Unlink rooms, converting them back to individual rooms
  const { error: unlinkErr } = await supabase
    .from('rooms')
    .update({ suite_id: null, room_type: 'individual' })
    .eq('suite_id', suiteId);

  if (unlinkErr) throw formatSupabaseError(unlinkErr, 'Erro ao desvincular os cômodos da suíte.');

  // 2. Delete the suite entry
  const { error: delErr } = await supabase.from('suites').delete().eq('id', suiteId);
  if (delErr) throw formatSupabaseError(delErr, 'Erro ao excluir a suíte após desvincular os cômodos.');
}

export async function deleteSuiteAndRooms(suiteId: string): Promise<{
  deletedRooms: string[];
  preservedRooms: string[];
}> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  // 1. Fetch rooms linked to this suite
  const { data: suiteRooms, error: fetchErr } = await supabase
    .from('rooms')
    .select('id, name')
    .eq('suite_id', suiteId);

  if (fetchErr) throw formatSupabaseError(fetchErr, 'Erro ao carregar cômodos da suíte.');

  const roomsList = suiteRooms || [];
  const deletedRooms: string[] = [];
  const preservedRooms: string[] = [];

  for (const r of roomsList) {
    // Check if room has inventory items or distributions
    const [itRes, assignRes] = await Promise.all([
      supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('room_id', r.id),
      Promise.resolve(
        supabase
          .from('inventory_room_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', r.id)
      ).catch(() => ({ count: 0, error: null } as any)),
    ]);

    const itemsCount = itRes.count || 0;
    const assignmentsCount = (assignRes as any)?.count || 0;

    if (itemsCount > 0 || assignmentsCount > 0) {
      // Room has items: keep as individual room
      await supabase
        .from('rooms')
        .update({ suite_id: null, room_type: 'individual' })
        .eq('id', r.id);
      preservedRooms.push(
        `${r.name} (${Math.max(itemsCount, assignmentsCount)} item(ns) mantido(s) como cômodo individual)`
      );
    } else {
      // Room is empty: delete safely
      await deleteRoom(r.id);
      deletedRooms.push(r.name);
    }
  }

  // 2. Delete the suite entry
  await supabase.from('suites').delete().eq('id', suiteId);

  return { deletedRooms, preservedRooms };
}

export async function seedSuggestedRooms(existingRooms: Room[]): Promise<Room[]> {
  ensureConfigured();
  const suggestedNames = [
    'Cozinha',
    'Sala de Estar',
    'Quarto 1',
    'Quarto 2',
    'Quarto 3',
    'Banheiro Social',
    'Área Gourmet / Churrasqueira',
    'Área da Piscina',
    'Área Externa / Jardim',
    'Lavanderia',
  ];

  const existingLower = new Set(existingRooms.map((r) => r.name.trim().toLowerCase()));
  const maxOrder = existingRooms.reduce((max, r) => Math.max(max, r.inspection_order || 0), 0);

  const toInsert = suggestedNames
    .filter((name) => !existingLower.has(name.toLowerCase()))
    .map((name, idx) => ({
      name,
      inspection_order: maxOrder + idx + 1,
    }));

  if (toInsert.length === 0) return existingRooms;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('rooms').insert(toInsert);
  if (error) {
    // Fallback if inspection_order column does not exist yet
    try {
      await supabase.from('rooms').insert(toInsert.map(({ name }) => ({ name })));
    } catch {
      // Ignore
    }
  }

  return fetchRooms();
}

// ============================================================================
// CATEGORIES CRUD
// ============================================================================

export async function fetchCategories(): Promise<InventoryCategory[]> {
  ensureConfigured();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('inventory_categories')
    .select('id, name, created_at')
    .order('name', { ascending: true });

  if (error) throw formatSupabaseError(error, 'Erro ao carregar as categorias.');
  return (data || []) as InventoryCategory[];
}

export async function createCategory(name: string): Promise<InventoryCategory> {
  ensureConfigured();
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('O nome da categoria é obrigatório.');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('inventory_categories')
    .insert({ name: cleanName })
    .select('id, name, created_at')
    .single();

  if (error) throw formatSupabaseError(error, 'Erro ao criar categoria.');
  return data as InventoryCategory;
}

export async function updateCategory(id: string, name: string): Promise<InventoryCategory> {
  ensureConfigured();
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('O nome da categoria não pode ficar vazio.');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('inventory_categories')
    .update({ name: cleanName })
    .eq('id', id)
    .select('id, name, created_at')
    .single();

  if (error) throw formatSupabaseError(error, 'Erro ao atualizar categoria.');
  return data as InventoryCategory;
}

export async function deleteCategory(id: string): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  // Verify category is unused before deleting
  const { count, error: countErr } = await supabase
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if (countErr) throw formatSupabaseError(countErr, 'Erro ao verificar itens da categoria.');
  if (count && count > 0) {
    throw new Error(
      `Esta categoria está vinculada a ${count} item(ns). Apenas categorias sem uso podem ser excluídas diretamente (ou desvincule os itens primeiro).`
    );
  }

  const { error } = await supabase.from('inventory_categories').delete().eq('id', id);
  if (error) throw formatSupabaseError(error, 'Erro ao excluir categoria.');
}

export async function unlinkItemsAndDeleteCategory(
  categoryId: string,
  targetCategoryId: string | null = null
): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  const { error: updateErr } = await supabase
    .from('inventory_items')
    .update({ category_id: targetCategoryId })
    .eq('category_id', categoryId);

  if (updateErr) throw formatSupabaseError(updateErr, 'Erro ao desvincular itens da categoria.');

  const { error: deleteErr } = await supabase.from('inventory_categories').delete().eq('id', categoryId);
  if (deleteErr) throw formatSupabaseError(deleteErr, 'Erro ao excluir categoria.');
}

export async function seedSuggestedCategories(
  existingCategories: InventoryCategory[]
): Promise<InventoryCategory[]> {
  ensureConfigured();
  const suggestedNames = [
    'Utensílios de Cozinha',
    'Eletrodomésticos',
    'Cama, Mesa e Banho',
    'Itens de Banheiro',
    'Móveis',
    'Eletrônicos',
    'Equipamentos de Área Externa',
    'Decoração',
  ];

  const existingLower = new Set(existingCategories.map((c) => c.name.trim().toLowerCase()));
  const toInsert = suggestedNames
    .filter((name) => !existingLower.has(name.toLowerCase()))
    .map((name) => ({ name }));

  if (toInsert.length === 0) return existingCategories;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('inventory_categories').insert(toInsert);
  if (error) throw formatSupabaseError(error, 'Erro ao criar categorias iniciais.');

  return fetchCategories();
}

// ============================================================================
// ROOM CATEGORIES CRUD
// ============================================================================

export async function fetchRoomCategories(): Promise<RoomCategory[]> {
  ensureConfigured();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('room_categories')
    .select('id, name, color, icon, display_order, created_at, updated_at')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error || !data || data.length === 0) {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('chacara_room_categories_v1');
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return DEFAULT_ROOM_CATEGORIES;
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chacara_room_categories_v1', JSON.stringify(data));
    } catch {}
  }
  return data as RoomCategory[];
}

export async function createRoomCategory(input: CreateRoomCategoryInput): Promise<RoomCategory> {
  ensureConfigured();
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error('O nome da categoria é obrigatório.');

  const supabase = getSupabaseClient();
  const payload = {
    name: cleanName,
    color: input.color || '#10b981',
    icon: input.icon || 'Home',
    display_order: input.display_order ?? 0,
  };

  const { data, error } = await supabase
    .from('room_categories')
    .insert(payload)
    .select('id, name, color, icon, display_order, created_at, updated_at')
    .single();

  if (error) {
    // Local fallback if table doesn't exist yet
    const fallbackCategory: RoomCategory = {
      id: `local-rc-${Date.now()}`,
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('chacara_room_categories_v1');
        const list: RoomCategory[] = cached ? JSON.parse(cached) : [...DEFAULT_ROOM_CATEGORIES];
        list.push(fallbackCategory);
        localStorage.setItem('chacara_room_categories_v1', JSON.stringify(list));
      } catch {}
    }
    return fallbackCategory;
  }

  // Update local storage
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('chacara_room_categories_v1');
      const list: RoomCategory[] = cached ? JSON.parse(cached) : [...DEFAULT_ROOM_CATEGORIES];
      list.push(data);
      localStorage.setItem('chacara_room_categories_v1', JSON.stringify(list));
    } catch {}
  }

  return data as RoomCategory;
}

export async function updateRoomCategory(id: string, input: UpdateRoomCategoryInput): Promise<RoomCategory> {
  ensureConfigured();
  const supabase = getSupabaseClient();
  const updatePayload: any = {};
  if (input.name !== undefined) {
    const cleanName = input.name.trim();
    if (!cleanName) throw new Error('O nome da categoria não pode ficar vazio.');
    updatePayload.name = cleanName;
  }
  if (input.color !== undefined) updatePayload.color = input.color;
  if (input.icon !== undefined) updatePayload.icon = input.icon;
  if (input.display_order !== undefined) updatePayload.display_order = input.display_order;

  const { data, error } = await supabase
    .from('room_categories')
    .update(updatePayload)
    .eq('id', id)
    .select('id, name, color, icon, display_order, created_at, updated_at')
    .single();

  if (error) {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('chacara_room_categories_v1');
        const list: RoomCategory[] = cached ? JSON.parse(cached) : [...DEFAULT_ROOM_CATEGORIES];
        const idx = list.findIndex((c) => c.id === id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...updatePayload };
          localStorage.setItem('chacara_room_categories_v1', JSON.stringify(list));
          return list[idx];
        }
      } catch {}
    }
    throw formatSupabaseError(error, 'Erro ao atualizar a categoria.');
  }

  // Update local storage
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('chacara_room_categories_v1');
      const list: RoomCategory[] = cached ? JSON.parse(cached) : [...DEFAULT_ROOM_CATEGORIES];
      const idx = list.findIndex((c) => c.id === id);
      if (idx >= 0) list[idx] = data;
      localStorage.setItem('chacara_room_categories_v1', JSON.stringify(list));
    } catch {}
  }

  return data as RoomCategory;
}

export async function deleteRoomCategory(id: string): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  // 1. Unlink rooms safely
  try {
    await supabase.from('rooms').update({ room_category_id: null }).eq('room_category_id', id);
  } catch {}

  // 2. Delete category
  try {
    await supabase.from('room_categories').delete().eq('id', id);
  } catch {}

  // 3. Update local storage
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('chacara_room_categories_v1');
      if (cached) {
        const list: RoomCategory[] = JSON.parse(cached);
        localStorage.setItem(
          'chacara_room_categories_v1',
          JSON.stringify(list.filter((c) => c.id !== id))
        );
      }
      const savedCatMap = localStorage.getItem('chacara_room_category_assignments_v1');
      if (savedCatMap) {
        const map = JSON.parse(savedCatMap);
        Object.keys(map).forEach((rId) => {
          if (map[rId] === id) delete map[rId];
        });
        localStorage.setItem('chacara_room_category_assignments_v1', JSON.stringify(map));
      }
    } catch {}
  }
}

export async function assignRoomToCategory(roomId: string, categoryId: string | null): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  // Save in local storage cache
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('chacara_room_category_assignments_v1') || '{}';
      const map = JSON.parse(raw);
      if (categoryId) map[roomId] = categoryId;
      else delete map[roomId];
      localStorage.setItem('chacara_room_category_assignments_v1', JSON.stringify(map));
    } catch {}
  }

  // Update Supabase
  try {
    await supabase.from('rooms').update({ room_category_id: categoryId }).eq('id', roomId);
  } catch (err) {
    console.warn('Erro ao atualizar room_category_id no Supabase:', err);
  }
}

export async function assignMultipleRoomsToCategory(roomIds: string[], categoryId: string | null): Promise<void> {
  if (roomIds.length === 0) return;
  await Promise.all(roomIds.map((id) => assignRoomToCategory(id, categoryId)));
}

// ============================================================================
// FLOOR PLAN SHAPES CRUD
// ============================================================================

export async function fetchFloorPlanShapes(): Promise<FloorPlanShape[]> {
  ensureConfigured();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('floor_plan_shapes')
    .select('*')
    .order('z_index', { ascending: true });

  if (error || !data || data.length === 0) {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('chacara_floor_plan_shapes_v1');
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return [];
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chacara_floor_plan_shapes_v1', JSON.stringify(data));
    } catch {}
  }

  return data as FloorPlanShape[];
}

export async function saveFloorPlanShapes(shapes: FloorPlanShape[]): Promise<FloorPlanShape[]> {
  ensureConfigured();

  // Update local storage immediately for responsive offline UX
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chacara_floor_plan_shapes_v1', JSON.stringify(shapes));
    } catch {}
  }

  const supabase = getSupabaseClient();
  const isValidUuid = (val?: string | null): boolean =>
    Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

  try {
    for (const shape of shapes) {
      const payload: any = {
        room_id: isValidUuid(shape.room_id) ? shape.room_id : null,
        shape_type: shape.shape_type || 'rectangle',
        x: Math.round(shape.x),
        y: Math.round(shape.y),
        width: Math.max(30, Math.round(shape.width)),
        height: Math.max(30, Math.round(shape.height)),
        points: shape.points || null,
        parent_room_id: isValidUuid(shape.parent_room_id) ? shape.parent_room_id : null,
        color: shape.color || null,
        label_custom: shape.label_custom || null,
        z_index: shape.z_index || 1,
      };

      if (isValidUuid(shape.id)) {
        payload.id = shape.id;
      }

      let query;
      if (payload.room_id) {
        query = supabase.from('floor_plan_shapes').upsert(payload, { onConflict: 'room_id' });
      } else if (payload.id) {
        query = supabase.from('floor_plan_shapes').upsert(payload, { onConflict: 'id' });
      } else {
        query = supabase.from('floor_plan_shapes').insert(payload);
      }

      const { data, error } = await query.select().maybeSingle();
      if (error) {
        console.warn('Erro ao salvar floor_plan_shapes no Supabase:', error);
      } else if (data && data.id) {
        shape.id = data.id;
      }
    }
  } catch (err) {
    console.warn('Erro ao salvar floor_plan_shapes no Supabase:', err);
  }

  return shapes;
}

export async function deleteFloorPlanShape(id: string): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();
  try {
    await supabase.from('floor_plan_shapes').delete().eq('id', id);
  } catch {}

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('chacara_floor_plan_shapes_v1');
      if (cached) {
        const list: FloorPlanShape[] = JSON.parse(cached);
        localStorage.setItem(
          'chacara_floor_plan_shapes_v1',
          JSON.stringify(list.filter((s) => s.id !== id))
        );
      }
    } catch {}
  }
}

// ============================================================================
// INVENTORY ITEMS CRUD
// ============================================================================

const ITEM_SELECT_QUERY = `
  id,
  name,
  identification_code,
  room_id,
  category_id,
  inventory_type,
  expected_quantity,
  image_path,
  description,
  inspection_type,
  created_at,
  updated_at,
  room:rooms(id, name, created_at, suite_id, room_type),
  category:inventory_categories(id, name, created_at),
  room_assignments:inventory_room_assignments(
    id,
    inventory_item_id,
    room_id,
    quantity,
    condition_status,
    condition_notes,
    created_at,
    updated_at,
    room:rooms(id, name, created_at, suite_id, room_type)
  )
`;

function normalizeJoinedItem(raw: any): InventoryItem {
  const room = Array.isArray(raw.room) ? raw.room[0] || null : raw.room || null;
  const category = Array.isArray(raw.category) ? raw.category[0] || null : raw.category || null;

  let assignments: InventoryRoomAssignment[] = [];
  if (Array.isArray(raw.room_assignments)) {
    assignments = raw.room_assignments.map((a: any) => ({
      ...a,
      room: Array.isArray(a.room) ? a.room[0] || null : a.room || null,
    }));
  }

  // Synthesize legacy assignment if none in assignments table but room_id is present
  if (assignments.length === 0 && raw.room_id) {
    assignments.push({
      id: `synth-${raw.id}-${raw.room_id}`,
      inventory_item_id: raw.id,
      room_id: raw.room_id,
      quantity: raw.expected_quantity || 1,
      condition_status: 'good',
      condition_notes: null,
      created_at: raw.created_at || new Date().toISOString(),
      updated_at: raw.updated_at || new Date().toISOString(),
      room,
    });
  }

  const totalQuantity =
    assignments.length > 0
      ? assignments.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0)
      : raw.room_id
      ? raw.expected_quantity || 1
      : 0;

  return {
    ...raw,
    inspection_type: raw.inspection_type || 'physical_integrity',
    room,
    category,
    room_assignments: assignments,
    total_quantity: totalQuantity,
  } as InventoryItem;
}

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  // Try query with joined room_assignments
  const { data, error } = await supabase
    .from('inventory_items')
    .select(ITEM_SELECT_QUERY)
    .order('created_at', { ascending: false });

  if (error) {
    // If room_assignments table doesn't exist yet in Supabase (before Migration 0004), fallback
    if (String(error.message || '').includes('inventory_room_assignments') || error.code === 'PGRST200') {
      const fallbackQuery = `
        id, name, identification_code, room_id, category_id, inventory_type,
        expected_quantity, image_path, description, inspection_type, created_at, updated_at,
        room:rooms(id, name, created_at),
        category:inventory_categories(id, name, created_at)
      `;
      const fallbackRes = await supabase
        .from('inventory_items')
        .select(fallbackQuery)
        .order('created_at', { ascending: false });

      if (fallbackRes.error) throw formatSupabaseError(fallbackRes.error, 'Erro ao carregar os itens do inventário.');
      return (fallbackRes.data || []).map(normalizeJoinedItem);
    }
    throw formatSupabaseError(error, 'Erro ao carregar os itens do inventário.');
  }

  return (data || []).map(normalizeJoinedItem);
}

export async function checkIdentificationCodeExists(
  code: string,
  excludeItemId?: string
): Promise<boolean> {
  ensureConfigured();
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return false;

  const supabase = getSupabaseClient();
  let query = supabase
    .from('inventory_items')
    .select('id')
    .ilike('identification_code', cleanCode)
    .limit(1);

  if (excludeItemId) {
    query = query.neq('id', excludeItemId);
  }

  const { data, error } = await query;
  if (error) throw formatSupabaseError(error, 'Erro ao validar código de identificação.');
  return Boolean(data && data.length > 0);
}

export async function createInventoryItem(input: CreateInventoryItemInput): Promise<InventoryItem> {
  ensureConfigured();
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error('O nome do item é obrigatório.');

  const cleanCode = input.identification_code?.trim()
    ? input.identification_code.trim().toUpperCase()
    : null;

  if (input.inventory_type === 'individual' && !cleanCode) {
    throw new Error('Itens individuais exigem um código de identificação único.');
  }

  if (cleanCode) {
    const exists = await checkIdentificationCodeExists(cleanCode);
    if (exists) {
      throw new Error(`O código de identificação "${cleanCode}" já está em uso por outro item.`);
    }
  }

  // Calculate total quantity
  let totalQty = input.expected_quantity || 1;
  if (input.initial_assignments && input.initial_assignments.length > 0) {
    totalQty = input.initial_assignments.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
  }

  const primaryRoomId = input.initial_assignments?.[0]?.room_id || input.room_id || null;

  const supabase = getSupabaseClient();
  const payload = {
    name: cleanName,
    identification_code: cleanCode,
    room_id: primaryRoomId,
    category_id: input.category_id || null,
    inventory_type: input.inventory_type,
    expected_quantity: Math.max(1, totalQty),
    image_path: input.image_path || null,
    description: input.description?.trim() || null,
    inspection_type: input.inspection_type || 'physical_integrity',
  };

  const { data, error } = await supabase
    .from('inventory_items')
    .insert(payload)
    .select(ITEM_SELECT_QUERY)
    .single();

  if (error) throw formatSupabaseError(error, 'Erro ao cadastrar item no inventário.');

  const createdItem = normalizeJoinedItem(data);

  // If initial assignments provided, save in inventory_room_assignments
  if (input.initial_assignments && input.initial_assignments.length > 0) {
    try {
      const assignmentPayloads = input.initial_assignments.map((a) => ({
        inventory_item_id: createdItem.id,
        room_id: a.room_id,
        quantity: Math.max(1, a.quantity),
        condition_status: a.condition_status || 'good',
        condition_notes: a.condition_notes?.trim() || null,
      }));

      await supabase.from('inventory_room_assignments').insert(assignmentPayloads);

      const { data: refreshed } = await supabase
        .from('inventory_items')
        .select(ITEM_SELECT_QUERY)
        .eq('id', createdItem.id)
        .single();

      if (refreshed) return normalizeJoinedItem(refreshed);
    } catch {
      // Non-critical fallback if table not yet created
    }
  } else if (input.room_id) {
    try {
      await supabase.from('inventory_room_assignments').insert({
        inventory_item_id: createdItem.id,
        room_id: input.room_id,
        quantity: Math.max(1, input.expected_quantity || 1),
        condition_status: 'good',
        condition_notes: null,
      });
    } catch {
      // Non-critical
    }
  }

  return createdItem;
}

export async function createInventoryItemsBatch(
  inputs: CreateInventoryItemInput[]
): Promise<InventoryItem[]> {
  ensureConfigured();
  if (inputs.length === 0) return [];

  const payload = inputs.map((input) => ({
    name: input.name.trim(),
    identification_code: input.identification_code?.trim()
      ? input.identification_code.trim().toUpperCase()
      : null,
    room_id: input.room_id || null,
    category_id: input.category_id || null,
    inventory_type: input.inventory_type,
    expected_quantity: input.expected_quantity || 1,
    image_path: input.image_path || null,
    description: input.description?.trim() || null,
    inspection_type: input.inspection_type || 'physical_integrity',
  }));

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('inventory_items')
    .insert(payload)
    .select(ITEM_SELECT_QUERY);

  if (error) throw formatSupabaseError(error, 'Erro ao cadastrar lote de itens individuais.');
  return (data || []).map(normalizeJoinedItem);
}

export async function updateInventoryItem(
  id: string,
  input: UpdateInventoryItemInput
): Promise<InventoryItem> {
  ensureConfigured();

  const updates: Record<string, any> = {};

  if (input.name !== undefined) {
    const cleanName = input.name.trim();
    if (!cleanName) throw new Error('O nome do item não pode ficar vazio.');
    updates.name = cleanName;
  }

  if (input.room_id !== undefined) {
    updates.room_id = input.room_id || null;
  }

  if (input.category_id !== undefined) {
    updates.category_id = input.category_id || null;
  }

  if (input.inventory_type !== undefined) {
    updates.inventory_type = input.inventory_type;
  }

  if (input.inspection_type !== undefined) {
    updates.inspection_type = input.inspection_type;
  }

  if (input.expected_quantity !== undefined) {
    if (!Number.isInteger(input.expected_quantity) || input.expected_quantity < 1) {
      throw new Error('A quantidade esperada deve ser um número inteiro maior ou igual a 1.');
    }
    updates.expected_quantity = input.expected_quantity;
  }

  if (input.identification_code !== undefined) {
    const cleanCode = input.identification_code?.trim()
      ? input.identification_code.trim().toUpperCase()
      : null;

    if (cleanCode) {
      const exists = await checkIdentificationCodeExists(cleanCode, id);
      if (exists) {
        throw new Error(`O código de identificação "${cleanCode}" já está em uso por outro item.`);
      }
    }
    updates.identification_code = cleanCode;
  }

  if (input.image_path !== undefined) {
    updates.image_path = input.image_path || null;
  }

  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('inventory_items')
    .update(updates)
    .eq('id', id)
    .select(ITEM_SELECT_QUERY)
    .single();

  if (error) throw formatSupabaseError(error, 'Erro ao atualizar item do inventário.');

  // If assignments were provided, sync them
  if (input.assignments) {
    try {
      // Remove any existing assignments not in the updated list
      const existingAssignments = await fetchItemRoomAssignments(id);
      const incomingRoomIds = new Set(input.assignments.map((a) => a.room_id));

      for (const ea of existingAssignments) {
        if (!incomingRoomIds.has(ea.room_id)) {
          await deleteRoomAssignment(ea.id);
        }
      }

      for (const a of input.assignments) {
        await upsertRoomAssignment({
          ...a,
          inventory_item_id: id,
        });
      }

      const { data: refreshed } = await supabase
        .from('inventory_items')
        .select(ITEM_SELECT_QUERY)
        .eq('id', id)
        .single();

      if (refreshed) return normalizeJoinedItem(refreshed);
    } catch {
      // Non-critical fallback
    }
  }

  return normalizeJoinedItem(data);
}

export async function deleteInventoryItem(item: InventoryItem): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('inventory_items').delete().eq('id', item.id);
  if (error) throw formatSupabaseError(error, 'Erro ao excluir item do inventário.');

  if (item.image_path) {
    await deleteInventoryPhotoIfUnused(item.image_path, item.id).catch(() => {
      // Non-fatal storage cleanup error
    });
  }
}

// ============================================================================
// ROOM ASSIGNMENTS & CONDITION CRUD
// ============================================================================

export async function fetchItemRoomAssignments(itemId: string): Promise<InventoryRoomAssignment[]> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('inventory_room_assignments')
      .select(
        'id, inventory_item_id, room_id, quantity, condition_status, condition_notes, created_at, updated_at, room:rooms(id, name, created_at, suite_id, room_type)'
      )
      .eq('inventory_item_id', itemId)
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return [];
      throw formatSupabaseError(error, 'Erro ao carregar distribuição do item.');
    }

    return (data || []).map((row: any) => ({
      ...row,
      room: Array.isArray(row.room) ? row.room[0] || null : row.room || null,
    })) as InventoryRoomAssignment[];
  } catch (err: any) {
    if (String(err?.message || '').includes('does not exist')) return [];
    throw err;
  }
}

export async function upsertRoomAssignment(
  input: UpsertRoomAssignmentInput
): Promise<InventoryRoomAssignment> {
  ensureConfigured();
  if (!input.inventory_item_id) throw new Error('ID do item de inventário não informado.');
  if (!input.room_id) throw new Error('Selecione o cômodo para a distribuição.');
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('A quantidade deve ser um número inteiro maior ou igual a 1.');
  }

  const supabase = getSupabaseClient();

  const payload = {
    inventory_item_id: input.inventory_item_id,
    room_id: input.room_id,
    quantity: input.quantity,
    condition_status: input.condition_status || 'good',
    condition_notes: input.condition_notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('inventory_room_assignments')
    .upsert(payload, { onConflict: 'inventory_item_id,room_id' })
    .select(
      'id, inventory_item_id, room_id, quantity, condition_status, condition_notes, created_at, updated_at, room:rooms(id, name, created_at, suite_id, room_type)'
    )
    .single();

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || String(error.message).includes('does not exist')) {
      throw new Error(
        'A tabela de distribuição por cômodos ainda não foi criada. Abra "Banco & Nuvem" no menu e execute a migração 0004 no SQL Editor do Supabase.'
      );
    }
    throw formatSupabaseError(error, 'Erro ao salvar distribuição por cômodo.');
  }

  // Sync total quantity in global item
  await syncItemTotalQuantity(input.inventory_item_id);

  const row = data as any;
  return {
    ...row,
    room: Array.isArray(row.room) ? row.room[0] || null : row.room || null,
  } as InventoryRoomAssignment;
}

export async function deleteRoomAssignment(assignmentId: string): Promise<void> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  // Find item ID first to sync total
  const { data: existing } = await supabase
    .from('inventory_room_assignments')
    .select('inventory_item_id')
    .eq('id', assignmentId)
    .maybeSingle();

  const { error } = await supabase
    .from('inventory_room_assignments')
    .delete()
    .eq('id', assignmentId);

  if (error) throw formatSupabaseError(error, 'Erro ao remover distribuição do cômodo.');

  if (existing?.inventory_item_id) {
    await syncItemTotalQuantity(existing.inventory_item_id);
  }
}

export async function syncItemTotalQuantity(itemId: string): Promise<number> {
  const supabase = getSupabaseClient();
  try {
    const { data: assignments } = await supabase
      .from('inventory_room_assignments')
      .select('quantity')
      .eq('inventory_item_id', itemId);

    const total = (assignments || []).reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);

    // Update expected_quantity in inventory_items
    await supabase
      .from('inventory_items')
      .update({ expected_quantity: total > 0 ? total : 1 })
      .eq('id', itemId);

    return total;
  } catch {
    return 0;
  }
}

/**
 * Filter items assigned to a specific room, setting room-specific quantities
 * and condition statuses for the senior-friendly checklist inspection.
 */
export function getItemsForRoom(items: InventoryItem[], roomId: string): InventoryItem[] {
  const result: InventoryItem[] = [];

  for (const item of items) {
    const assignment = item.room_assignments?.find((a) => a.room_id === roomId);

    if (assignment) {
      result.push({
        ...item,
        room_id: roomId,
        expected_quantity: assignment.quantity,
        assigned_room_id: roomId,
        assigned_quantity: assignment.quantity,
        condition_status: assignment.condition_status,
        condition_notes: assignment.condition_notes,
      });
      continue;
    }

    // Fallback if item has no room_assignments array yet but was directly assigned to this room
    if (
      item.room_id === roomId &&
      (!item.room_assignments || item.room_assignments.length === 0)
    ) {
      result.push({
        ...item,
        assigned_room_id: roomId,
        assigned_quantity: item.expected_quantity,
        condition_status: 'good',
        condition_notes: null,
      });
    }
  }

  return result;
}

// ============================================================================
// SUPABASE STORAGE OPERATIONS ('inventory-photos')
// ============================================================================

export async function uploadInventoryPhoto(blob: Blob, itemHint = 'item'): Promise<string> {
  ensureConfigured();
  const supabase = getSupabaseClient();

  const safeSlug = itemHint
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'item';

  const randomPart = Math.random().toString(36).substring(2, 9);
  const filePath = `items/${Date.now()}-${safeSlug}-${randomPart}.jpg`;

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    const msg = String(error.message || '');
    if (msg.toLowerCase().includes('bucket not found') || msg.toLowerCase().includes('not found')) {
      throw new Error(
        `O bucket "${STORAGE_BUCKET}" não foi encontrado no Supabase Storage. Execute o script SQL em "Banco & Nuvem" para criar o bucket e as políticas de acesso.`
      );
    }
    if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('policy')) {
      throw new Error(
        `Permissão negada no Supabase Storage ("${STORAGE_BUCKET}"). Execute o script SQL em "Banco & Nuvem" para configurar as políticas de upload.`
      );
    }
    throw new Error(`Falha no upload da fotografia: ${msg}`);
  }

  return data.path;
}

export async function deleteInventoryPhotoIfUnused(
  imagePath: string,
  excludeItemId?: string
): Promise<void> {
  if (!imagePath || imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return;
  }
  ensureConfigured();
  const supabase = getSupabaseClient();

  let query = supabase
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('image_path', imagePath);

  if (excludeItemId) {
    query = query.neq('id', excludeItemId);
  }

  const { count } = await query;
  if (!count || count === 0) {
    await supabase.storage.from(STORAGE_BUCKET).remove([imagePath]);
  }
}

// ============================================================================
// CONNECTION & SCHEMA DIAGNOSTICS
// ============================================================================

export interface SupabaseDiagnosticResult {
  connected: boolean;
  tablesReady: boolean;
  storageReady: boolean;
  roomsCount: number;
  categoriesCount: number;
  itemsCount: number;
  message: string;
}

export async function verifySupabaseSetup(): Promise<SupabaseDiagnosticResult> {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      tablesReady: false,
      storageReady: false,
      roomsCount: 0,
      categoriesCount: 0,
      itemsCount: 0,
      message: 'Credenciais do Supabase não configuradas.',
    };
  }

  const supabase = getSupabaseClient();

  try {
    const [roomsRes, catsRes, itemsRes] = await Promise.all([
      supabase.from('rooms').select('id', { count: 'exact', head: true }),
      supabase.from('inventory_categories').select('id', { count: 'exact', head: true }),
      supabase.from('inventory_items').select('id', { count: 'exact', head: true }),
    ]);

    if (roomsRes.error || catsRes.error || itemsRes.error) {
      const firstErr = roomsRes.error || catsRes.error || itemsRes.error;
      const errMsg = String(firstErr?.message || '');
      const missingTable =
        errMsg.includes('does not exist') ||
        errMsg.includes('Could not find the table') ||
        firstErr?.code === '42P01' ||
        firstErr?.code === 'PGRST205';

      if (missingTable) {
        return {
          connected: true,
          tablesReady: false,
          storageReady: false,
          roomsCount: 0,
          categoriesCount: 0,
          itemsCount: 0,
          message:
            'Conectado ao Supabase, porém as tabelas (rooms, inventory_categories, inventory_items) ainda não existem. Copie e execute o SQL abaixo no SQL Editor do Supabase.',
        };
      }

      return {
        connected: false,
        tablesReady: false,
        storageReady: false,
        roomsCount: 0,
        categoriesCount: 0,
        itemsCount: 0,
        message: `Erro ao consultar o Supabase: ${errMsg}`,
      };
    }

    // Check storage bucket by listing root of inventory-photos
    const { error: storageErr } = await supabase.storage.from(STORAGE_BUCKET).list('items', {
      limit: 1,
    });

    const storageReady = !storageErr;

    return {
      connected: true,
      tablesReady: true,
      storageReady,
      roomsCount: roomsRes.count || 0,
      categoriesCount: catsRes.count || 0,
      itemsCount: itemsRes.count || 0,
      message: storageReady
        ? 'Conexão ativa! Tabelas do inventário e bucket "inventory-photos" prontos para uso.'
        : `Tabelas prontas, mas o bucket "${STORAGE_BUCKET}" no Storage retornou: ${storageErr?.message}. Execute o SQL completo para configurar o Storage.`,
    };
  } catch (err: any) {
    return {
      connected: false,
      tablesReady: false,
      storageReady: false,
      roomsCount: 0,
      categoriesCount: 0,
      itemsCount: 0,
      message: `Falha de rede ou URL inválida: ${err?.message || 'Erro desconhecido'}`,
    };
  }
}
