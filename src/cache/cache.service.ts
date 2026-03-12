import { Injectable, OnModuleDestroy, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const DEFAULT_TTL_SEC = 300; // 5 minutes

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly enabled: boolean;

  constructor(private config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    this.enabled = !!url && url.length > 0;
    if (this.enabled) {
      try {
        this.redis = new Redis(url!, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 3000)),
          lazyConnect: true,
        });
        this.redis.on('error', (err) => this.logger.warn('Redis error:', err.message));
      } catch {
        this.logger.warn('Redis init failed, using in-memory fallback');
        this.redis = null;
      }
    }
  }

  async onModuleInit() {
    if (this.redis) {
      try {
        await this.redis.connect();
      } catch {
        this.redis = null;
      }
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  isAvailable(): boolean {
    return this.redis !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const val = await this.redis.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSec = DEFAULT_TTL_SEC): Promise<void> {
    if (!this.redis) return;
    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttlSec, serialized);
    } catch {
      // ignore
    }
  }

  async del(key: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch {
      // ignore
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.redis) return;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) await this.redis.del(...keys);
    } catch {
      // ignore
    }
  }
}
