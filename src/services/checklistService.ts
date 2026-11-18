import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import {
  ChecklistItemResult,
  ChecklistOccurrence,
  ChecklistOccurrenceType,
  ChecklistRoomProgress,
  ChecklistSession,
  ChecklistSessionSummary,
} from '../types/checklist';
import { InventoryItem, Room } from '../types/inventory';

const LS_ACTIVE_SESSION_KEY = 'chacara_active_checklist_session_id_v2';
const LS_SESSIONS_BACKUP_KEY = 'chacara_checklist_sessions_backup_v2';
const LS_ROOM_PROGRESS_KEY = 'chacara_checklist_room_progress_backup_v2';
const LS_ITEM_RESULTS_KEY = 'chacara_checklist_item_results_backup_v2';
const LS_OCCURRENCES_KEY = 'chacara_checklist_occurrences_backup_v2';

// Helper for local storage backups
function getLocalJson<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocalJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function getActiveSessionIdLocal(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LS_ACTIVE_SESSION_KEY);
}

export function setActiveSessionIdLocal(sessionId: string | null): void {
  if (typeof window === 'undefined') return;
  if (sessionId) {
    localStorage.setItem(LS_ACTIVE_SESSION_KEY, sessionId);
  } else {
    localStorage.removeItem(LS_ACTIVE_SESSION_KEY);
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export async function getOrCreateActiveChecklistSession(
  rooms: Room[],
  forceNew = false
): Promise<{
  session: ChecklistSession;
  roomProgressList: ChecklistRoomProgress[];
  itemResults: ChecklistItemResult[];
  occurrences: ChecklistOccurrence[];
}> {
  const localId = getActiveSessionIdLocal();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();

    // 1. If not forcing a new session, check for an existing active session
    if (!forceNew) {
      // First, try loading by local active session ID
      if (localId) {
        const { data: byId } = await supabase
          .from('checklist_sessions')
          .select('*')
          .eq('id', localId)
          .eq('status', 'in_progress')
          .maybeSingle();

        if (byId) {
          const detail = await fetchActiveSessionData(byId.id, rooms);
          return detail;
        }
      }

      // If no local session or not found, check Supabase for any in_progress session
      const { data: activeList } = await supabase
        .from('checklist_sessions')
        .select('*')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1);

      if (activeList && activeList.length > 0) {
        const active = activeList[0] as ChecklistSession;
        setActiveSessionIdLocal(active.id);
        const detail = await fetchActiveSessionData(active.id, rooms);
        return detail;
      }
    }

    // 2. If forcing new or none found, start a new session in Supabase
    const { data: newSession, error: sessErr } = await supabase
      .from('checklist_sessions')
      .insert({
        status: 'in_progress',
        inspector_name: 'Responsável',
      })
      .select('*')
      .single();

    if (!sessErr && newSession) {
      const session = newSession as ChecklistSession;
      setActiveSessionIdLocal(session.id);

      // Create initial room progress for all available rooms
      if (rooms.length > 0) {
        const roomPayload = rooms.map((r, idx) => ({
          checklist_session_id: session.id,
          room_id: r.id,
          room_name_snapshot: r.name,
          inspection_order: r.inspection_order ?? (idx + 1),
          status: 'pending',
        }));
        const insertRes = await supabase.from('checklist_room_progress').insert(roomPayload);
        if (insertRes.error) {
          // Fallback if inspection_order column not yet created in checklist_room_progress
          const fallbackPayload = rooms.map((r) => ({
            checklist_session_id: session.id,
            room_id: r.id,
            room_name_snapshot: r.name,
            status: 'pending',
          }));
          await supabase.from('checklist_room_progress').insert(fallbackPayload);
        }
      }

      const detail = await fetchActiveSessionData(session.id, rooms);
      return detail;
    }
  }

  // 3. Fallback / Offline Local Session
  const localSessions = getLocalJson<ChecklistSession[]>(LS_SESSIONS_BACKUP_KEY, []);
  let session = !forceNew && localId ? localSessions.find((s) => s.id === localId && s.status === 'in_progress') : null;

  if (!session) {
    session = {
      id: `local-sess-${Date.now()}`,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      completed_at: null,
      inspector_name: 'Responsável',
      notes: null,
      created_at: new Date().toISOString(),
    };
    localSessions.unshift(session);
    setLocalJson(LS_SESSIONS_BACKUP_KEY, localSessions);
    setActiveSessionIdLocal(session.id);

    // Initial local room progress
    const allProgress = getLocalJson<ChecklistRoomProgress[]>(LS_ROOM_PROGRESS_KEY, []);
    const newProgress = rooms.map((r) => ({
      id: `prog-${session!.id}-${r.id}`,
      checklist_session_id: session!.id,
      room_id: r.id,
      status: 'pending' as const,
      completed_at: null,
      created_at: new Date().toISOString(),
      room: r,
    }));
    setLocalJson(LS_ROOM_PROGRESS_KEY, [...allProgress, ...newProgress]);
  }

  return fetchActiveSessionData(session.id, rooms);
}

export async function fetchActiveSessionData(
  sessionId: string,
  rooms: Room[]
): Promise<{
  session: ChecklistSession;
  roomProgressList: ChecklistRoomProgress[];
  itemResults: ChecklistItemResult[];
  occurrences: ChecklistOccurrence[];
}> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    try {
      const [sessRes, roomProgRes, itemRes, occRes] = await Promise.all([
        supabase.from('checklist_sessions').select('*').eq('id', sessionId).single(),
        supabase.from('checklist_room_progress').select('*, room:rooms(*)').eq('checklist_session_id', sessionId),
        supabase.from('checklist_item_results').select('*').eq('checklist_session_id', sessionId),
        supabase.from('checklist_occurrences').select('*, room:rooms(*)').eq('checklist_session_id', sessionId),
      ]);

      if (sessRes.data) {
        const session = sessRes.data as ChecklistSession;
        let roomProgressList = (roomProgRes.data || []) as ChecklistRoomProgress[];
        const itemResults = (itemRes.data || []) as ChecklistItemResult[];
        const occurrences = (occRes.data || []) as ChecklistOccurrence[];

        // Ensure every existing room has a progress entry in this session
        const existingRoomIds = new Set(roomProgressList.map((rp) => rp.room_id));
        const missingRooms = rooms.filter((r) => !existingRoomIds.has(r.id));
        if (missingRooms.length > 0) {
          const toInsert = missingRooms.map((r) => ({
            checklist_session_id: sessionId,
            room_id: r.id,
            room_name_snapshot: r.name,
            status: 'pending',
          }));
          const { data: inserted } = await supabase.from('checklist_room_progress').insert(toInsert).select('*, room:rooms(*)');
          if (inserted) {
            roomProgressList = [...roomProgressList, ...(inserted as ChecklistRoomProgress[])];
          }
        }

        // Sort roomProgressList strictly according to the authoritative inspection order
        const roomOrderMap = new Map(rooms.map((r, idx) => [r.id, r.inspection_order ?? (idx + 1)]));
        roomProgressList.sort((a, b) => {
          const orderA = a.room_id ? (roomOrderMap.get(a.room_id) ?? a.inspection_order ?? 999999) : 999999;
          const orderB = b.room_id ? (roomOrderMap.get(b.room_id) ?? b.inspection_order ?? 999999) : 999999;
          return orderA - orderB;
        });

        // Cache to local storage for instant offline recovery
        cacheSessionSnapshot(session, roomProgressList, itemResults, occurrences);

        return {
          session,
          roomProgressList,
          itemResults,
          occurrences,
        };
      }
    } catch {
      // Fallback to local
    }
  }

  // Local fallback recovery
  const localSessions = getLocalJson<ChecklistSession[]>(LS_SESSIONS_BACKUP_KEY, []);
  const session = localSessions.find((s) => s.id === sessionId) || {
    id: sessionId,
    status: 'in_progress',
    started_at: new Date().toISOString(),
    completed_at: null,
    inspector_name: 'Responsável',
    notes: null,
    created_at: new Date().toISOString(),
  };

  const allProgress = getLocalJson<ChecklistRoomProgress[]>(LS_ROOM_PROGRESS_KEY, []);
  let roomProgressList = allProgress.filter((rp) => rp.checklist_session_id === sessionId);

  // Link rooms and sort by authoritative inspection order
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const roomOrderMap = new Map(rooms.map((r, idx) => [r.id, r.inspection_order ?? (idx + 1)]));
  roomProgressList = roomProgressList.map((rp) => ({
    ...rp,
    room: (rp.room_id ? roomMap.get(rp.room_id) : null) || rp.room || null,
  }));
  roomProgressList.sort((a, b) => {
    const orderA = a.room_id ? (roomOrderMap.get(a.room_id) ?? a.inspection_order ?? 999999) : 999999;
    const orderB = b.room_id ? (roomOrderMap.get(b.room_id) ?? b.inspection_order ?? 999999) : 999999;
    return orderA - orderB;
  });

  // Ensure every room is present
  const existingRoomIds = new Set(roomProgressList.map((rp) => rp.room_id));
  for (const r of rooms) {
    if (!existingRoomIds.has(r.id)) {
      const entry: ChecklistRoomProgress = {
        id: `prog-${sessionId}-${r.id}`,
        checklist_session_id: sessionId,
        room_id: r.id,
        status: 'pending',
        completed_at: null,
        created_at: new Date().toISOString(),
        room: r,
      };
      roomProgressList.push(entry);
      allProgress.push(entry);
    }
  }
  setLocalJson(LS_ROOM_PROGRESS_KEY, allProgress);

  const allItemResults = getLocalJson<ChecklistItemResult[]>(LS_ITEM_RESULTS_KEY, []);
  const itemResults = allItemResults.filter((ir) => ir.checklist_session_id === sessionId);

  const allOccurrences = getLocalJson<ChecklistOccurrence[]>(LS_OCCURRENCES_KEY, []);
  const occurrences = allOccurrences.filter((oc) => oc.checklist_session_id === sessionId);

  return {
    session,
    roomProgressList,
    itemResults,
    occurrences,
  };
}

function cacheSessionSnapshot(
  session: ChecklistSession,
  roomProgressList: ChecklistRoomProgress[],
  itemResults: ChecklistItemResult[],
  occurrences: ChecklistOccurrence[]
): void {
  // Update sessions list
  const sessions = getLocalJson<ChecklistSession[]>(LS_SESSIONS_BACKUP_KEY, []);
  const sIdx = sessions.findIndex((s) => s.id === session.id);
  if (sIdx >= 0) sessions[sIdx] = session;
  else sessions.unshift(session);
  setLocalJson(LS_SESSIONS_BACKUP_KEY, sessions);

  // Update room progress
  const allProg = getLocalJson<ChecklistRoomProgress[]>(LS_ROOM_PROGRESS_KEY, []).filter(
    (rp) => rp.checklist_session_id !== session.id
  );
  setLocalJson(LS_ROOM_PROGRESS_KEY, [...allProg, ...roomProgressList]);

  // Update item results
  const allResults = getLocalJson<ChecklistItemResult[]>(LS_ITEM_RESULTS_KEY, []).filter(
    (ir) => ir.checklist_session_id !== session.id
  );
  setLocalJson(LS_ITEM_RESULTS_KEY, [...allResults, ...itemResults]);

  // Update occurrences
  const allOcc = getLocalJson<ChecklistOccurrence[]>(LS_OCCURRENCES_KEY, []).filter(
    (oc) => oc.checklist_session_id !== session.id
  );
  setLocalJson(LS_OCCURRENCES_KEY, [...allOcc, ...occurrences]);
}

// ============================================================================
// INSPECTION ACTIONS (ITEM & ROOM PROGRESS)
// ============================================================================

export interface RecordItemInspectionParams {
  sessionId: string;
  item: InventoryItem;
  status: 'found' | 'missing' | 'damaged';
  foundQuantity: number;
  notes?: string | null;
  occurrenceType?: ChecklistOccurrenceType | null;
  missingQuantity?: number;
  occurrenceDescription?: string | null;
  inspectionTypeSnapshot?: InspectionType | null;
  inspectionAnswers?: Record<string, boolean> | null;
  failedQuestion?: string | null;
}

export async function recordItemInspection(
  params: RecordItemInspectionParams
): Promise<{
  result: ChecklistItemResult;
  occurrence: ChecklistOccurrence | null;
}> {
  const {
    sessionId,
    item,
    status,
    foundQuantity,
    notes = null,
    occurrenceType = null,
    missingQuantity = 0,
    occurrenceDescription = null,
    inspectionTypeSnapshot = item.inspection_type || 'physical_integrity',
    inspectionAnswers = null,
    failedQuestion = null,
  } = params;

  const effectiveRoomId = item.assigned_room_id ?? item.room_id ?? null;
  const roomNameSnap = item.room?.name || '';
  const resultPayload: Omit<ChecklistItemResult, 'id'> = {
    checklist_session_id: sessionId,
    room_id: effectiveRoomId,
    room_name_snapshot: roomNameSnap,
    inventory_item_id: item.id,
    item_name_snapshot: item.name,
    identification_code_snapshot: item.identification_code || null,
    inventory_type: item.inventory_type,
    expected_quantity: item.expected_quantity,
    found_quantity: foundQuantity,
    status,
    inspection_type_snapshot: inspectionTypeSnapshot,
    inspection_answers: inspectionAnswers,
    notes,
    inspected_at: new Date().toISOString(),
  };

  let savedResult: ChecklistItemResult = {
    id: `res-${sessionId}-${item.id}`,
    ...resultPayload,
  };

  let savedOccurrence: ChecklistOccurrence | null = null;

  // Supabase Save
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    try {
      // Upsert item result
      const { data: resData, error: upsertErr } = await supabase
        .from('checklist_item_results')
        .upsert(resultPayload, {
          onConflict: 'checklist_session_id,inventory_item_id',
        })
        .select('*')
        .single();

      if (!upsertErr && resData) {
        savedResult = resData as ChecklistItemResult;
      } else if (upsertErr) {
        // Fallback without new inspection columns if migration not yet applied in Supabase
        const { inspection_type_snapshot, inspection_answers, ...legacyPayload } = resultPayload;
        const { data: legacyResData } = await supabase
          .from('checklist_item_results')
          .upsert(legacyPayload, {
            onConflict: 'checklist_session_id,inventory_item_id',
          })
          .select('*')
          .single();
        if (legacyResData) savedResult = legacyResData as ChecklistItemResult;
      }

      // Handle occurrence (missing / damaged)
      if (occurrenceType) {
        const occPayload = {
          checklist_session_id: sessionId,
          inventory_item_id: item.id,
          room_id: effectiveRoomId,
          room_name_snapshot: roomNameSnap,
          occurrence_type: occurrenceType,
          missing_quantity: missingQuantity,
          description: occurrenceDescription || notes || null,
          inspection_type_snapshot: inspectionTypeSnapshot,
          failed_question: failedQuestion,
        };

        const { data: occData, error: occErr } = await supabase
          .from('checklist_occurrences')
          .insert(occPayload)
          .select('*, room:rooms(*)')
          .single();

        if (!occErr && occData) {
          savedOccurrence = occData as ChecklistOccurrence;
        } else if (occErr) {
          // Fallback without new columns
          const { inspection_type_snapshot, failed_question, ...legacyOccPayload } = occPayload;
          const { data: legacyOccData } = await supabase
            .from('checklist_occurrences')
            .insert(legacyOccPayload)
            .select('*, room:rooms(*)')
            .single();
          if (legacyOccData) savedOccurrence = legacyOccData as ChecklistOccurrence;
        }
      }
    } catch (err) {
      console.warn('Erro ao salvar resultado no Supabase, mantendo cache local:', err);
    }
  }

  // Update local cache
  const allResults = getLocalJson<ChecklistItemResult[]>(LS_ITEM_RESULTS_KEY, []);
  const idx = allResults.findIndex(
    (r) => r.checklist_session_id === sessionId && r.inventory_item_id === item.id
  );
  if (idx >= 0) allResults[idx] = savedResult;
  else allResults.push(savedResult);
  setLocalJson(LS_ITEM_RESULTS_KEY, allResults);

  if (occurrenceType) {
    if (!savedOccurrence) {
      savedOccurrence = {
        id: `occ-${Date.now()}-${item.id}`,
        checklist_session_id: sessionId,
        inventory_item_id: item.id,
        room_id: effectiveRoomId,
        occurrence_type: occurrenceType,
        missing_quantity: missingQuantity,
        description: occurrenceDescription || notes || null,
        inspection_type_snapshot: inspectionTypeSnapshot,
        failed_question: failedQuestion,
        created_at: new Date().toISOString(),
        item_name: item.name,
      };
    }
    const allOcc = getLocalJson<ChecklistOccurrence[]>(LS_OCCURRENCES_KEY, []);
    allOcc.push(savedOccurrence);
    setLocalJson(LS_OCCURRENCES_KEY, allOcc);
  }

  return { result: savedResult, occurrence: savedOccurrence };
}

export async function markRoomCompleted(
  sessionId: string,
  roomId: string
): Promise<ChecklistRoomProgress> {
  const completedAt = new Date().toISOString();
  let updatedProgress: ChecklistRoomProgress = {
    id: `prog-${sessionId}-${roomId}`,
    checklist_session_id: sessionId,
    room_id: roomId,
    status: 'completed',
    completed_at: completedAt,
    created_at: completedAt,
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    try {
      const { data } = await supabase
        .from('checklist_room_progress')
        .upsert(
          {
            checklist_session_id: sessionId,
            room_id: roomId,
            status: 'completed',
            completed_at: completedAt,
          },
          { onConflict: 'checklist_session_id,room_id' }
        )
        .select('*, room:rooms(*)')
        .single();

      if (data) updatedProgress = data as ChecklistRoomProgress;
    } catch {
      // Local cache fallback
    }
  }

  // Update local
  const allProg = getLocalJson<ChecklistRoomProgress[]>(LS_ROOM_PROGRESS_KEY, []);
  const pIdx = allProg.findIndex(
    (p) => p.checklist_session_id === sessionId && p.room_id === roomId
  );
  if (pIdx >= 0) allProg[pIdx] = updatedProgress;
  else allProg.push(updatedProgress);
  setLocalJson(LS_ROOM_PROGRESS_KEY, allProg);

  return updatedProgress;
}

export async function markRoomInProgress(
  sessionId: string,
  roomId: string
): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    try {
      await supabase
        .from('checklist_room_progress')
        .upsert(
          {
            checklist_session_id: sessionId,
            room_id: roomId,
            status: 'in_progress',
          },
          { onConflict: 'checklist_session_id,room_id' }
        );
    } catch {}
  }

  const allProg = getLocalJson<ChecklistRoomProgress[]>(LS_ROOM_PROGRESS_KEY, []);
  const p = allProg.find(
    (pr) => pr.checklist_session_id === sessionId && pr.room_id === roomId
  );
  if (p && p.status === 'pending') {
    p.status = 'in_progress';
    setLocalJson(LS_ROOM_PROGRESS_KEY, allProg);
  }
}

export async function finalizeChecklistSession(
  sessionId: string
): Promise<ChecklistSession> {
  const completedAt = new Date().toISOString();
  let updatedSession: ChecklistSession = {
    id: sessionId,
    status: 'completed',
    started_at: completedAt,
    completed_at: completedAt,
    inspector_name: 'Responsável',
    notes: null,
    created_at: completedAt,
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    try {
      const { data } = await supabase
        .from('checklist_sessions')
        .update({
          status: 'completed',
          completed_at: completedAt,
        })
        .eq('id', sessionId)
        .select('*')
        .single();

      if (data) updatedSession = data as ChecklistSession;
    } catch {}
  }

  // Update local session
  const localSessions = getLocalJson<ChecklistSession[]>(LS_SESSIONS_BACKUP_KEY, []);
  const s = localSessions.find((sess) => sess.id === sessionId);
  if (s) {
    s.status = 'completed';
    s.completed_at = completedAt;
    updatedSession = s;
  }
  setLocalJson(LS_SESSIONS_BACKUP_KEY, localSessions);

  // Clear active session pointer so next run can start fresh
  setActiveSessionIdLocal(null);

  return updatedSession;
}

// ============================================================================
// INSPECTION HISTORY (ADMINISTRATIVE)
// ============================================================================

export async function fetchInspectionHistory(): Promise<ChecklistSessionSummary[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    try {
      const { data: sessions, error } = await supabase
        .from('checklist_sessions')
        .select('*')
        .order('started_at', { ascending: false });

      if (!error && sessions) {
        const summaries: ChecklistSessionSummary[] = [];

        for (const session of sessions) {
          const [roomProgRes, itemRes, occRes] = await Promise.all([
            supabase
              .from('checklist_room_progress')
              .select('id, status', { count: 'exact' })
              .eq('checklist_session_id', session.id),
            supabase
              .from('checklist_item_results')
              .select('id, status', { count: 'exact' })
              .eq('checklist_session_id', session.id),
            supabase
              .from('checklist_occurrences')
              .select('*, room:rooms(*)')
              .eq('checklist_session_id', session.id),
          ]);

          const totalRooms = roomProgRes.count || 0;
          const completedRooms =
            roomProgRes.data?.filter((r) => r.status === 'completed').length || 0;

          const totalItems = itemRes.count || 0;
          const foundItems =
            itemRes.data?.filter((i) => i.status === 'found').length || 0;
          const missingItemsCount =
            itemRes.data?.filter((i) => i.status === 'missing').length || 0;
          const damagedItemsCount =
            itemRes.data?.filter((i) => i.status === 'damaged').length || 0;

          summaries.push({
            session: session as ChecklistSession,
            totalRooms,
            completedRooms,
            totalItems,
            inspectedItems: totalItems,
            foundItems,
            missingItemsCount,
            damagedItemsCount,
            occurrences: (occRes.data || []) as ChecklistOccurrence[],
          });
        }

        return summaries;
      }
    } catch {}
  }

  // Local fallback history
  const localSessions = getLocalJson<ChecklistSession[]>(LS_SESSIONS_BACKUP_KEY, []);
  const allProgress = getLocalJson<ChecklistRoomProgress[]>(LS_ROOM_PROGRESS_KEY, []);
  const allResults = getLocalJson<ChecklistItemResult[]>(LS_ITEM_RESULTS_KEY, []);
  const allOccurrences = getLocalJson<ChecklistOccurrence[]>(LS_OCCURRENCES_KEY, []);

  return localSessions.map((session) => {
    const roomsProg = allProgress.filter((p) => p.checklist_session_id === session.id);
    const results = allResults.filter((r) => r.checklist_session_id === session.id);
    const occ = allOccurrences.filter((o) => o.checklist_session_id === session.id);

    return {
      session,
      totalRooms: roomsProg.length,
      completedRooms: roomsProg.filter((p) => p.status === 'completed').length,
      totalItems: results.length,
      inspectedItems: results.length,
      foundItems: results.filter((r) => r.status === 'found').length,
      missingItemsCount: results.filter((r) => r.status === 'missing').length,
      damagedItemsCount: results.filter((r) => r.status === 'damaged').length,
      occurrences: occ,
    };
  });
}
