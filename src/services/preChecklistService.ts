import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { InventoryItem } from '../types/inventory';
import {
  CreatePreChecklistActionInput,
  PreChecklistAction,
  PreChecklistCompletion,
  UpdatePreChecklistActionInput,
} from '../types/preChecklist';

const LS_PRE_CHECKLIST_ACTIONS_KEY = 'chacara_pre_checklist_actions_v1';
const LS_PRE_CHECKLIST_COMPLETIONS_KEY = 'chacara_pre_checklist_completions_v1';

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
    // Ignore quota errors
  }
}

/**
 * Hydrates pre-checklist actions with full inventory_item data and room name snapshot
 */
function hydrateActions(
  actions: PreChecklistAction[],
  items?: InventoryItem[]
): PreChecklistAction[] {
  if (!items || items.length === 0) return actions;
  const itemMap = new Map(items.map((it) => [it.id, it]));

  return actions.map((act) => {
    const item = act.inventory_item_id ? itemMap.get(act.inventory_item_id) || null : null;
    let roomName: string | null = null;
    if (item) {
      roomName = item.room?.name || item.assigned_room_name || null;
      if (!roomName && item.room_assignments && item.room_assignments.length > 0) {
        roomName = item.room_assignments[0].room?.name || null;
      }
    }
    return {
      ...act,
      inventory_item: item,
      room_name_snapshot: roomName,
    };
  });
}

// ============================================================================
// CONFIGURATION CRUD
// ============================================================================

export async function fetchPreChecklistActions(
  inventoryItems?: InventoryItem[]
): Promise<PreChecklistAction[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pre_checklist_actions')
        .select('*')
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true });

      if (!error && data) {
        const actions = data as PreChecklistAction[];
        setLocalJson(LS_PRE_CHECKLIST_ACTIONS_KEY, actions);
        return hydrateActions(actions, inventoryItems);
      }
    } catch {
      // Fall through to local fallback
    }
  }

  const local = getLocalJson<PreChecklistAction[]>(LS_PRE_CHECKLIST_ACTIONS_KEY, []);
  local.sort((a, b) => (a.order_index ?? 1) - (b.order_index ?? 1));
  return hydrateActions(local, inventoryItems);
}

export async function createPreChecklistAction(
  input: CreatePreChecklistActionInput,
  inventoryItems?: InventoryItem[]
): Promise<PreChecklistAction> {
  const currentActions = getLocalJson<PreChecklistAction[]>(LS_PRE_CHECKLIST_ACTIONS_KEY, []);
  const nextOrder = input.order_index ?? (currentActions.length > 0 ? Math.max(...currentActions.map((a) => a.order_index || 0)) + 1 : 1);

  const newAction: PreChecklistAction = {
    id: `pre-act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: input.title.trim(),
    instruction: input.instruction.trim(),
    inventory_item_id: input.inventory_item_id || null,
    is_active: input.is_active ?? true,
    order_index: nextOrder,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pre_checklist_actions')
        .insert({
          title: newAction.title,
          instruction: newAction.instruction,
          inventory_item_id: newAction.inventory_item_id,
          is_active: newAction.is_active,
          order_index: newAction.order_index,
        })
        .select('*')
        .single();

      if (!error && data) {
        const saved = data as PreChecklistAction;
        const updatedLocal = [...currentActions, saved];
        setLocalJson(LS_PRE_CHECKLIST_ACTIONS_KEY, updatedLocal);
        return hydrateActions([saved], inventoryItems)[0];
      }
    } catch {
      // Fall through to local fallback
    }
  }

  const updatedLocal = [...currentActions, newAction];
  setLocalJson(LS_PRE_CHECKLIST_ACTIONS_KEY, updatedLocal);
  return hydrateActions([newAction], inventoryItems)[0];
}

export async function updatePreChecklistAction(
  id: string,
  input: UpdatePreChecklistActionInput,
  inventoryItems?: InventoryItem[]
): Promise<PreChecklistAction> {
  const currentActions = getLocalJson<PreChecklistAction[]>(LS_PRE_CHECKLIST_ACTIONS_KEY, []);
  const existingIdx = currentActions.findIndex((a) => a.id === id);

  const updatedPayload = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.instruction !== undefined ? { instruction: input.instruction.trim() } : {}),
    ...(input.inventory_item_id !== undefined ? { inventory_item_id: input.inventory_item_id } : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    ...(input.order_index !== undefined ? { order_index: input.order_index } : {}),
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pre_checklist_actions')
        .update(updatedPayload)
        .eq('id', id)
        .select('*')
        .single();

      if (!error && data) {
        const saved = data as PreChecklistAction;
        if (existingIdx >= 0) currentActions[existingIdx] = saved;
        setLocalJson(LS_PRE_CHECKLIST_ACTIONS_KEY, currentActions);
        return hydrateActions([saved], inventoryItems)[0];
      }
    } catch {
      // Fall through to local
    }
  }

  let result = currentActions[existingIdx];
  if (existingIdx >= 0) {
    result = { ...currentActions[existingIdx], ...updatedPayload };
    currentActions[existingIdx] = result;
    setLocalJson(LS_PRE_CHECKLIST_ACTIONS_KEY, currentActions);
  }
  return hydrateActions([result], inventoryItems)[0];
}

export async function deletePreChecklistAction(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from('pre_checklist_actions').delete().eq('id', id);
    } catch {
      // Ignore
    }
  }

  const current = getLocalJson<PreChecklistAction[]>(LS_PRE_CHECKLIST_ACTIONS_KEY, []);
  const filtered = current.filter((a) => a.id !== id);
  setLocalJson(LS_PRE_CHECKLIST_ACTIONS_KEY, filtered);
}

export async function reorderPreChecklistActions(orderedIds: string[]): Promise<void> {
  const current = getLocalJson<PreChecklistAction[]>(LS_PRE_CHECKLIST_ACTIONS_KEY, []);
  const idToOrder = new Map(orderedIds.map((id, idx) => [id, idx + 1]));

  const updated = current.map((act) => ({
    ...act,
    order_index: idToOrder.get(act.id) ?? act.order_index,
  }));
  updated.sort((a, b) => (a.order_index ?? 1) - (b.order_index ?? 1));
  setLocalJson(LS_PRE_CHECKLIST_ACTIONS_KEY, updated);

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      for (let i = 0; i < orderedIds.length; i++) {
        await supabase
          .from('pre_checklist_actions')
          .update({ order_index: i + 1 })
          .eq('id', orderedIds[i]);
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Creates default suggested preparation actions (Freezer, Bebedouro, Geladeira)
 * automatically linking to existing inventory items if found!
 */
export async function seedSuggestedPreChecklistActions(
  inventoryItems: InventoryItem[]
): Promise<PreChecklistAction[]> {
  const findItemByKeywords = (keywords: string[]) => {
    return inventoryItems.find((it) => {
      const name = it.name.toLowerCase();
      return keywords.some((kw) => name.includes(kw));
    });
  };

  const freezerItem = findItemByKeywords(['freezer']);
  const bebedouroItem = findItemByKeywords(['bebedouro', 'purificador', 'filtro de água', 'filtro']);
  const geladeiraItem = findItemByKeywords(['geladeira', 'refrigerador']);

  const suggestions: CreatePreChecklistActionInput[] = [
    {
      title: 'Ligar o freezer',
      instruction:
        'Ligue o freezer para que ele tenha tempo de começar a gelar antes da inspeção.',
      inventory_item_id: freezerItem ? freezerItem.id : null,
      order_index: 1,
      is_active: true,
    },
    {
      title: 'Ligar o bebedouro',
      instruction:
        'Ligue o bebedouro e verifique se está conectado à energia e com água.',
      inventory_item_id: bebedouroItem ? bebedouroItem.id : null,
      order_index: 2,
      is_active: true,
    },
    {
      title: 'Ligar a geladeira',
      instruction:
        'Ligue a geladeira antes de iniciar a conferência para avaliar o resfriamento.',
      inventory_item_id: geladeiraItem ? geladeiraItem.id : null,
      order_index: 3,
      is_active: true,
    },
  ];

  const created: PreChecklistAction[] = [];
  for (const s of suggestions) {
    const act = await createPreChecklistAction(s, inventoryItems);
    created.push(act);
  }

  return created;
}

// ============================================================================
// EXECUTION STATE & COMPLETIONS (PER CHECKLIST SESSION)
// ============================================================================

export async function fetchPreChecklistCompletions(
  sessionId: string
): Promise<Set<string>> {
  if (!sessionId) return new Set();

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('checklist_pre_action_completions')
        .select('*')
        .eq('checklist_session_id', sessionId);

      if (!error && data) {
        const completions = data as PreChecklistCompletion[];
        const set = new Set(completions.map((c) => c.pre_checklist_action_id));

        // Update local backup
        const allLocal = getLocalJson<PreChecklistCompletion[]>(LS_PRE_CHECKLIST_COMPLETIONS_KEY, []);
        const filtered = allLocal.filter((c) => c.checklist_session_id !== sessionId);
        setLocalJson(LS_PRE_CHECKLIST_COMPLETIONS_KEY, [...filtered, ...completions]);

        return set;
      }
    } catch {
      // Fall through to local
    }
  }

  const allLocal = getLocalJson<PreChecklistCompletion[]>(LS_PRE_CHECKLIST_COMPLETIONS_KEY, []);
  const sessionCompletions = allLocal.filter((c) => c.checklist_session_id === sessionId);
  return new Set(sessionCompletions.map((c) => c.pre_checklist_action_id));
}

export async function togglePreChecklistCompletion(
  sessionId: string,
  actionId: string,
  isCompleted: boolean
): Promise<void> {
  if (!sessionId || !actionId) return;

  const allLocal = getLocalJson<PreChecklistCompletion[]>(LS_PRE_CHECKLIST_COMPLETIONS_KEY, []);

  if (isCompleted) {
    const newCompletion: PreChecklistCompletion = {
      id: `comp-${sessionId}-${actionId}`,
      checklist_session_id: sessionId,
      pre_checklist_action_id: actionId,
      completed_at: new Date().toISOString(),
      completed_by: 'Responsável',
    };

    const exists = allLocal.some(
      (c) => c.checklist_session_id === sessionId && c.pre_checklist_action_id === actionId
    );
    if (!exists) {
      setLocalJson(LS_PRE_CHECKLIST_COMPLETIONS_KEY, [...allLocal, newCompletion]);
    }

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseClient();
        await supabase
          .from('checklist_pre_action_completions')
          .upsert(
            {
              checklist_session_id: sessionId,
              pre_checklist_action_id: actionId,
              completed_at: newCompletion.completed_at,
              completed_by: newCompletion.completed_by,
            },
            { onConflict: 'checklist_session_id,pre_checklist_action_id' }
          );
      } catch {
        // Fallback OK
      }
    }
  } else {
    // Unmark
    const filtered = allLocal.filter(
      (c) => !(c.checklist_session_id === sessionId && c.pre_checklist_action_id === actionId)
    );
    setLocalJson(LS_PRE_CHECKLIST_COMPLETIONS_KEY, filtered);

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseClient();
        await supabase
          .from('checklist_pre_action_completions')
          .delete()
          .eq('checklist_session_id', sessionId)
          .eq('pre_checklist_action_id', actionId);
      } catch {
        // Fallback OK
      }
    }
  }
}
