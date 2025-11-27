import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalModule } from '../journal/journal.module';

@Module({
    imports: [JournalModule],
    providers: [CompanyService, PrismaService],
    controllers: [CompanyController],
})
export class CompanyModule { }
