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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
    
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
