import { PrismaClient } from "../generated/prisma";

// Global instance to prevent multiple Prisma clients in development
declare global {
  var __prisma: PrismaClient | undefined;
}

// Create Prisma client instance
let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  // In development, use global instance to prevent hot reloading issues
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error"],
    });
  }
  prisma = global.__prisma;
}

// Export the Prisma client instance
export const db = prisma;

// Export types
export type DB = typeof prisma;

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
