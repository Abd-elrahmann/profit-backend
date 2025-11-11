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
import multer, { diskStorage, memoryStorage } from 'multer';
import path, { extname } from 'path';
import { ClientService } from './client.service';
import { CreateClientDto, UpdateClientDto, KafeelDto } from './dto/client.dto';
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
                { name: 'kafeelIdImage', maxCount: 10 },
                { name: 'kafeelWorkCard', maxCount: 10 },
            ],
            {
                storage: multer.memoryStorage(),
            },
        ),
    )

    createClient(
        @Req() req,
        @Body() dto: CreateClientDto,
        @UploadedFiles() files: Record<string, Express.Multer.File[]>,
    ) {
        // Normalize files: convert kafeelIdImage[0] -> kafeelIdImage
        const normalizedFiles: Record<string, Express.Multer.File[]> = {};

        Object.entries(files).forEach(([key, value]) => {
            const cleanKey = key.replace(/\[\d+\]$/, ''); // remove [0], [1], etc.
            if (!normalizedFiles[cleanKey]) normalizedFiles[cleanKey] = [];
            normalizedFiles[cleanKey].push(...value);
        });

        return this.clientService.createClient(req.user.id, dto, normalizedFiles);
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
    @Patch('kafeel/:id')
    @Permissions('clients', 'canUpdate')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'kafeelIdImage', maxCount: 1 },
                { name: 'kafeelWorkCard', maxCount: 1 },
            ],
            {
                storage: memoryStorage(),
            },
        ),
    )
    updateKafeelData(
        @Req() req,
        @Param('id', ParseIntPipe) kafeelId: number,
        @Body() dto: Partial<KafeelDto>,
        @UploadedFiles() files?: {
            kafeelIdImage?: Express.Multer.File[];
            kafeelWorkCard?: Express.Multer.File[];
        },
    ) {
        return this.clientService.updateKafeelData(req.user.id, kafeelId, dto, files);
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
            ],
            {
                storage: memoryStorage(), // store in memory
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

        return this.clientService.updateClientDocuments(
            req.user.id,
            id,
            files,
            parsedDeleteFields,
        );
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
            limit: limit ? Number(limit) : undefined,
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
    @Get(':id/statement/:page')
    @Permissions('clients', 'canView')
    getClientStatement(
        @Param('id', ParseIntPipe) id: number,
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.clientService.getClientStatement(id, page, {
            from,
            to,
            limit: Number(limit) || 10,
        });
    }

    // CREATE NEW KAFEEL FOR CLIENT
    @Post(':id/kafeels')
    @Permissions('clients', 'canAdd')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'kafeelIdImage', maxCount: 1 },
                { name: 'kafeelWorkCard', maxCount: 1 },
            ],
            {
                 storage: memoryStorage(),
            },
        ),
    )
    async createKafeel(
        @Req() req,
        @Param('id', ParseIntPipe) clientId: number,
        @Body() dto: KafeelDto,
        @UploadedFiles() files?: Record<string, Express.Multer.File[]>,
    ) {
        return this.clientService.createKafeel(req.user.id, clientId, dto, files);
    }
}