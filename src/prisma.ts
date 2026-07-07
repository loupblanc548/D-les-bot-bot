import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
dotenv.config();

/**
 * Prisma Client Singleton — ONE instance across the entire process.
 *
 * Multiple PrismaClient instances spawn multiple query engine binaries,
 * each consuming ~20-30MB RSS. On a 512MB container, this is catastrophic.
 *
 * This pattern guarantees a single engine:
 *  - In production: the module cache ensures one instance per process.
 *  - In dev (tsx watch / vitest): globalThis prevents duplicate instances
 *    when modules are re-imported.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["query", "info", "warn", "error"],
    adapter,
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Always cache on globalThis — even in production — to survive HMR / hot reloads
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown — disconnect before process exit
process.on("beforeExit", async () => {
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});

export default prisma;
