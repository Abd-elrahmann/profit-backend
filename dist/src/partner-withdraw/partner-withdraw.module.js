"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartnerWithdrawModule = void 0;
const common_1 = require("@nestjs/common");
const partner_withdraw_service_1 = require("./partner-withdraw.service");
const partner_withdraw_controller_1 = require("./partner-withdraw.controller");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_module_1 = require("../journal/journal.module");
let PartnerWithdrawModule = class PartnerWithdrawModule {
};
exports.PartnerWithdrawModule = PartnerWithdrawModule;
exports.PartnerWithdrawModule = PartnerWithdrawModule = __decorate([
    (0, common_1.Module)({
        imports: [journal_module_1.JournalModule],
        controllers: [partner_withdraw_controller_1.PartnerWithdrawController],
        providers: [partner_withdraw_service_1.PartnerWithdrawService, prisma_service_1.PrismaService],
    })
], PartnerWithdrawModule);
//# sourceMappingURL=partner-withdraw.module.js.map