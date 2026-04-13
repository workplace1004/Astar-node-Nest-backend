export type UserRole = 'admin' | 'client';
export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  birthDate?: string;
  birthPlace?: string;
  birthTime?: string;
  birthLat?: number;
  birthLon?: number;
  birthTimezone?: string;
  avatarUrl?: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  subscriptionStatus: SubscriptionStatus;
  avatarUrl?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLon?: number | null;
  birthTimezone?: string | null;
}
