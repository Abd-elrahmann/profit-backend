import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesController } from './templates.controller';

@Module({
  providers: [TemplatesService, PrismaService],
  controllers: [TemplatesController],
  exports: [TemplatesService],
})
export class TemplatesModule {}
