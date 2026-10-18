import type { User } from '../../database/schema/index.js';

export function toUserResponse(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}
