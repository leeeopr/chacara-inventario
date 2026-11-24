// ============================================================================
// Types for Stays / Reservations from the Chácara Management System
// Integrates stay calendar with room & inventory checklists
// ============================================================================

export type StayChecklistStatus = 'pending' | 'completed' | 'with_issues' | 'not_required';

export type StaySystemStatus =
  | 'PRE_RESERVA'
  | 'CONFIRMADA'
  | 'CHECKIN_REALIZADO'
  | 'CHECKOUT_REALIZADO'
  | 'FINALIZADA'
  | 'CANCELADA';

export interface Stay {
  id: string;
  code: string; // Ex: "RES-847291"
  guest_name: string;
  guest_phone?: string | null;
  guest_email?: string | null;
  guest_document?: string | null;
  chacara_name?: string | null;
  checkin_date: string; // YYYY-MM-DD
  checkin_time: string; // HH:mm
  checkout_date: string; // YYYY-MM-DD
  checkout_time: string; // HH:mm
  guests_adults: number;
  guests_children: number;
  guests_pets: number;
  total_guests: number;
  status: StaySystemStatus;
  special_requests?: string | null;
  notes?: string | null;
  checklist_status: StayChecklistStatus;
  checklist_session_id?: string | null;
  checklist_completed_at?: string | null;
  checklist_issues_count?: number;
  checklist_inspector_name?: string | null;
}

export interface StayFilters {
  search?: string;
  checklistStatus?: 'all' | StayChecklistStatus;
  dateMonth?: string; // YYYY-MM
  status?: 'all' | StaySystemStatus;
}
