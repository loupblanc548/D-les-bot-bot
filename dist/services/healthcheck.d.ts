import { Client } from "discord.js";
export interface CheckResult {
    module: string;
    name: string;
    passed: boolean;
    detail: string;
}
export declare function runHealthCheck(): Promise<CheckResult[]>;
export declare function sendHealthReport(client: Client, results: CheckResult[]): Promise<void>;
//# sourceMappingURL=healthcheck.d.ts.map