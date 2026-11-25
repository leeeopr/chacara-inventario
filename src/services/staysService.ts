// ============================================================================
// Stays Service - Real-time Integration between Chácara Management System & Checklist
// Reads live reservations from the Chácara System Supabase (zlutgzuwhbhsjgvhpzqi)
// and merges/persists inspection, cleaning (faxina) & pool status in App Supabase.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { ChecklistSession, SessionWithDetails } from '../types/checklist';
import { Room } from '../types/inventory';
import {
  Stay,
  StayChecklistStatus,
  StayCleaningStatus,
  StayPoolStatus,
} from '../types/stay';
import { getOrCreateActiveChecklistSession, StayLinkInfo } from './checklistService';

const CHACARA_SYS_URL = 'https://zlutgzuwhbhsjgvhpzqi.supabase.co';
const CHACARA_SYS_ANON_KEY = 'sb_publishable_y1gh8ZaZYOEeIDJb4qMCAg_UgaGZo_V';
const CHACARA_SYS_SYNC_EMAIL = 'sync-inventario@chacara.com';
const CHACARA_SYS_SYNC_PASS = 'ChacaraSync2026!';

const LS_LEGACY_CACHE_KEYS = ['chacara_cached_stays_v1', 'chacara_cached_stays_v2'];
const LS_CACHED_STAYS_KEY = 'chacara_cached_stays_v3';

const ALLOWED_RES_STATUS = new Set([
  'PRE_RESERVA',
  'AGUARDANDO_CONFIRMACAO',
  'CONFIRMADA',
  'CHECKIN_REALIZADO',
  'HOSPEDADO',
  'CHECKOUT_REALIZADO',
  'FINALIZADA',
  'CANCELADA',
  'NO_SHOW',
]);

const ALLOWED_RES_ORIGIN = new Set([
  'WHATSAPP',
  'INSTAGRAM',
  'AIRBNB',
  'BOOKING',
  'SITE_DIRETO',
  'INDICACAO',
  'TELEFONE',
  'OUTRO',
]);

let chacaraSysClientInstance: SupabaseClient | null = null;

function getChacaraSystemClient(): SupabaseClient {
  if (!chacaraSysClientInstance) {
    chacaraSysClientInstance = createClient(CHACARA_SYS_URL, CHACARA_SYS_ANON_KEY, {
      auth: {
        storageKey: 'chacara_system_bridge_auth_v1',
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return chacaraSysClientInstance;
}

function clearLegacyStaysCache(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const k of LS_LEGACY_CACHE_KEYS) {
      localStorage.removeItem(k);
    }
  } catch {}
}

// Helper: Local YYYY-MM-DD (avoids late-evening UTC date rollover in Brazil)
export function getLocalTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: Format date strings YYYY-MM-DD to DD/MM/YYYY
export function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Helper: Calculate checkout/stay status relative to today
export function getStayTemporalStatus(
  checkinDate: string,
  checkoutDate: string
): 'past' | 'today' | 'current' | 'future' {
  const today = getLocalTodayDateStr();
  if (checkoutDate === today) return 'today';
  if (checkoutDate < today) return 'past';
  if (checkinDate <= today && today <= checkoutDate) return 'current';
  return 'future';
}

async function ensureChacaraSysAuthenticated(sysClient: SupabaseClient): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await sysClient.auth.getSession();
    if (session?.access_token) return true;

    const { data, error } = await sysClient.auth.signInWithPassword({
      email: CHACARA_SYS_SYNC_EMAIL,
      password: CHACARA_SYS_SYNC_PASS,
    });
    return !error && Boolean(data?.session?.access_token);
  } catch {
    return false;
  }
}

async function fetchLiveReservationsFromChacaraSystem(): Promise<any[] | null> {
  try {
    const sysClient = getChacaraSystemClient();
    const ok = await ensureChacaraSysAuthenticated(sysClient);
    if (!ok) return null;

    let { data, error } = await sysClient
      .from('reservations')
      .select('*, client:clients(*), chacara:chacaras(*)')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('checkout_date', { ascending: false });

    // Retry once with fresh sign-in if token expired or revoked
    if (error && (error.code === '42501' || error.message?.toLowerCase().includes('jwt'))) {
      await sysClient.auth.signInWithPassword({
        email: CHACARA_SYS_SYNC_EMAIL,
        password: CHACARA_SYS_SYNC_PASS,
      });
      const retry = await sysClient
        .from('reservations')
        .select('*, client:clients(*), chacara:chacaras(*)')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('checkout_date', { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn('Falha ao consultar sistema principal da chácara:', error.message);
      return null;
    }

    return (data as any[]) || [];
  } catch (err) {
    console.warn('Exceção ao conectar com reservas ao vivo:', err);
    return null;
  }
}

async function mirrorReservationsToAppDb(
  appDb: SupabaseClient,
  liveRows: any[],
  localMap: Map<string, any>
): Promise<void> {
  if (!liveRows || liveRows.length === 0) return;

  // Determine whether any reservation is missing or has stale core metadata locally
  const needsSync = liveRows.some((r) => {
    const loc = localMap.get(r.id);
    if (!loc) return true;
    return (
      loc.checkin_date !== r.checkin_date ||
      loc.checkout_date !== r.checkout_date ||
      loc.status !== r.status ||
      loc.code !== r.code
    );
  });

  if (!needsSync) return;

  try {
    const chacaraMap = new Map<string, any>();
    const clientMap = new Map<string, any>();

    for (const r of liveRows) {
      if (r.chacara && r.chacara.id) {
        chacaraMap.set(r.chacara.id, {
          id: r.chacara.id,
          name: r.chacara.name || 'Chácara Principal',
          description: r.chacara.description || null,
          status: r.chacara.status || 'ATIVA',
          street: r.chacara.street || null,
          city: r.chacara.city || null,
          state: r.chacara.state || null,
          checkin_time: r.chacara.checkin_time || '14:00:00',
          checkout_time: r.chacara.checkout_time || '12:00:00',
          main_photo_url: r.chacara.main_photo_url || null,
        });
      }
      if (r.client && r.client.id) {
        clientMap.set(r.client.id, {
          id: r.client.id,
          full_name: r.client.full_name || 'Hóspede',
          document_number: r.client.document_number || null,
          email: r.client.email || null,
          phone: r.client.phone ?? '',
          city: r.client.city || null,
          state: r.client.state || null,
          notes: r.client.notes || null,
          tags: Array.isArray(r.client.tags) ? r.client.tags : [],
          total_reservations: Number(r.client.total_reservations) || 0,
        });
      }
    }

    if (chacaraMap.size > 0) {
      await appDb.from('chacaras').upsert(Array.from(chacaraMap.values()), { onConflict: 'id' });
    }
    if (clientMap.size > 0) {
      await appDb.from('clients').upsert(Array.from(clientMap.values()), { onConflict: 'id' });
    }

    const resPayload = liveRows.map((r) => ({
      id: r.id,
      chacara_id: r.chacara_id || null,
      client_id: r.client_id || null,
      code: r.code || `REC-${String(r.id).slice(0, 6).toUpperCase()}`,
      checkin_date: r.checkin_date,
      checkin_time: r.checkin_time || '14:00:00',
      checkout_date: r.checkout_date,
      checkout_time: r.checkout_time || '12:00:00',
      guests_adults: Number(r.guests_adults) || 1,
      guests_children: Number(r.guests_children) || 0,
      guests_infants: Number(r.guests_infants) || 0,
      guests_pets: Number(r.guests_pets) || 0,
      total_guests:
        Number(r.total_guests) || (Number(r.guests_adults) || 1) + (Number(r.guests_children) || 0),
      status: ALLOWED_RES_STATUS.has(r.status) ? r.status : 'CONFIRMADA',
      origin: ALLOWED_RES_ORIGIN.has(r.origin) ? r.origin : 'OUTRO',
      special_requests: r.special_requests || null,
      internal_notes: r.internal_notes || null,
      is_deleted: Boolean(r.is_deleted),
    }));

    await appDb.from('reservations').upsert(resPayload, { onConflict: 'id' });
  } catch (err) {
    console.warn('Espelhamento de reservas para o banco do app falhou:', err);
  }
}

/**
 * Fetch all real stays (reservations) in real time from the Chácara System Supabase,
 * merging checklist sessions, occurrences, cleaning (faxina) and pool statuses from App Supabase.
 */
export async function fetchStays(): Promise<Stay[]> {
  try {
    const supabase = getSupabaseClient();
    const configured = isSupabaseConfigured();

    const [liveRows, localResResp, sessionsResp, occResp] = await Promise.all([
      fetchLiveReservationsFromChacaraSystem(),
      configured
        ? supabase
            .from('reservations')
            .select('*, client:clients(*), chacara:chacaras(*)')
            .or('is_deleted.is.null,is_deleted.eq.false')
            .order('checkout_date', { ascending: false })
        : Promise.resolve({ data: null, error: null }),
      configured
        ? supabase
            .from('checklist_sessions')
            .select('id, status, reservation_id, completed_at, inspector_name')
        : Promise.resolve({ data: null }),
      configured
        ? supabase.from('checklist_occurrences').select('checklist_session_id')
        : Promise.resolve({ data: null }),
    ]);

    const localRows = (localResResp as any)?.data || [];
    const localResMap = new Map<string, any>();
    for (const lr of localRows) {
      localResMap.set(lr.id, lr);
    }

    // Mirror new/updated reservations from main Chácara system into App DB
    if (configured && liveRows !== null && liveRows.length > 0) {
      await mirrorReservationsToAppDb(supabase, liveRows, localResMap);
    }

    const sourceRows: any[] = liveRows !== null ? liveRows : localRows;

    const occurrencesMap = new Map<string, number>();
    const occData = (occResp as any)?.data;
    if (occData) {
      for (const oc of occData) {
        const sid = oc.checklist_session_id;
        occurrencesMap.set(sid, (occurrencesMap.get(sid) || 0) + 1);
      }
    }

    const sessionsByReservation = new Map<string, ChecklistSession>();
    const sessionsData = (sessionsResp as any)?.data;
    if (sessionsData) {
      for (const s of sessionsData) {
        if (s.reservation_id) {
          sessionsByReservation.set(s.reservation_id, s as ChecklistSession);
        }
      }
    }

    const today = getLocalTodayDateStr();

    // Map to unified Stay models merging operational fields from App DB
    const stays: Stay[] = sourceRows.map((raw: any) => {
      const opState = localResMap.get(raw.id) || raw;
      const client = raw.client || opState.client || {};
      const chacara = raw.chacara || opState.chacara || {};
      const linkedSession = sessionsByReservation.get(raw.id);
      const issuesCount = linkedSession ? occurrencesMap.get(linkedSession.id) || 0 : 0;

      let checklistStatus: StayChecklistStatus = 'not_required';
      if (linkedSession) {
        if (linkedSession.status === 'completed') {
          checklistStatus = issuesCount > 0 ? 'with_issues' : 'completed';
        } else {
          checklistStatus = 'pending';
        }
      } else if (opState.checklist_status === 'completed') {
        checklistStatus = 'completed';
      } else if (opState.checklist_status === 'with_issues') {
        checklistStatus = 'with_issues';
      } else {
        // If checkout has already arrived or passed, post-stay inspection is pending
        if (raw.checkout_date <= today && raw.status !== 'CANCELADA') {
          checklistStatus = 'pending';
        } else {
          checklistStatus = 'not_required';
        }
      }

      const guestName = client.full_name || client.name || 'Hóspede não identificado';
      const adults = Number(raw.guests_adults) || 1;
      const children = Number(raw.guests_children) || 0;
      const pets = Number(raw.guests_pets) || 0;

      const cleaningStatus: StayCleaningStatus =
        opState.cleaning_status === 'completed' ? 'completed' : 'pending';
      const poolStatus: StayPoolStatus =
        opState.pool_status === 'completed' ? 'completed' : 'pending';

      return {
        id: raw.id,
        code: raw.code || `REC-${String(raw.id).slice(0, 6).toUpperCase()}`,
        guest_name: guestName,
        guest_phone: client.phone || null,
        guest_email: client.email || null,
        guest_document: client.document_number || client.cpf_cnpj || null,
        chacara_name: chacara.name || 'Chácara Conceição',
        checkin_date: raw.checkin_date,
        checkin_time: (raw.checkin_time || '14:00').slice(0, 5),
        checkout_date: raw.checkout_date,
        checkout_time: (raw.checkout_time || '12:00').slice(0, 5),
        guests_adults: adults,
        guests_children: children,
        guests_pets: pets,
        total_guests: Number(raw.total_guests) || adults + children,
        status: raw.status || 'CONFIRMADA',
        special_requests: raw.special_requests || null,
        notes: raw.internal_notes || raw.checkout_notes || raw.checkin_notes || null,
        checklist_status: checklistStatus,
        checklist_session_id: linkedSession?.id || null,
        checklist_completed_at: linkedSession?.completed_at || null,
        checklist_issues_count: issuesCount,
        checklist_inspector_name: linkedSession?.inspector_name || null,
        cleaning_status: cleaningStatus,
        cleaning_completed_at: opState.cleaning_completed_at || null,
        cleaning_completed_by: opState.cleaning_completed_by || null,
        cleaning_notes: opState.cleaning_notes || null,
        pool_status: poolStatus,
        pool_cleaned_at: opState.pool_cleaned_at || null,
        pool_cleaned_by: opState.pool_cleaned_by || null,
        pool_notes: opState.pool_notes || null,
      };
    });

    if (typeof window !== 'undefined') {
      try {
        clearLegacyStaysCache();
        localStorage.setItem(LS_CACHED_STAYS_KEY, JSON.stringify(stays));
      } catch {}
    }

    return stays;
  } catch (err) {
    console.error('Falha ao sincronizar estadias do Supabase:', err);
    return getCachedStaysFallback();
  }
}

/**
 * Returns cached real stays from localStorage (never mock/demo data)
 */
function getCachedStaysFallback(): Stay[] {
  clearLegacyStaysCache();
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LS_CACHED_STAYS_KEY);
      if (cached) {
        return (JSON.parse(cached) as Stay[]).map((s) => ({
          ...s,
          cleaning_status: s.cleaning_status || 'pending',
          pool_status: s.pool_status || 'pending',
        }));
      }
    } catch {}
  }
  return [];
}

function updateCachedStay(stayId: string, patch: Partial<Stay>): void {
  if (typeof window === 'undefined') return;
  try {
    const cached = getCachedStaysFallback();
    const updated = cached.map((s) => (s.id === stayId ? { ...s, ...patch } : s));
    localStorage.setItem(LS_CACHED_STAYS_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * Update post-stay cleaning (Faxina) status on a reservation
 */
export async function updateStayCleaningStatus(
  stayId: string,
  status: StayCleaningStatus,
  completedBy = 'Faxineira'
): Promise<void> {
  const nowIso = status === 'completed' ? new Date().toISOString() : null;
  const byVal = status === 'completed' ? completedBy : null;

  updateCachedStay(stayId, {
    cleaning_status: status,
    cleaning_completed_at: nowIso,
    cleaning_completed_by: byVal,
  });

  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('reservations')
    .update({
      cleaning_status: status,
      cleaning_completed_at: nowIso,
      cleaning_completed_by: byVal,
    })
    .eq('id', stayId);

  if (error) {
    throw new Error(`Erro ao atualizar status da faxina: ${error.message}`);
  }
}

/**
 * Update pool cleaning (Limpeza da Piscina) status on a reservation
 */
export async function updateStayPoolStatus(
  stayId: string,
  status: StayPoolStatus,
  cleanedBy = 'Piscineiro'
): Promise<void> {
  const nowIso = status === 'completed' ? new Date().toISOString() : null;
  const byVal = status === 'completed' ? cleanedBy : null;

  updateCachedStay(stayId, {
    pool_status: status,
    pool_cleaned_at: nowIso,
    pool_cleaned_by: byVal,
  });

  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('reservations')
    .update({
      pool_status: status,
      pool_cleaned_at: nowIso,
      pool_cleaned_by: byVal,
    })
    .eq('id', stayId);

  if (error) {
    throw new Error(`Erro ao atualizar status da piscina: ${error.message}`);
  }
}

/**
 * Start a new checklist session explicitly linked to a Stay
 */
export async function startChecklistForStay(
  stay: Stay,
  rooms: Room[],
  inspectorName = 'Responsável'
): Promise<SessionWithDetails> {
  const stayInfo: StayLinkInfo = {
    reservation_id: stay.id,
    reservation_code: stay.code,
    guest_name_snapshot: stay.guest_name,
    stay_period_snapshot: `${formatDateBR(stay.checkin_date)} a ${formatDateBR(stay.checkout_date)}`,
  };

  const res = await getOrCreateActiveChecklistSession(rooms, true, stayInfo, inspectorName);
  return res;
}

/**
 * Mark all tasks (Checklist/Vistoria, Faxina and Piscina) as COMPLETED for a Stay.
 * Strictly intended for the property owner (admin).
 */
export async function markStayEverythingCompleted(
  stay: Stay,
  completedBy = 'Proprietário'
): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1. Update localStorage cache
  updateCachedStay(stay.id, {
    checklist_status: 'completed',
    checklist_completed_at: nowIso,
    checklist_inspector_name: completedBy,
    cleaning_status: 'completed',
    cleaning_completed_at: nowIso,
    cleaning_completed_by: completedBy,
    pool_status: 'completed',
    pool_cleaned_at: nowIso,
    pool_cleaned_by: completedBy,
  });

  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseClient();

  // 2. Ensure or update checklist session linked to this reservation
  let sessionId = stay.checklist_session_id;

  try {
    if (sessionId) {
      await supabase
        .from('checklist_sessions')
        .update({
          status: 'completed',
          completed_at: nowIso,
          inspector_name: completedBy,
          notes: stay.notes
            ? `${stay.notes} (Concluído pelo proprietário)`
            : 'Concluído pelo proprietário',
        })
        .eq('id', sessionId);
    } else {
      const { data: existingSess } = await supabase
        .from('checklist_sessions')
        .select('id')
        .eq('reservation_id', stay.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSess?.id) {
        sessionId = existingSess.id;
        await supabase
          .from('checklist_sessions')
          .update({
            status: 'completed',
            completed_at: nowIso,
            inspector_name: completedBy,
            notes: 'Concluído pelo proprietário',
          })
          .eq('id', sessionId);
      } else {
        const { data: createdSess } = await supabase
          .from('checklist_sessions')
          .insert({
            status: 'completed',
            started_at: nowIso,
            completed_at: nowIso,
            inspector_name: completedBy,
            notes: 'Concluído pelo proprietário (estadia anterior)',
            reservation_id: stay.id,
            reservation_code: stay.code,
            guest_name_snapshot: stay.guest_name,
            stay_period_snapshot: `${formatDateBR(stay.checkin_date)} a ${formatDateBR(stay.checkout_date)}`,
          })
          .select('id')
          .single();

        if (createdSess?.id) {
          sessionId = createdSess.id;
        }
      }
    }
  } catch (sessErr) {
    console.warn('Erro ao atualizar checklist_session para conclusão total:', sessErr);
  }

  // 3. Update reservations table in App DB
  try {
    const resPayload: Record<string, any> = {
      cleaning_status: 'completed',
      cleaning_completed_at: nowIso,
      cleaning_completed_by: completedBy,
      pool_status: 'completed',
      pool_cleaned_at: nowIso,
      pool_cleaned_by: completedBy,
      checklist_status: 'completed',
      checklist_completed_at: nowIso,
      checklist_inspector_name: completedBy,
    };

    if (sessionId) {
      resPayload.checklist_session_id = sessionId;
    }

    const { error: resErr } = await supabase
      .from('reservations')
      .update(resPayload)
      .eq('id', stay.id);

    if (resErr) {
      console.warn('Erro ao atualizar reservation no App DB:', resErr.message);
    }
  } catch (err) {
    console.warn('Exceção ao persistir conclusão total na reservation:', err);
  }
}

/**
 * Reopen all tasks for a stay (resets Checklist, Faxina and Piscina to pending).
 * Strictly intended for the property owner (admin).
 */
export async function reopenStayEverything(stay: Stay): Promise<void> {
  updateCachedStay(stay.id, {
    checklist_status: 'pending',
    checklist_completed_at: null,
    checklist_inspector_name: null,
    cleaning_status: 'pending',
    cleaning_completed_at: null,
    cleaning_completed_by: null,
    pool_status: 'pending',
    pool_cleaned_at: null,
    pool_cleaned_by: null,
  });

  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseClient();
  try {
    if (stay.checklist_session_id) {
      await supabase
        .from('checklist_sessions')
        .update({
          status: 'in_progress',
          completed_at: null,
        })
        .eq('id', stay.checklist_session_id);
    }

    await supabase
      .from('reservations')
      .update({
        cleaning_status: 'pending',
        cleaning_completed_at: null,
        cleaning_completed_by: null,
        pool_status: 'pending',
        pool_cleaned_at: null,
        pool_cleaned_by: null,
        checklist_status: 'pending',
        checklist_completed_at: null,
      })
      .eq('id', stay.id);
  } catch (err) {
    console.warn('Exceção ao reabrir estadia no App DB:', err);
  }
}
