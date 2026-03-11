import { Module } from '@nestjs/common';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { ClientStatusService } from './client-status.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ClientController],
  providers: [ClientService, ClientStatusService, PrismaService],
  exports: [ClientStatusService],
})
export class ClientModule {}
