import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
    constructor(private readonly prisma: PrismaService) { }

    async getSettings() {
        const settings = await this.prisma.settings.findFirst();

        if (!settings) {
            throw new NotFoundException('Settings not found');
        }

        return settings;
    }

    async upsertSettings(dto: UpdateSettingsDto) {
        const settings = await this.prisma.settings.upsert({
            where: { id: 1 },
            update: {
                ...dto,
                updatedAt: new Date(),
            },
            create: {
                ...dto,
            },
        });

        return { message: 'Settings saved successfully', settings };
    }
}
