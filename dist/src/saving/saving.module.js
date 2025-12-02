"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SavingModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_service_1 = require("../journal/journal.service");
const saving_service_1 = require("./saving.service");
const saving_controller_1 = require("./saving.controller");
let SavingModule = class SavingModule {
};
exports.SavingModule = SavingModule;
exports.SavingModule = SavingModule = __decorate([
    (0, common_1.Module)({
        providers: [saving_service_1.SavingService, prisma_service_1.PrismaService, journal_service_1.JournalService],
        controllers: [saving_controller_1.SavingController],
    })
], SavingModule);
//# sourceMappingURL=saving.module.js.map