/**
 * Merges writer-agent output into data/reviews.json.
 *
 * The 20 PAX records are replaced in place by their retrofits; the 60 new
 * back-catalogue reviews are added. Nothing here invents or edits facts - the
 * only mutation is dropping `statusAtShow` from verdicts, which is PAX-only
 * framing that renders as a nonsensical "Status at show" row on a review of a
 * game that shipped years ago.
 *
 * Usage: node scripts/merge-reviews.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sessionFiles =
  "C:/Users/tmanion/.copilot/session-state/427665fc-d356-4320-acc3-f3c4a67101d0/files";

const BATCHES = [1, 2, 3, 4, 5, 6].map((n) => `${sessionFiles}/reviews-batch-${n}.json`);
const RETROFITS = [1, 2].map((n) => `${sessionFiles}/reviews-pax-retrofit-${n}.json`);

const read = (f) => JSON.parse(readFileSync(f, "utf8"));

const live = read(path.join(root, "data", "reviews.json"));
const liveBySlug = new Map(live.map((r) => [r.slug, r]));

const problems = [];
const merged = new Map();

// --- retrofits replace the shipped PAX records -----------------------------
for (const file of RETROFITS) {
  for (const r of read(file)) {
    if (!liveBySlug.has(r.slug)) {
      problems.push(`retrofit ${r.slug} is not a shipped review`);
      continue;
    }
    if (merged.has(r.slug)) problems.push(`duplicate slug ${r.slug}`);
    merged.set(r.slug, r);
  }
}

const missedRetro = live.filter((r) => !merged.has(r.slug));
if (missedRetro.length)
  problems.push(`shipped reviews with no retrofit: ${missedRetro.map((r) => r.slug).join(", ")}`);

// --- new back-catalogue reviews -------------------------------------------
let stripped = 0;
for (const file of BATCHES) {
  for (const r of read(file)) {
    if (merged.has(r.slug)) {
      problems.push(`duplicate slug ${r.slug}`);
      continue;
    }
    if (r.scoreKind === "verdict" && "statusAtShow" in r) {
      delete r.statusAtShow;
      stripped += 1;
    }
    merged.set(r.slug, r);
  }
}

const all = [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));

// --- sanity ----------------------------------------------------------------
if (all.length !== 80) problems.push(`expected 80 reviews, got ${all.length}`);

const featured = all.filter((r) => r.featured);
if (featured.length > 1)
  problems.push(`more than one featured review: ${featured.map((r) => r.slug).join(", ")}`);

const byYear = {};
for (const r of all) byYear[r.year] = (byYear[r.year] || 0) + 1;

const kinds = {};
for (const r of all) kinds[r.scoreKind] = (kinds[r.scoreKind] || 0) + 1;

console.log(`reviews    : ${all.length}`);
console.log(`stripped   : ${stripped} statusAtShow from verdicts`);
console.log(`scoreKind  : ${JSON.stringify(kinds)}`);
console.log(`per year   : ${JSON.stringify(byYear)}`);
console.log(`featured   : ${featured.map((r) => r.slug).join(", ") || "(none)"}`);

if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const p of problems) console.log(`  ! ${p}`);
  process.exit(1);
}

writeFileSync(
  path.join(root, "data", "reviews.json"),
  JSON.stringify(all, null, 2) + "\n",
  "utf8",
);
console.log("\nwrote data/reviews.json");
