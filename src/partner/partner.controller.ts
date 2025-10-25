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
} from '@nestjs/common';
import { PartnerService } from './partner.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('partners')
export class PartnerController {
    constructor(private readonly partnerService: PartnerService) { }

    @Post()
    create(@Body() dto: CreatePartnerDto) {
        return this.partnerService.createPartner(dto);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePartnerDto) {
        return this.partnerService.updatePartner(id, dto);
    }

    @Delete(':id')
    delete(@Param('id', ParseIntPipe) id: number) {
        return this.partnerService.deletePartner(id);
    }

    @Get('all/:page')
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
    getPartnerById(@Param('id', ParseIntPipe) id: number) {
        return this.partnerService.getPartnerById(id);
    }

    // Upload mudarabah file
    @Post('upload/:id')
    @UseInterceptors(FileInterceptor('file'))
    uploadMudarabahFile(
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.partnerService.uploadMudarabahFile(id, file);
    }
}