import type { User } from '../models';

/**
 * The name other people see for a member: their chosen nickname, otherwise a
 * neutral label from their opaque id. Never the Google full name or email.
 * Mirrors PublicNames.of on the backend.
 */
export function publicName(user: Pick<User, 'nickname' | 'uuid'>): string {
  if (user.nickname && user.nickname.trim()) return user.nickname;
  const id = (user.uuid ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return id ? `Learner-${id.slice(0, 5)}` : 'Learner';
}
