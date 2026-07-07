import axios from "axios";
import logger from "../utils/logger.js";

const BLOCKCHAIN_API = process.env.BLOCKCHAIN_API_KEY || "";
const MEMPOOL_API = "https://mempool.space/api";
const ETHERSCAN_API = "https://api.etherscan.io/api";

export interface BlockchainAddress {
  address: string; blockchain: "bitcoin" | "ethereum"; balance: number; txCount: number;
  firstSeen: string; lastSeen: string; flagged: boolean; riskScore: number;
}

export async function lookupBitcoinAddress(address: string): Promise<BlockchainAddress | null> {
  try {
    const [b, t] = await Promise.all([
      axios.get(`${MEMPOOL_API}/address/${address}`, { timeout: 10000 }).catch(() => null),
      axios.get(`${MEMPOOL_API}/address/${address}/txs`, { timeout: 10000 }).catch(() => null),
    ]);
    if (!b?.data) return null;
    const d = b.data; const txs = t?.data || [];
    const bal = (d.chain_stats?.funded_txo_sum || 0) - (d.chain_stats?.spent_txo_sum || 0);
    return {
      address, blockchain: "bitcoin", balance: bal / 1e8, txCount: d.chain_stats?.tx_count || txs.length,
      firstSeen: txs.length > 0 ? new Date(txs[txs.length - 1].status?.block_time * 1000).toISOString() : "",
      lastSeen: txs.length > 0 ? new Date(txs[0].status?.block_time * 1000).toISOString() : "",
      flagged: false, riskScore: 0,
    };
  } catch (err) { logger.error(`[Blockchain] BTC error: ${err instanceof Error ? err.message : String(err)}`); return null; }
}

export async function lookupEthereumAddress(address: string): Promise<BlockchainAddress | null> {
  try {
    const params: Record<string, string> = { module: "account", action: "balance", address, tag: "latest" };
    if (BLOCKCHAIN_API) params.apikey = BLOCKCHAIN_API;
    const res = await axios.get(ETHERSCAN_API, { params, timeout: 10000 });
    const bal = BigInt(res.data.result || "0");
    return { address, blockchain: "ethereum", balance: Number(bal) / 1e18, txCount: 0, firstSeen: "", lastSeen: "", flagged: false, riskScore: 0 };
  } catch (err) { logger.error(`[Blockchain] ETH error: ${err instanceof Error ? err.message : String(err)}`); return null; }
}

export async function lookupAddress(address: string): Promise<BlockchainAddress | null> {
  const c = address.trim();
  if (/^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(c)) return lookupBitcoinAddress(c);
  if (/^0x[a-fA-F0-9]{40}$/.test(c)) return lookupEthereumAddress(c);
  return null;
}

export async function checkAddressRisk(address: string): Promise<{ flagged: boolean; riskScore: number; reasons: string[] }> {
  const reasons: string[] = []; let score = 0;
  const lookup = await lookupAddress(address);
  if (lookup) {
    if (lookup.txCount === 0 && lookup.balance === 0) { score += 20; reasons.push("No transactions or balance"); }
    if (lookup.balance > 1000) { score += 10; reasons.push("High balance"); }
  }
  return { flagged: score >= 50, riskScore: Math.min(score, 100), reasons };
}
