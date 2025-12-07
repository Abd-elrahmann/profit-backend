"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const roles_module_1 = require("./roles/roles.module");
const client_module_1 = require("./client/client.module");
const accounts_module_1 = require("./accounts/accounts.module");
const templates_module_1 = require("./templates/templates.module");
const partner_module_1 = require("./partner/partner.module");
const journal_module_1 = require("./journal/journal.module");
const loans_module_1 = require("./loans/loans.module");
const bank_module_1 = require("./bankAccounts/bank.module");
const repayment_module_1 = require("./repayments/repayment.module");
const notification_module_1 = require("./notification/notification.module");
const schedule_1 = require("@nestjs/schedule");
const audit_log_module_1 = require("./logs/audit-log.module");
const period_module_1 = require("./period/period.module");
const distribution_module_1 = require("./distribution/distribution.module");
const zakat_module_1 = require("./zakat/zakat.module");
const saving_module_1 = require("./saving/saving.module");
const client_report_module_1 = require("./client-report/client-report.module");
const dashboard_module_1 = require("./dashboard/dashboard.module");
const partners_report_module_1 = require("./partners-report/partners-report.module");
const company_module_1 = require("./companyProfit/company.module");
const expense_module_1 = require("./expenses/expense.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            roles_module_1.RolesModule,
            client_module_1.ClientModule,
            accounts_module_1.AccountsModule,
            templates_module_1.TemplatesModule,
            partner_module_1.PartnerModule,
            journal_module_1.JournalModule,
            loans_module_1.LoansModule,
            bank_module_1.BankModule,
            repayment_module_1.RepaymentModule,
            notification_module_1.NotificationModule,
            audit_log_module_1.AuditLogModule,
            period_module_1.PeriodModule,
            distribution_module_1.DistributionModule,
            zakat_module_1.ZakatModule,
            saving_module_1.SavingModule,
            client_report_module_1.ClientReportModule,
            dashboard_module_1.DashboardModule,
            partners_report_module_1.PartnersReportModule,
            company_module_1.CompanyModule,
            expense_module_1.ExpenseModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map