import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { PERMISSION_KEY } from '../decorators/permissions.decorator';

const CACHE_KEY_PREFIX = 'perm:';
const CACHE_TTL_SEC = 300; // 5 minutes

interface CachedUserPermissions {
  permissions: any[];
  timestamp: number;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  private permissionsCache = new Map<number, CachedUserPermissions>();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<{ module: string; action: string }>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('User not authenticated');

    let userPermissions = await this.getCachedPermissions(user.id);

    if (!userPermissions) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        include: {
          role: { include: { permissions: true } },
        },
      });

      if (!dbUser || !dbUser.role) throw new ForbiddenException('User has no role assigned');

      userPermissions = dbUser.role.permissions;
      await this.cachePermissions(user.id, userPermissions);
    }

    const match = userPermissions.find(
      (p) => p.module === requiredPermission.module && p[requiredPermission.action] === true,
    );

    if (!match) {
      throw new ForbiddenException(
        `You do not have permission to ${requiredPermission.action.replace('can', '').toLowerCase()} in ${requiredPermission.module}`,
      );
    }

    return true;
  }

  private async getCachedPermissions(userId: number): Promise<any[] | null> {
    if (this.cache.isAvailable()) {
      const cached = await this.cache.get<any[]>(`${CACHE_KEY_PREFIX}${userId}`);
      return cached;
    }

    const cached = this.permissionsCache.get(userId);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL) {
      this.permissionsCache.delete(userId);
      return null;
    }

    return cached.permissions;
  }

  private async cachePermissions(userId: number, permissions: any[]): Promise<void> {
    if (this.cache.isAvailable()) {
      await this.cache.set(`${CACHE_KEY_PREFIX}${userId}`, permissions, CACHE_TTL_SEC);
      return;
    }

    this.permissionsCache.set(userId, {
      permissions,
      timestamp: Date.now(),
    });
  }

  async clearCache(userId?: number): Promise<void> {
    if (this.cache.isAvailable()) {
      if (userId) {
        await this.cache.del(`${CACHE_KEY_PREFIX}${userId}`);
      } else {
        await this.cache.delPattern(`${CACHE_KEY_PREFIX}*`);
      }
      return;
    }

    if (userId) {
      this.permissionsCache.delete(userId);
    } else {
      this.permissionsCache.clear();
    }
  }
}