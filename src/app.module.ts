import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { ClientModule } from './client/client.module';
import { AccountsModule } from './accounts/accounts.module';
import { TemplatesModule } from './templates/templates.module';
import { PartnerModule } from './partner/partner.module';
import { JournalModule } from './journal/journal.module';
import { LoansModule } from './loans/loans.module';
import { BankModule } from './bankAccounts/bank.module';
import { RepaymentModule } from './repayments/repayment.module';
import { NotificationModule } from './notification/notification.module';
import { ScheduleModule } from '@nestjs/schedule';
import { audit } from 'rxjs';
import { AuditLogModule } from './logs/audit-log.module';
import { PeriodModule } from './period/period.module';
import { DistributionModule } from './distribution/distribution.module';
import { ZakatModule } from './zakat/zakat.module';
import { SavingModule } from './saving/saving.module';
import { ClientReportModule } from './client-report/client-report.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PartnersReportModule } from './partners-report/partners-report.module';
import { CompanyModule } from './companyProfit/company.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    ClientModule,
    AccountsModule,
    TemplatesModule,
    PartnerModule,
    JournalModule,
    LoansModule,
    BankModule,
    RepaymentModule,
    NotificationModule,
    AuditLogModule,
    PeriodModule,
    DistributionModule,
    ZakatModule,
    SavingModule,
    ClientReportModule,
    DashboardModule,
    PartnersReportModule,
    CompanyModule,
    
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
