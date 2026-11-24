import { InspectionType, InventoryType, Room } from './inventory';

export type ChecklistSessionStatus = 'in_progress' | 'completed' | 'canceled';
export type ChecklistRoomStatus = 'pending' | 'in_progress' | 'completed';
export type ChecklistItemStatus = 'found' | 'missing' | 'damaged';
export type ChecklistOccurrenceType = 'missing' | 'damaged';

export interface ChecklistSession {
  id: string;
  status: ChecklistSessionStatus;
  started_at: string;
  completed_at: string | null;
  inspector_name: string | null;
  notes: string | null;
  created_at: string;
  reservation_id?: string | null;
  reservation_code?: string | null;
  guest_name_snapshot?: string | null;
  stay_period_snapshot?: string | null;
}

export interface ChecklistRoomProgress {
  id: string;
  checklist_session_id: string;
  room_id: string | null;
  room_name_snapshot?: string | null;
  inspection_order?: number | null;
  status: ChecklistRoomStatus;
  completed_at: string | null;
  created_at: string;
  room?: Room | null;
}

export interface ChecklistItemResult {
  id: string;
  checklist_session_id: string;
  room_id: string | null;
  room_name_snapshot?: string | null;
  inventory_item_id: string;
  item_name_snapshot: string;
  identification_code_snapshot: string | null;
  inventory_type: InventoryType;
  expected_quantity: number;
  found_quantity: number;
  status: ChecklistItemStatus;
  inspection_type_snapshot?: InspectionType | null;
  inspection_answers?: Record<string, boolean> | null;
  notes: string | null;
  inspected_at: string;
}

export interface ChecklistOccurrence {
  id: string;
  checklist_session_id: string;
  inventory_item_id: string | null;
  room_id: string | null;
  room_name_snapshot?: string | null;
  occurrence_type: ChecklistOccurrenceType;
  missing_quantity: number;
  description: string | null;
  inspection_type_snapshot?: InspectionType | null;
  failed_question?: string | null;
  created_at: string;
  room?: Room | null;
  item_name?: string | null;
}

export interface ChecklistSessionSummary {
  session: ChecklistSession;
  totalRooms: number;
  completedRooms: number;
  totalItems: number;
  inspectedItems: number;
  foundItems: number;
  missingItemsCount: number;
  damagedItemsCount: number;
  occurrences: ChecklistOccurrence[];
}

export interface SessionWithDetails {
  session: ChecklistSession;
  roomProgressList: ChecklistRoomProgress[];
  itemResults: ChecklistItemResult[];
  occurrences: ChecklistOccurrence[];
}
