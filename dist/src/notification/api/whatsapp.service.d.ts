export declare class WhatsappService {
    private readonly logger;
    private readonly baseUrl;
    private readonly apiKey;
    sendMessage(to: string, message: string): Promise<any>;
}
