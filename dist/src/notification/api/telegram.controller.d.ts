import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from './telegram.service';
export declare class TelegramController {
    private readonly prisma;
    private readonly telegramService;
    private readonly logger;
    constructor(prisma: PrismaService, telegramService: TelegramService);
    handleUpdate(update: any): Promise<{
        ok: boolean;
    }>;
}
