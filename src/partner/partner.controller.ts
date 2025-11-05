import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Param,
    Body,
    ParseIntPipe,
    Query,
    UploadedFile,
    UseInterceptors,
    UseGuards,
    Req,
} from '@nestjs/common';
import { PartnerService } from './partner.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('partners')
export class PartnerController {
    constructor(private readonly partnerService: PartnerService) { }

    @Post()
    @Permissions('partners', 'canAdd')
    create(@Req() req, @Body() dto: CreatePartnerDto) {
        return this.partnerService.createPartner(req.user.id, dto);
    }

    @Patch(':id')
    @Permissions('partners', 'canUpdate')
    update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePartnerDto) {
        return this.partnerService.updatePartner(req.user.id, id, dto);
    }

    @Delete(':id')
    @Permissions('partners', 'canDelete')
    delete(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.partnerService.deletePartner(req.user.id, id);
    }

    @Get('all/:page')
    @Permissions('partners', 'canView')
    getAll(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
        @Query('name') name?: string,
        @Query('nationalId') nationalId?: string,
        @Query('isActive') isActive?: string,
    ) {
        return this.partnerService.getAllPartners(page, {
            limit,
            name,
            nationalId,
            isActive: isActive ? isActive === 'true' : undefined,
        });
    }

    @Get(':id')
    @Permissions('partners', 'canView')
    getPartnerById(@Param('id', ParseIntPipe) id: number) {
        return this.partnerService.getPartnerById(id);
    }

    // Upload mudarabah file
    @Post('upload/:id')
    @Permissions('partners', 'canUpdate')
    @UseInterceptors(FileInterceptor('file'))
    uploadMudarabahFile(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.partnerService.uploadMudarabahFile(req.user.id, id, file);
    }

    // CREATE TRANSACTION
    @Post('transaction/:id')
    @Permissions('partners', 'canAdd')
    async createTransaction(
        @Req() req,
        @Param('id', ParseIntPipe) partnerId: number,
        @Body()
        dto: {
            type: 'DEPOSIT' | 'WITHDRAWAL';
            amount: number;
            description?: string;
        },
    ) {
        const currentUser = req.user.id;
        return await this.partnerService.createPartnerTransaction(
            currentUser,
            partnerId,
            dto,
        );
    }

    // DELETE TRANSACTION
    @Delete('transaction/:id')
    @Permissions('partners', 'canDelete')
    async deleteTransaction(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
    ) {
        const currentUser = req.user.id;
        return await this.partnerService.deletePartnerTransaction(currentUser, id);
    }

    // GET TRANSACTIONS
    @Get('transaction/:id/:page')
    @Permissions('partners', 'canView')
    async getTransactions(
        @Param('id', ParseIntPipe) partnerId: number,
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
        @Query('type') type?: 'DEPOSIT' | 'WITHDRAWAL',
        @Query('search') search?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return await this.partnerService.getPartnerTransactions(partnerId, page, {
            limit: limit ? Number(limit) : 10,
            type,
            search,
            startDate,
            endDate,
        });
    }
}