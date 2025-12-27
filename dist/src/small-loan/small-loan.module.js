"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmallLoanModule = void 0;
const common_1 = require("@nestjs/common");
const small_loan_service_1 = require("./small-loan.service");
const small_loan_controller_1 = require("./small-loan.controller");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_module_1 = require("../journal/journal.module");
let SmallLoanModule = class SmallLoanModule {
};
exports.SmallLoanModule = SmallLoanModule;
exports.SmallLoanModule = SmallLoanModule = __decorate([
    (0, common_1.Module)({
        imports: [journal_module_1.JournalModule],
        controllers: [small_loan_controller_1.SmallLoanController],
        providers: [small_loan_service_1.SmallLoanService, prisma_service_1.PrismaService],
    })
], SmallLoanModule);
//# sourceMappingURL=small-loan.module.js.map