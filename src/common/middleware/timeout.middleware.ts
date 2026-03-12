import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

@Injectable()
export class TimeoutMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const timeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ message: 'Request timeout' });
      }
    }, timeout);

    res.on('finish', () => clearTimeout(timer));
    next();
  }
}
