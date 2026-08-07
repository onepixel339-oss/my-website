/**
 * scripts/seed-bottles.ts
 * ---------------------------------------------------------------------------
 * RETIRED — this script is now a deliberate no-op.
 *
 * It previously inserted a curated set of starter "bottles" (is_seed = true)
 * so the first users on a fresh deployment never saw an empty pool. These
 * system-generated starter messages have been removed from the product: the
 * app now surfaces ONLY real, user-authored bottles across every surface
 * (the browse feed, the Wall of Gems, and the reciprocal-unlock exchange
 * pool — all filter `isSeed = false`).
 *
 * Any existing seed rows were purged by `scripts/delete-seeds.ts`. Running
 * this script again does nothing — it will not re-introduce seed content.
 *
 * If the real (non-seed) pool is ever empty on a fresh deployment, the
 * exchange simply returns `received: null` and the client shows the
 * "still drifting" empty state. That is the intended behaviour: no
 * synthetic content, ever.
 * ---------------------------------------------------------------------------
 */

async function main() {
  console.log(
    "scripts/seed-bottles.ts is retired and does nothing.\n" +
      "Seed bottles (system-generated starter content) have been removed from the product.\n" +
      "The app now surfaces only real, user-authored bottles.\n" +
      "If you need to remove legacy seed rows from an older database, run:\n" +
      "  bun run scripts/delete-seeds.ts",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
