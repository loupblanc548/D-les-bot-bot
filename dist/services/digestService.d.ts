import { Client } from "discord.js";
declare class DigestService {
    private client;
    private dailyInterval;
    private weeklyInterval;
    constructor(client: Client);
    /**
     * Récupère les statistiques pour la période donnée
     */
    private getStats;
    /**
     * Génère le digest quotidien
     */
    private generateDailyDigest;
    /**
     * Génère le digest hebdomadaire
     */
    private generateWeeklyDigest;
    /**
     * Envoie le digest au canal configuré
     */
    private sendDigest;
    /**
     * Envoie le digest quotidien
     */
    private sendDailyDigest;
    /**
     * Envoie le digest hebdomadaire
     */
    private sendWeeklyDigest;
    /**
     * Démarre le service de digest
     */
    start(): void;
    /**
     * Arrête le service de digest
     */
    stop(): void;
    /**
     * Envoie un digest manuel (pour test)
     */
    sendManualDigest(type: 'daily' | 'weekly'): Promise<void>;
}
export default DigestService;
//# sourceMappingURL=digestService.d.ts.map