import { Controller, Get, Param, Query } from '@nestjs/common';
import { ZakatService } from './zakat.service';
import { ZakatSchedulerService } from './zakat.scheduler';

@Controller('zakat')
export class ZakatController {
    constructor(
        private readonly zakatService: ZakatService,
        private readonly zakatScheduler: ZakatSchedulerService,
    ) { }

    @Get('partner/:partnerId')
    async summary(
        @Param('partnerId') partnerId: number,
        @Query('year') year: number,
    ) {
        return this.zakatService.getPartnerZakatSummary(+partnerId, +year);
    }

    @Get('year/:year')
    async summaryAll(@Param('year') year: number) {
        return this.zakatService.getYearlyAllPartners(+year);
    }

    // MANUAL TEST: Trigger monthly zakat job
    @Get('test/monthly')
    async testMonthly() {
        await this.zakatScheduler.runMonthlyZakat();
        return { message: 'Monthly zakat job executed successfully' };
    }

    // MANUAL TEST: Trigger year-end zakat reconciliation
    @Get('test/year-end')
    async testYearEnd() {
        await this.zakatScheduler.runYearEndZakatSettlement();
        return { message: 'Year-end zakat job executed successfully' };
    }
}