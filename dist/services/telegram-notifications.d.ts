/**
 * Envoie un message via Telegram Bot API
 */
export declare function sendTelegramMessage(botToken: string, chatId: string, text: string, parseMode?: "Markdown" | "HTML"): Promise<boolean>;
/**
 * Envoie une alerte critique via Telegram
 */
export declare function sendCriticalAlert(message: string, data?: Record<string, unknown>): Promise<void>;
/**
 * Envoie un rapport de santé via Telegram
 */
export declare function sendHealthReport(uptime: number, memoryUsage: NodeJS.MemoryUsage, guildCount: number, userCount: number): Promise<void>;
/**
 * Envoie une notification de déploiement via Telegram
 */
export declare function sendDeploymentNotification(version: string, environment: string): Promise<void>;
/**
 * Initialise les notifications Telegram
 */
export declare function initTelegramNotifications(): void;
//# sourceMappingURL=telegram-notifications.d.ts.map