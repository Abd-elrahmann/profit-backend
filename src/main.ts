const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Deprecation warning')) return;
  originalWarn(...args);
};

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cookieParser = require('cookie-parser');
import * as path from 'path';
import { resolve } from 'path';
import * as fs from 'fs';

function ensureDirExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

async function bootstrap() {

  dotenv.config();

  const uploadsPath = resolve('./uploads');

  ensureDirExists(uploadsPath);

  ensureDirExists(path.join(uploadsPath, 'partners'));
  ensureDirExists(path.join(uploadsPath, 'clients'));
  ensureDirExists(path.join(uploadsPath, 'profiles'));
  ensureDirExists(path.join(uploadsPath, 'temp'));
  ensureDirExists(path.join(uploadsPath, 'zakat'));
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {});

  // Enable CORS with credentials
  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3001',
        'http://72.61.101.53:3003',
        process.env.FRONT,
      ].filter(Boolean);

      // Remove trailing slashes
      const cleanOrigins = allowedOrigins.map((url) => 
        url && url.endsWith('/') ? url.slice(0, -1) : url
      );

      if (!origin || cleanOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language', 'page'],
  });

  // Enable cookie parser
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  app.useStaticAssets(path.join(__dirname, '..', 'public'), {
    prefix: '/api/public',
  });

  app.useStaticAssets(resolve('./uploads'), {
    prefix: '/uploads',
  });

  app.setGlobalPrefix('/api');

  const PORT = process.env.PORT || 3001;

  await app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
  });
}

bootstrap();