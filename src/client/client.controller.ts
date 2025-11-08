import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Param,
    Query,
    Body,
    UseInterceptors,
    UploadedFiles,
    ParseIntPipe,
    UseGuards,
    Req,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ClientService } from './client.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clients')
export class ClientController {
    constructor(private readonly clientService: ClientService) { }

    // CREATE CLIENT
    @Post()
    @Permissions('clients', 'canAdd')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'clientIdImage', maxCount: 1 },
                { name: 'clientWorkCard', maxCount: 1 },
                { name: 'salaryReport', maxCount: 1 },
                { name: 'simaReport', maxCount: 1 },
                { name: 'kafeelIdImage', maxCount: 1 },
                { name: 'kafeelWorkCard', maxCount: 1 },
            ],
            {
                storage: diskStorage({
                    destination: 'uploads/temp',
                    filename: (req, file, cb) => {
                        cb(null, `${file.fieldname}${extname(file.originalname)}`);
                    },
                }),
            },
        ),
    )
    createClient(@Req() req, @Body() dto: CreateClientDto, @UploadedFiles() files: any) {
        return this.clientService.createClient(req.user.id, dto, files);
    }

    // UPDATE CLIENT DATA
    @Patch(':id/client-data')
    @Permissions('clients', 'canUpdate')
    updateClientData(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateClientDto,
    ) {
        return this.clientService.updateClientData(req.user.id, id, dto);
    }

    // UPDATE KAFEEL DATA
    @Patch(':id/kafeel-data')
    @Permissions('clients', 'canUpdate')
    updateKafeelData(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
        return this.clientService.updateKafeelData(req.user.id, id, dto);
    }

    // UPDATE DOCUMENTS
    @Patch(':id/documents')
    @Permissions('clients', 'canUpdate')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'clientIdImage', maxCount: 1 },
                { name: 'clientWorkCard', maxCount: 1 },
                { name: 'salaryReport', maxCount: 1 },
                { name: 'simaReport', maxCount: 1 },
                { name: 'kafeelIdImage', maxCount: 1 },
                { name: 'kafeelWorkCard', maxCount: 1 },
            ],
            {
                storage: diskStorage({
                    destination: 'uploads/temp',
                    filename: (req, file, cb) => {
                        cb(null, `${file.fieldname}${extname(file.originalname)}`);
                    },
                }),
            },
        ),
    )
    async updateClientDocuments(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @UploadedFiles() files: Record<string, Array<Express.Multer.File>>,
        @Body('deleteFields') deleteFields?: string | string[],
    ) {
        let parsedDeleteFields: string[] | undefined;
        if (typeof deleteFields === 'string') {
            try {
                parsedDeleteFields = JSON.parse(deleteFields);
            } catch {
                parsedDeleteFields = [deleteFields];
            }
        } else if (Array.isArray(deleteFields)) {
            parsedDeleteFields = deleteFields;
        }

        return this.clientService.updateClientDocuments(req.user.id, id, files, parsedDeleteFields);
    }

    // DELETE CLIENT
    @Delete(':id')
    @Permissions('clients', 'canDelete')
    deleteClient(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.clientService.deleteClient(req.user.id, id);
    }

    // GET CLIENTS
    @Get('all/:page')
    @Permissions('clients', 'canView')
    getClients(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
        @Query('name') name?: string,
        @Query('phone') phone?: string,
        @Query('nationalId') nationalId?: string,
        @Query('city') city?: string,
        @Query('status') status?: string,
    ) {
        return this.clientService.getClients(page, {
            limit: Number(limit) || 10,
            name,
            phone,
            nationalId,
            city,
            status,
        });
    }

    // GET CLIENT BY ID
    @Get(':id')
    @Permissions('clients', 'canView')
    getClientById(@Param('id', ParseIntPipe) id: number) {
        return this.clientService.getClientById(id);
    }

    // GET CLIENT STATEMENT
    @Get(':id/statement')
    @Permissions('clients', 'canView')
    getClientStatement(
        @Param('id', ParseIntPipe) id: number,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.clientService.getClientStatement(id, from, to);
    }

}