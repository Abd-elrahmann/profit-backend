import { Injectable } from '@nestjs/common';

const USER_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

@Injectable()
export class AuthCacheService {
  private readonly userCache = new Map<number, { isActive: boolean; expiresAt: number }>();

  get(userId: number): { isActive: boolean } | null {
    const cached = this.userCache.get(userId);
    if (!cached || cached.expiresAt <= Date.now()) return null;
    return { isActive: cached.isActive };
  }

  set(userId: number, isActive: boolean): void {
    this.userCache.set(userId, {
      isActive,
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
    });
  }

  invalidate(userId: number): void {
    this.userCache.delete(userId);
  }
}
