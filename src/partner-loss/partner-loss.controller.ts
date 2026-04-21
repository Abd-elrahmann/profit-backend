import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    ParseIntPipe,
    UseGuards,
    Query,
    Req,
} from '@nestjs/common';
import { PartnerLossService } from './partner-loss.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('partner-loss')
export class PartnerLossController {
    constructor(private readonly service: PartnerLossService) { }

    @Get(':page')
    @Permissions('loss', 'canView')
    getLosses(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: string,
        @Query('name') name?: string,
    ) {
        return this.service.getLosses(
            page,
            Number(limit) || 10,
            name,
        );
    }

    @Post('pay/:id')
    @Permissions('loss', 'canPost')
    payLoss(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { amount: number; BankId: number },
        @Req() req
    ) {
        const currentUser = req.user.id;

        return this.service.payLoss(
            id,
            body.amount,
            body.BankId,
            currentUser,
        );
    }

    @Post('reverse/:id')
    @Permissions('loss', 'canPost')
    reversePayLoss(
        @Param('id', ParseIntPipe) id: number,
        @Req() req
    ) {
        const currentUser = req.user.id;
        return this.service.reversePayLoss(
            id,
            currentUser,
        );
    }
}