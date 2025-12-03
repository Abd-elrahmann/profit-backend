import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
export declare class ZakatSchedulerService {
    private readonly prisma;
    private readonly journalService;
    private readonly logger;
    private round2;
    private numberToArabicWords;
    private fillTemplate;
    private generatePdfFromHtml;
    constructor(prisma: PrismaService, journalService: JournalService);
    runMonthlyZakat(): Promise<void>;
    runYearEndZakatSettlement(): Promise<void>;
    runNextYearZakatAccruals(): Promise<void>;
}
