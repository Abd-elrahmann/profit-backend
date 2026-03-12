import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthCacheService } from '../auth-cache.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private prisma: PrismaService,
    private authCache: AuthCacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = request?.cookies?.accessToken;
          if (!token) {
            return null;
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'defaultsecret',
    });
  }

  async validate(payload: any) {
    const userId = payload.sub;
    const cached = this.authCache.get(userId);

    if (cached) {
      if (!cached.isActive) {
        throw new UnauthorizedException('User logged out');
      }
      return { id: userId, email: payload.email };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User logged out');
    }

    this.authCache.set(userId, user.isActive);

    return { id: userId, email: payload.email };
  }
}