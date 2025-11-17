import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import * as path from 'path';
import { join } from 'path';
import { resolve } from 'path';

async function bootstrap() {

  console.log('Static uploads path:', join(__dirname, '..', 'uploads'));
  console.log('File absolute path:', path.join(process.cwd(), 'uploads/partners/30301090200415/3.png'));

  dotenv.config();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {});

  app.enableCors();


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