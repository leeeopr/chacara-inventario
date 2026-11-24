// ============================================================================
// Authentication & Staff Role Types
// ============================================================================

export type UserRole = 'admin' | 'faxineira' | 'piscineiro';

export interface AppUserProfile {
  id: string;
  user_id?: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}
