import { Controller, Post, Param, Body, ParseIntPipe, Req , UseGuards } from '@nestjs/common';
import { PeriodService } from './period.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('periods')
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  @Post(':id/close')
  async closePeriod(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.periodService.closePeriod(+id, req.user.id);
  }
}