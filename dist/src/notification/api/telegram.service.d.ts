export declare class TelegramService {
    private readonly logger;
    private readonly botToken;
    sendMessage(chatId: string, message: string, extra?: any): Promise<any>;
}
