import { Controller, Post, Patch, Delete, Get, Body, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { JournalService } from './journal.service';
import { CreateJournalDto, UpdateJournalDto } from './dto/journal.dto';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard,PermissionsGuard)
@Controller('journals')
export class JournalController {
    constructor(private readonly journalService: JournalService) { }

    @Post()
    @Permissions('journals', 'canAdd')
    create(@Body() dto: CreateJournalDto) {
        return this.journalService.createJournal(dto);
    }

    @Patch(':id')
    @Permissions('journals', 'canUpdate')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJournalDto) {
        return this.journalService.updateJournal(id, dto);
    }

    @Delete(':id')
    @Permissions('journals', 'canDelete')
    delete(@Param('id', ParseIntPipe) id: number) {
        return this.journalService.deleteJournal(id);
    }

    @Get('all/:page')
    @Permissions('journals', 'canView')
    getAll(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('status') status?: string,
        @Query('type') type?: string,
    ) {
        return this.journalService.getAllJournals(page, {
            limit: Number(limit) || 10,
            search,
            status,
            type,
        });
    }

    @Get(':id')
    @Permissions('journals', 'canView')
    getById(@Param('id', ParseIntPipe) id: number) {
        return this.journalService.getJournalById(id);
    }

    @Post(':id/post')
    @Permissions('journals', 'canPost')
    async postJournal(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
        const userId = req.user.id;
        return this.journalService.postJournal(id, userId);
    }

    @Post(':id/unpost')
    @Permissions('journals', 'canPost')
    async unpostJournal(@Param('id', ParseIntPipe) id: number) {
        return this.journalService.unpostJournal(id);
    }
}