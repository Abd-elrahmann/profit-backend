import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';

@Module({
    controllers: [AuditLogController],
    providers: [AuditLogService, PrismaService],
})
export class AuditLogModule { }