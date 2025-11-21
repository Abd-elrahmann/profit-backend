import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ZakatService } from './zakat.service';
import { ZakatSchedulerService } from './zakat.scheduler';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('zakat')
export class ZakatController {
  constructor(
    private readonly zakatService: ZakatService,
    private readonly zakatScheduler: ZakatSchedulerService,
  ) {}

  @Get('partner/:partnerId')
  @Permissions('zakat', 'canView')
  async summary(
    @Param('partnerId') partnerId: string,
    @Query('year') year?: string,
  ) {
    const partnerIdNum = parseInt(partnerId, 10);
    if (isNaN(partnerIdNum)) {
      throw new BadRequestException('Invalid partner ID');
    }

    const yearNum = year ? parseInt(year, 10) : undefined;
    if (year) {
      if (isNaN(yearNum!) || yearNum! < 2000 || yearNum! > 2100) {
        throw new BadRequestException(
          'Invalid year. Year must be between 2000 and 2100',
        );
      }
    }

    return this.zakatService.getPartnerZakatSummary(partnerIdNum, yearNum);
  }

  @Get('year/:year')
  @Permissions('zakat', 'canView')
  async summaryAll(
    @Param('year') year: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new BadRequestException(
        'Invalid year. Year must be between 2000 and 2100',
      );
    }
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    if (page && (isNaN(pageNum) || pageNum < 1)) {
      throw new BadRequestException('Invalid page number');
    }
    if (limit && (isNaN(limitNum!) || limitNum! < 1)) {
      throw new BadRequestException(
        'Invalid limit. Limit must be greater than 0',
      );
    }

    return this.zakatService.getYearlyAllPartners(yearNum, pageNum, limitNum);
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
