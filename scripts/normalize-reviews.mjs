/**
 * Normalise every review record to the current schema.
 *
 * The site began as a single PAX West 2025 collection, so the original records
 * carried `group`/`groupKey` fields that assumed one collection existed. The
 * archive now spans a decade, so collections are expressed as general-purpose
 * `tags` and PAX West 2025 is simply one of them.
 *
 * This script is idempotent: run it as many times as you like.
 *
 *   node scripts/normalize-reviews.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REVIEWS = path.join(root, 'data', 'reviews.json');

/** Legacy group names map onto tags. Anything already tagged is left alone. */
const GROUP_TAGS = {
  'PAX Rising Showcase': ['PAX West 2025', 'PAX Rising Showcase'],
  'Official PAX West 2025 event page': ['PAX West 2025'],
};

const reviews = JSON.parse(await readFile(REVIEWS, 'utf8'));

const problems = [];
let migrated = 0;

const normalised = reviews.map((review) => {
  const next = { ...review };

  next.year = Number(String(next.date).slice(0, 4));
  if (!Number.isInteger(next.year)) problems.push(`${next.slug}: bad date "${next.date}"`);

  // A review with `statusAtShow` was written from show materials, not from
  // playing it, so its number is anticipation rather than a verdict.
  if (!next.scoreKind) {
    next.scoreKind = next.statusAtShow ? 'hype' : 'verdict';
    migrated += 1;
  }

  if (!Array.isArray(next.tags) || next.tags.length === 0) {
    const fromGroup = GROUP_TAGS[next.group] || [];
    if (fromGroup.length) {
      // Legacy PAX records carry a bespoke one-off genre string ("Zero-G factory
      // simulation"), which would generate a tag page holding a single review.
      // Only the collection tags are broad enough to be worth browsing.
      next.tags = [...new Set(['Indie', ...fromGroup])];
    } else {
      next.tags = [...new Set([next.tier, next.genre].filter(Boolean))];
    }
  }

  delete next.group;
  delete next.groupKey;

  // Repair pass for records tagged before the rule above existed: a bespoke
  // one-off genre string only ever produces a tag page of a single review.
  if (next.statusAtShow) {
    next.tags = next.tags.filter((t) => t !== next.genre);
  }

  if (!next.tags.length) problems.push(`${next.slug}: no tags`);
  if (!next.lenses || next.lenses.length !== 3) problems.push(`${next.slug}: expected 3 lenses`);

  return next;
});

normalised.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

await writeFile(REVIEWS, `${JSON.stringify(normalised, null, 2)}\n`, 'utf8');

const years = [...new Set(normalised.map((r) => r.year))].sort();
const kinds = normalised.reduce((acc, r) => ({ ...acc, [r.scoreKind]: (acc[r.scoreKind] || 0) + 1 }), {});

console.log(`reviews    : ${normalised.length}`);
console.log(`years      : ${years[0]}-${years[years.length - 1]} (${years.length})`);
console.log(`scoreKind  : ${JSON.stringify(kinds)}`);
console.log(`migrated   : ${migrated} record(s) gained a scoreKind`);

if (problems.length) {
  console.log(`\n--- ${problems.length} problem(s) ---`);
  for (const p of problems) console.log(`  ! ${p}`);
} else {
  console.log('\nno problems.');
}
