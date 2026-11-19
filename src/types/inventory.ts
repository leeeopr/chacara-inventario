export type InventoryType = 'individual' | 'quantity';

export type RoomType = 'individual' | 'suite_bedroom' | 'suite_bathroom';

export interface RoomCategory {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateRoomCategoryInput {
  name: string;
  color?: string;
  icon?: string | null;
  display_order?: number;
}

export interface UpdateRoomCategoryInput {
  name?: string;
  color?: string;
  icon?: string | null;
  display_order?: number;
}

export type FloorPlanShapeType = 'rectangle' | 'square' | 'l_shape' | 't_shape' | 'polygon';

export interface FloorPlanPoint {
  x: number;
  y: number;
}

export interface FloorPlanShape {
  id: string;
  room_id: string | null;
  shape_type: FloorPlanShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: FloorPlanPoint[] | null;
  parent_room_id?: string | null;
  color?: string | null;
  label_custom?: string | null;
  z_index?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Suite {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  rooms?: Room[];
}

export type RoomChecklistMode = 'standard' | 'quick';

export interface Room {
  id: string;
  name: string;
  suite_id?: string | null;
  room_type?: RoomType;
  created_at: string;
  suite?: Suite | null;
  inspection_order?: number;
  room_category_id?: string | null;
  room_category?: RoomCategory | null;
  floor_plan_shape?: FloorPlanShape | null;
  checklist_mode?: RoomChecklistMode;
}

export interface CreateSuiteInput {
  suiteName: string;
  bedroomName: string;
  bathroomName: string;
}

export interface UpdateSuiteInput {
  suiteName?: string;
  bedroomName?: string;
  bathroomName?: string;
}

export type ConditionStatus = 'good' | 'attention' | 'concerning' | 'replacement_required';

export interface InventoryRoomAssignment {
  id: string;
  inventory_item_id: string;
  room_id: string;
  quantity: number;
  condition_status: ConditionStatus;
  condition_notes: string | null;
  created_at: string;
  updated_at: string;
  room?: Room | null;
}

export interface UpsertRoomAssignmentInput {
  id?: string;
  inventory_item_id?: string;
  room_id: string;
  quantity: number;
  condition_status: ConditionStatus;
  condition_notes?: string | null;
}

export interface InventoryCategory {
  id: string;
  name: string;
  created_at: string;
}

export type InspectionType = 'functionality' | 'conservation' | 'physical_integrity';

export interface InventoryItem {
  id: string;
  name: string;
  identification_code: string | null;
  room_id?: string | null;
  category_id: string | null;
  inventory_type: InventoryType;
  expected_quantity: number;
  image_path: string | null;
  description: string | null;
  inspection_type?: InspectionType;
  created_at: string;
  updated_at: string;
  // Joined relations and multi-room distribution
  room?: Room | null;
  category?: InventoryCategory | null;
  room_assignments?: InventoryRoomAssignment[];
  total_quantity?: number;
  // Room context when inspected in a specific room
  assigned_room_id?: string;
  assigned_room_name?: string;
  assigned_quantity?: number;
  condition_status?: ConditionStatus;
  condition_notes?: string | null;
}

export interface CreateInventoryItemInput {
  name: string;
  identification_code?: string | null;
  room_id?: string | null;
  category_id?: string | null;
  inventory_type: InventoryType;
  expected_quantity?: number;
  image_path?: string | null;
  description?: string | null;
  inspection_type?: InspectionType;
  initial_assignments?: UpsertRoomAssignmentInput[];
}

export interface UpdateInventoryItemInput {
  name?: string;
  identification_code?: string | null;
  room_id?: string | null;
  category_id?: string | null;
  inventory_type?: InventoryType;
  expected_quantity?: number;
  image_path?: string | null;
  description?: string | null;
  inspection_type?: InspectionType;
  assignments?: UpsertRoomAssignmentInput[];
}

export interface InventoryFilters {
  search: string;
  roomId: string; // 'all' or UUID
  categoryId: string; // 'all' | 'uncategorized' | UUID
  inventoryType: 'all' | InventoryType;
  sortBy: 'newest' | 'name_asc' | 'code_asc' | 'room_asc' | 'quantity_desc';
}

export interface CodePrefixRule {
  id: string;
  prefix: string;
  label: string;
  digits: number;
  keywords: string[];
}
