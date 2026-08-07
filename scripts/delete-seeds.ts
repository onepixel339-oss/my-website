/**
 * scripts/delete-seeds.ts
 * ---------------------------------------------------------------------------
 * One-shot housekeeping: remove all pre-seeded starter bottles
 * (is_seed = true) from the database. These were the system-generated
 * "AI messages" inserted by scripts/seed-bottles.ts to backfill the
 * reciprocal-unlock pool during cold start. They have been retired in
 * favour of surfacing only real, user-authored bottles.
 *
 * Associated QuickReply / BottleReply / ModerationLog rows are removed
 * automatically via the onDelete: Cascade relations in the Prisma schema.
 *
 * Run:  bun run scripts/delete-seeds.ts
 * Safe to re-run — it reports 0 deleted when no seeds remain.
 * ---------------------------------------------------------------------------
 */
import { db } from "@/lib/db";

async function main() {
  const before = await db.exchangeMessage.count({ where: { isSeed: true } });
  console.log(`Seed bottles found: ${before}`);

  const deleted = await db.exchangeMessage.deleteMany({ where: { isSeed: true } });
  console.log(`Deleted ${deleted.count} seed bottle(s).`);

  const realBottles = await db.exchangeMessage.count({
    where: { source: "bottle", isHidden: false, moderationStatus: "published", isSeed: false },
  });
  console.log(`Remaining real (non-seed) published bottles: ${realBottles}`);
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
