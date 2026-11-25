// ============================================================================
// Personal Services Service - Staff Day-to-Day Agenda Management
// Handles private non-chácara appointments, schedules, and clients for staff.
// ============================================================================

import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { PersonalService, PersonalServiceStatus } from '../types/personalService';

function getStorageKey(userEmail: string): string {
  const cleanEmail = (userEmail || 'default').toLowerCase().trim();
  return `chacara_staff_services_v1_${cleanEmail}`;
}

export function getLocalServices(userEmail: string): PersonalService[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(userEmail));
    if (raw) {
      return JSON.parse(raw) as PersonalService[];
    }
  } catch {}
  return [];
}

export function saveLocalServices(userEmail: string, services: PersonalService[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(userEmail), JSON.stringify(services));
  } catch {}
}

export function formatTimeShort(timeStr?: string | null): string {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

export function formatCurrencyBRL(val?: number | null): string {
  if (val === null || val === undefined || isNaN(val)) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export function getWhatsAppLink(phone?: string | null, clientName?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 10) return null;
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  const text = encodeURIComponent(
    `Olá${clientName ? ` ${clientName}` : ''}! Confirmando nosso serviço agendado.`
  );
  return `https://wa.me/${full}?text=${text}`;
}

export function getGoogleMapsLink(address?: string | null): string | null {
  if (!address || !address.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

export function getPhoneCallLink(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `tel:${digits}`;
}

/**
 * Fetch personal services for a specific staff email.
 * Merges Supabase remote data with local storage backup.
 */
export async function fetchPersonalServices(userEmail: string): Promise<PersonalService[]> {
  const localList = getLocalServices(userEmail);

  if (!isSupabaseConfigured() || !userEmail) {
    return localList;
  }

  try {
    const supabase = getSupabaseClient();
    const cleanEmail = userEmail.toLowerCase().trim();

    const { data, error } = await supabase
      .from('staff_personal_services')
      .select('*')
      .eq('user_email', cleanEmail)
      .order('service_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.warn('Erro ao carregar serviços pessoais do Supabase:', error.message);
      return localList;
    }

    const fetched: PersonalService[] = (data || []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      user_email: row.user_email,
      staff_role: row.staff_role,
      title: row.title,
      client_name: row.client_name,
      client_phone: row.client_phone,
      address: row.address,
      service_date: row.service_date,
      start_time: row.start_time ? String(row.start_time).slice(0, 5) : '08:00',
      end_time: row.end_time ? String(row.end_time).slice(0, 5) : '12:00',
      category: row.category || 'geral',
      color: row.color,
      price: row.price !== null ? Number(row.price) : null,
      status: row.status || 'scheduled',
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    saveLocalServices(cleanEmail, fetched);
    return fetched;
  } catch (err) {
    console.warn('Exceção ao buscar serviços pessoais:', err);
    return localList;
  }
}

/**
 * Create a new personal service in Supabase and local cache.
 */
export async function createPersonalService(
  service: Omit<PersonalService, 'id' | 'created_at' | 'updated_at'>
): Promise<PersonalService> {
  const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `srv-${Date.now()}`;
  const nowIso = new Date().toISOString();

  const newService: PersonalService = {
    ...service,
    id: tempId,
    created_at: nowIso,
    updated_at: nowIso,
  };

  // 1. Save locally first (instant UI responsiveness)
  const localList = getLocalServices(service.user_email);
  localList.push(newService);
  saveLocalServices(service.user_email, localList);

  if (!isSupabaseConfigured()) {
    return newService;
  }

  // 2. Persist to Supabase
  try {
    const supabase = getSupabaseClient();
    const payload = {
      user_email: service.user_email.toLowerCase().trim(),
      staff_role: service.staff_role,
      title: service.title.trim(),
      client_name: service.client_name?.trim() || null,
      client_phone: service.client_phone?.trim() || null,
      address: service.address?.trim() || null,
      service_date: service.service_date,
      start_time: service.start_time ? `${service.start_time}:00`.slice(0, 8) : '08:00:00',
      end_time: service.end_time ? `${service.end_time}:00`.slice(0, 8) : '12:00:00',
      category: service.category,
      color: service.color || null,
      price: service.price !== undefined && service.price !== null ? Number(service.price) : null,
      status: service.status || 'scheduled',
      notes: service.notes?.trim() || null,
    };

    const { data, error } = await supabase
      .from('staff_personal_services')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.warn('Erro ao inserir serviço no Supabase:', error.message);
      return newService;
    }

    if (data) {
      const persisted: PersonalService = {
        ...newService,
        id: data.id,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      // Replace tempId with DB id in local storage
      const updatedList = localList.map((s) => (s.id === tempId ? persisted : s));
      saveLocalServices(service.user_email, updatedList);
      return persisted;
    }
  } catch (err) {
    console.warn('Exceção ao persistir serviço pessoal:', err);
  }

  return newService;
}

/**
 * Update an existing personal service.
 */
export async function updatePersonalService(
  id: string,
  patch: Partial<PersonalService>,
  userEmail: string
): Promise<PersonalService> {
  const localList = getLocalServices(userEmail);
  const nowIso = new Date().toISOString();

  let target = localList.find((s) => s.id === id);
  if (target) {
    target = { ...target, ...patch, updated_at: nowIso };
    const updatedList = localList.map((s) => (s.id === id ? target! : s));
    saveLocalServices(userEmail, updatedList);
  }

  if (!isSupabaseConfigured()) {
    if (!target) throw new Error('Serviço não encontrado');
    return target;
  }

  try {
    const supabase = getSupabaseClient();
    const dbPayload: Record<string, any> = {
      updated_at: nowIso,
    };

    if (patch.title !== undefined) dbPayload.title = patch.title;
    if (patch.client_name !== undefined) dbPayload.client_name = patch.client_name;
    if (patch.client_phone !== undefined) dbPayload.client_phone = patch.client_phone;
    if (patch.address !== undefined) dbPayload.address = patch.address;
    if (patch.service_date !== undefined) dbPayload.service_date = patch.service_date;
    if (patch.start_time !== undefined) {
      dbPayload.start_time = patch.start_time ? `${patch.start_time}:00`.slice(0, 8) : null;
    }
    if (patch.end_time !== undefined) {
      dbPayload.end_time = patch.end_time ? `${patch.end_time}:00`.slice(0, 8) : null;
    }
    if (patch.category !== undefined) dbPayload.category = patch.category;
    if (patch.color !== undefined) dbPayload.color = patch.color;
    if (patch.price !== undefined) dbPayload.price = patch.price;
    if (patch.status !== undefined) dbPayload.status = patch.status;
    if (patch.notes !== undefined) dbPayload.notes = patch.notes;

    const { data, error } = await supabase
      .from('staff_personal_services')
      .update(dbPayload)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.warn('Erro ao atualizar serviço no Supabase:', error.message);
    } else if (data) {
      target = {
        ...target!,
        ...patch,
        updated_at: data.updated_at,
      };
    }
  } catch (err) {
    console.warn('Exceção ao atualizar serviço:', err);
  }

  return target!;
}

/**
 * Delete a personal service.
 */
export async function deletePersonalService(id: string, userEmail: string): Promise<void> {
  const localList = getLocalServices(userEmail);
  const filtered = localList.filter((s) => s.id !== id);
  saveLocalServices(userEmail, filtered);

  if (!isSupabaseConfigured()) return;

  try {
    const supabase = getSupabaseClient();
    await supabase.from('staff_personal_services').delete().eq('id', id);
  } catch (err) {
    console.warn('Erro ao excluir serviço no Supabase:', err);
  }
}

/**
 * Toggle service between completed and scheduled.
 */
export async function togglePersonalServiceStatus(
  id: string,
  currentStatus: PersonalServiceStatus,
  userEmail: string
): Promise<PersonalServiceStatus> {
  const nextStatus: PersonalServiceStatus = currentStatus === 'completed' ? 'scheduled' : 'completed';
  await updatePersonalService(id, { status: nextStatus }, userEmail);
  return nextStatus;
}
