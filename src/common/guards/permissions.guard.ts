import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<{ module: string; action: string }>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!requiredPermission) return true; // no permission required

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('User not authenticated');

    // Get user role and permissions
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        role: { include: { permissions: true } },
      },
    });

    if (!dbUser || !dbUser.role) throw new ForbiddenException('User has no role assigned');

    const match = dbUser.role.permissions.find(
      (p) => p.module === requiredPermission.module && p[requiredPermission.action] === true,
    );

    if (!match) {
      throw new ForbiddenException(
        `You do not have permission to ${requiredPermission.action.replace('can', '').toLowerCase()} in ${requiredPermission.module}`,
      );
    }

    return true;
  }
}