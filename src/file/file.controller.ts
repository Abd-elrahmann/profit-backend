import {
    Controller,
    Post,
    Body,
    UseGuards,
    Res,
    Req,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import express from 'express';
import { FileService } from './file.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('file')
export class FileController {
    constructor(
        private readonly fileService: FileService,
        private readonly prisma: PrismaService,
    ) { }

    @UseGuards(JwtAuthGuard)
    @Post()
    async getFile(
        @Body('url') url: string,
        @Res() res: express.Response,
        @Req() req: any,
    ) {
        if (!url) throw new NotFoundException('URL is required');

        const fileModule = this.fileService.getFileModuleFromUrl(url);
        
        if (!fileModule) {
            throw new ForbiddenException('نوع الملف غير معروف');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: req.user.id },
            include: { role: { include: { permissions: true } } },
        });

        if (!user?.role?.permissions) {
            throw new ForbiddenException('ليس لديك صلاحية لعرض هذا الملف');
        }

        const hasPermission = user.role.permissions.some(
            (p) => p.module === fileModule && p.canView === true,
        );

        if (!hasPermission) {
            throw new ForbiddenException(`ليس لديك صلاحية لعرض ملفات هذا القسم`);
        }

        try {
            const filePath = this.fileService.validateAndGetFilePath(url);
            return res.sendFile(filePath);
        } catch (err) {
            if (err instanceof NotFoundException) {
                throw err;
            }
            throw new NotFoundException('الملف غير موجود');
        }
    }
}
