import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Query logging is gated on NODE_ENV: in production we must NOT log every SQL
// query (with its bound parameters) to stdout, because message content would
// be captured by any log aggregator — a PII leak. In dev the query log is
// useful for debugging.
const logLevels = process.env.NODE_ENV !== 'production'
  ? (['query', 'error', 'warn'] as const)
  : (['error', 'warn'] as const)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [...logLevels],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db