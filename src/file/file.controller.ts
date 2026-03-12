import {
    Controller,
    Post,
    Get,
    Body,
    Query,
    UseGuards,
    Res,
    Req,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
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

    /**
     * GET - جلب الملف عبر المسار (يتطلب تسجيل الدخول وصلاحية العرض)
     * مثال: GET /api/file?path=uploads/clients/123456/photo.jpg
     */
    @UseGuards(JwtAuthGuard)
    @Get()
    async getFileByPath(
        @Query('path') path: string,
        @Res() res: express.Response,
        @Req() req: any,
    ) {
        if (!path || typeof path !== 'string') {
            throw new BadRequestException('مسار الملف مطلوب');
        }
        const decodedPath = decodeURIComponent(path).replace(/^\//, '');
        if (!decodedPath.startsWith('uploads/')) {
            throw new ForbiddenException('المسار غير مسموح');
        }
        const baseUrl = process.env.URL || 'http://localhost/';
        const fullUrl = baseUrl.replace(/\/$/, '') + '/' + decodedPath;

        const fileModule = this.fileService.getFileModuleFromUrl(fullUrl);
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
            const filePath = this.fileService.validateAndGetFilePath(fullUrl);
            return res.sendFile(filePath);
        } catch (err) {
            if (err instanceof NotFoundException || err instanceof ForbiddenException || err instanceof BadRequestException) {
                throw err;
            }
            throw new NotFoundException('الملف غير موجود');
        }
    }

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
