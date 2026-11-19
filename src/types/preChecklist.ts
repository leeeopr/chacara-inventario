import { InventoryItem, Room } from './inventory';

export interface PreChecklistAction {
  id: string;
  title: string;
  instruction: string;
  inventory_item_id: string | null;
  is_active: boolean;
  order_index: number;
  created_at?: string;
  updated_at?: string;
  // Associated inventory item details for rich rendering
  inventory_item?: InventoryItem | null;
  // Room association and derived helpers for room display
  room_id?: string | null;
  room_name?: string | null;
  room_name_snapshot?: string | null;
}

export interface CreatePreChecklistActionInput {
  title: string;
  instruction: string;
  inventory_item_id?: string | null;
  is_active?: boolean;
  order_index?: number;
}

export interface UpdatePreChecklistActionInput {
  title?: string;
  instruction?: string;
  inventory_item_id?: string | null;
  is_active?: boolean;
  order_index?: number;
}

export interface PreChecklistCompletion {
  id: string;
  checklist_session_id: string;
  pre_checklist_action_id: string;
  completed_at: string;
  completed_by?: string | null;
}
