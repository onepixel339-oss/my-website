/**
 * scripts/wipe-test-data.ts
 * ---------------------------------------------------------------------------
 * One-shot housekeeping: wipe ALL test/development content from the database
 * so the app starts truly empty for launch. Since the site hasn't been
 * published yet, every ExchangeMessage / QuickReply / BottleReply /
 * ModerationLog row in the DB is test data created during development and
 * verification — none of it is from real users.
 *
 * This deletes:
 *   - All ExchangeMessage rows (source = "bottle" AND source = "exchange")
 *     → cascades to QuickReply, BottleReply, ModerationLog via onDelete: Cascade
 *   - Any orphaned QuickReply / BottleReply / ModerationLog rows (safety net)
 *
 * The Prisma schema, tables, and indexes are left intact — only the row
 * data is removed. After this runs, the app surfaces an empty sea until a
 * real user casts the first bottle.
 *
 * Run:  bun run scripts/wipe-test-data.ts
 * Safe to re-run — reports 0 deleted when the DB is already clean.
 * ---------------------------------------------------------------------------
 */
import { db } from "@/lib/db";

async function main() {
  const before = {
    bottles: await db.exchangeMessage.count({ where: { source: "bottle" } }),
    exchange: await db.exchangeMessage.count({ where: { source: "exchange" } }),
    quickReplies: await db.quickReply.count(),
    bottleReplies: await db.bottleReply.count(),
    modLogs: await db.moderationLog.count(),
  };
  console.log("=== Before wipe ===");
  console.log(`  ExchangeMessage (bottle):   ${before.bottles}`);
  console.log(`  ExchangeMessage (exchange): ${before.exchange}`);
  console.log(`  QuickReply rows:            ${before.quickReplies}`);
  console.log(`  BottleReply rows:           ${before.bottleReplies}`);
  console.log(`  ModerationLog rows:         ${before.modLogs}`);

  // Delete related rows first (safety net in case cascade misses orphans).
  const dr1 = await db.bottleReply.deleteMany({});
  const dr2 = await db.quickReply.deleteMany({});
  const dr3 = await db.moderationLog.deleteMany({});
  // Then delete all messages (both sources).
  const dr4 = await db.exchangeMessage.deleteMany({});

  console.log("\n=== Deleted ===");
  console.log(`  BottleReply:      ${dr1.count}`);
  console.log(`  QuickReply:       ${dr2.count}`);
  console.log(`  ModerationLog:    ${dr3.count}`);
  console.log(`  ExchangeMessage:  ${dr4.count}`);

  const after = {
    bottles: await db.exchangeMessage.count({ where: { source: "bottle" } }),
    exchange: await db.exchangeMessage.count({ where: { source: "exchange" } }),
    quickReplies: await db.quickReply.count(),
    bottleReplies: await db.bottleReply.count(),
    modLogs: await db.moderationLog.count(),
  };
  console.log("\n=== After wipe ===");
  console.log(`  ExchangeMessage (bottle):   ${after.bottles}`);
  console.log(`  ExchangeMessage (exchange): ${after.exchange}`);
  console.log(`  QuickReply rows:            ${after.quickReplies}`);
  console.log(`  BottleReply rows:           ${after.bottleReplies}`);
  console.log(`  ModerationLog rows:         ${after.modLogs}`);
  console.log("\nThe sea is empty. Ready for real users.");
}

main()
  .catch((err) => { console.error("Failed:", err); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
