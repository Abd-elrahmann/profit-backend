import {
    Controller,
    Post,
    Body,
    UseGuards,
    Res,
    NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import express from 'express';
import { FileService } from './file.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('file')
export class FileController {
    constructor(private readonly fileService: FileService) { }

    @UseGuards(JwtAuthGuard, PermissionsGuard)
    @Post()
    @Permissions('files', 'canView')
    async getFile(@Body('url') url: string, @Res() res: express.Response) {
        if (!url) throw new NotFoundException('URL is required');

        try {
            const filePath = await this.fileService.validateAndGetFilePath(url);
            return res.sendFile(filePath);
        } catch (err) {
            throw new NotFoundException('Invalid URL or file not found');
        }
    }
}
