// ============================================================================
// Stays Service - Integration between Chácara Reservations & Checklist
// Queries reservations and clients directly from the unified Supabase database
// ============================================================================

import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { ChecklistSession, SessionWithDetails } from '../types/checklist';
import { Room } from '../types/inventory';
import { Stay, StayChecklistStatus } from '../types/stay';
import { getOrCreateActiveChecklistSession, StayLinkInfo } from './checklistService';

const LS_CACHED_STAYS_KEY = 'chacara_cached_stays_v1';

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
export function getStayTemporalStatus(checkinDate: string, checkoutDate: string): 'past' | 'today' | 'current' | 'future' {
  const today = new Date().toISOString().split('T')[0];
  if (checkoutDate === today) return 'today';
  if (checkoutDate < today) return 'past';
  if (checkinDate <= today && today <= checkoutDate) return 'current';
  return 'future';
}

/**
 * Fetch all stays (reservations) from the unified Supabase database,
 * cross-referencing completed checklist sessions and occurrences.
 */
export async function fetchStays(): Promise<Stay[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();

      // 1. Fetch reservations joined with clients and chacaras
      const { data: resData, error: resErr } = await supabase
        .from('reservations')
        .select('*, client:clients(*), chacara:chacaras(*)')
        .order('checkout_date', { ascending: false });

      if (resErr) {
        console.warn('Erro ao consultar reservations no Supabase:', resErr.message);
        return getCachedStaysFallback();
      }

      // 2. Fetch checklist sessions that have a reservation_id
      const { data: sessionsData } = await supabase
        .from('checklist_sessions')
        .select('id, status, reservation_id, completed_at, inspector_name');

      // 3. Fetch occurrences to determine if any session had damages/missing items
      const { data: occData } = await supabase
        .from('checklist_occurrences')
        .select('checklist_session_id');

      const occurrencesMap = new Map<string, number>();
      if (occData) {
        for (const oc of occData) {
          const sid = oc.checklist_session_id;
          occurrencesMap.set(sid, (occurrencesMap.get(sid) || 0) + 1);
        }
      }

      const sessionsByReservation = new Map<string, ChecklistSession>();
      if (sessionsData) {
        for (const s of sessionsData) {
          if (s.reservation_id) {
            sessionsByReservation.set(s.reservation_id, s as ChecklistSession);
          }
        }
      }

      const today = new Date().toISOString().split('T')[0];

      // 4. Map to unified Stay models
      const stays: Stay[] = (resData || []).map((raw: any) => {
        const client = raw.client || {};
        const chacara = raw.chacara || {};
        const linkedSession = sessionsByReservation.get(raw.id);
        const issuesCount = linkedSession ? (occurrencesMap.get(linkedSession.id) || 0) : 0;

        let checklistStatus: StayChecklistStatus = 'not_required';
        if (linkedSession) {
          if (linkedSession.status === 'completed') {
            checklistStatus = issuesCount > 0 ? 'with_issues' : 'completed';
          } else {
            checklistStatus = 'pending';
          }
        } else {
          // If checkout has already arrived or passed, inspection is pending!
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

        return {
          id: raw.id,
          code: raw.code || `RES-${raw.id.slice(0, 6).toUpperCase()}`,
          guest_name: guestName,
          guest_phone: client.phone || null,
          guest_email: client.email || null,
          guest_document: client.document_number || client.cpf_cnpj || null,
          chacara_name: chacara.name || 'Chácara Principal',
          checkin_date: raw.checkin_date,
          checkin_time: (raw.checkin_time || '14:00').slice(0, 5),
          checkout_date: raw.checkout_date,
          checkout_time: (raw.checkout_time || '12:00').slice(0, 5),
          guests_adults: adults,
          guests_children: children,
          guests_pets: pets,
          total_guests: adults + children,
          status: raw.status || 'CONFIRMADA',
          special_requests: raw.special_requests || null,
          notes: raw.checkout_notes || raw.checkin_notes || null,
          checklist_status: checklistStatus,
          checklist_session_id: linkedSession?.id || null,
          checklist_completed_at: linkedSession?.completed_at || null,
          checklist_issues_count: issuesCount,
          checklist_inspector_name: linkedSession?.inspector_name || null,
        };
      });

      // Save offline cache
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LS_CACHED_STAYS_KEY, JSON.stringify(stays));
        } catch {}
      }

      return stays;
    } catch (err) {
      console.error('Falha ao sincronizar estadias do Supabase:', err);
      return getCachedStaysFallback();
    }
  }

  return getCachedStaysFallback();
}

/**
 * Returns cached stays from localStorage or fallback demo list
 */
function getCachedStaysFallback(): Stay[] {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LS_CACHED_STAYS_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
  }
  return [];
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

  const res = await getOrCreateActiveChecklistSession(rooms, true, stayInfo);
  return res;
}
