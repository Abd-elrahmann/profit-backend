"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeriodModule = void 0;
const common_1 = require("@nestjs/common");
const period_service_1 = require("./period.service");
const period_controller_1 = require("./period.controller");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_service_1 = require("../journal/journal.service");
let PeriodModule = class PeriodModule {
};
exports.PeriodModule = PeriodModule;
exports.PeriodModule = PeriodModule = __decorate([
    (0, common_1.Module)({
        controllers: [period_controller_1.PeriodController],
        providers: [period_service_1.PeriodService, prisma_service_1.PrismaService, journal_service_1.JournalService],
    })
], PeriodModule);
//# sourceMappingURL=period.module.js.map