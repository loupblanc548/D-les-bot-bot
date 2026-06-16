import { Client } from "discord.js";
interface TweetData {
    tweetId: string;
    account: string;
    content: string;
    pubDate: string;
    link: string;
    imageUrl: string | null;
}
declare function extractTweetId(link: string): string | null;
declare function fetchTweetsForAccount(account: string): Promise<TweetData[]>;
declare function checkTwitterAccounts(client: Client): Promise<void>;
export declare function startTwitterMonitoring(client: Client): void;
export declare function stopTwitterMonitoring(): void;
export { checkTwitterAccounts, fetchTweetsForAccount, extractTweetId };
//# sourceMappingURL=twitterCron.d.ts.map