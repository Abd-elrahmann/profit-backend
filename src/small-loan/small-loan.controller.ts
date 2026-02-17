import {
    Controller,
    Post,
    Get,
    Param,
    Body,
    ParseIntPipe,
    Delete,
    Query,
    UseGuards,
    Req,
    Patch,
} from '@nestjs/common';
import { SmallLoanService } from './small-loan.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { UnpostedJournalsGuard } from '../common/guards/unposted-journals.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('small-loans')
export class SmallLoanController {
    constructor(private readonly service: SmallLoanService) { }

    @Post()
    @Permissions('loans', 'canAdd')
    @UseGuards(UnpostedJournalsGuard)
    create(
        @Req() req,
        @Body() body: any
    ) {
        return this.service.create(body, req.user.id);
    }

    @Get('unposted-journals')
    @Permissions('loans', 'canView')
    getUnpostedJournals() {
        return this.service.getUnpostedJournalsForSmallLoans();
    }

    @Get(":page")
    @Permissions('loans', 'canView')
    findAll(
        @Param('page', ParseIntPipe) page: number,
        @Query('status') status?: string,
        @Query('limit') limit?: number,
        @Query('clientName') clientName?: string,
    ) {
        return this.service.findAll(page, limit, status, clientName);
    }

    @Post('pay/:id')
    @Permissions('loans', 'canPost')
    pay(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: any,
    ) {
        return this.service.pay(id, body, req.user.id);
    }

    @Delete(':id')
    @Permissions('loans', 'canDelete')
    delete(
        @Req() req,
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.service.delete(id, req.user.id);
    }

    @Patch(':id')
    @Permissions('loans', 'canUpdate')
    async updateLoan(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: {
            Name?: string;
            amount?: number;
            notes?: string;
        },
    ) {
        return this.service.update(
            id,
            body,
            req.user.id,
        );
    }
}