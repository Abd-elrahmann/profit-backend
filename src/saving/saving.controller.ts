import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { SavingService } from './saving.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('saving')
export class SavingController {
    constructor(private readonly savingService: SavingService) { }

    @Get('partner/:id')
    @Permissions('saving', 'canView')
    getPartnerSummary(@Param('id') id: number) {
        return this.savingService.getPartnerSavingSummary(id);
    }

    @Get('account-report')
    @Permissions('saving', 'canView')
    getAccountReport(@Query('month') month?: string) {
        return this.savingService.getSavingAccountReport(month);
    }

    @Get(':page')
    @Permissions('saving', 'canView')
    getAllPartners(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
        @Query('name') name?: string,
        @Query('nationalId') nationalId?: string,
        @Query('phone') phone?: string,
    ) {
        return this.savingService.getAllPartnerSavings(page, { limit, name, nationalId, phone });
    }
}