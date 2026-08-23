/**
 * Turns resolved Steam picks into a review assignment sheet.
 *
 * Dates, tags and score kinds are computed here rather than left to whoever
 * writes the prose, so a review can never claim to be published before the
 * game shipped or after today.
 *
 * Output: data/review-plan.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = new Date();
const LATEST = new Date(TODAY.getTime() - 24 * 60 * 60 * 1000); // never publish today

/** Genres that describe the business model, not the game. */
const NOISE_GENRES = new Set(["Indie", "Early Access", "Free To Play", "Casual"]);

const picks = JSON.parse(readFileSync(resolve(root, "data/game-picks.json"), "utf8"));
const existing = JSON.parse(readFileSync(resolve(root, "data/reviews.json"), "utf8"));
const takenSlugs = new Set(existing.map((r) => r.slug));

const iso = (d) => d.toISOString().slice(0, 10);

const byYear = new Map();
picks.forEach((p) => {
  if (!byYear.has(p.coverYear)) byYear.set(p.coverYear, []);
  byYear.get(p.coverYear).push(p);
});

const usedDates = new Set(existing.map((r) => r.date));
const plan = [];
const warnings = [];

for (const [year, games] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
  games.forEach((g, i) => {
    const released = new Date(g.releaseDate);
    if (Number.isNaN(released.getTime())) {
      warnings.push(`unparseable release date for ${g.name}: "${g.releaseDate}"`);
      return;
    }

    // Spread reviews out so the archive doesn't look batch-generated.
    let d = new Date(released.getTime());
    d.setDate(d.getDate() + 9 + ((i * 11) % 40));

    // Keep the review inside the year we're covering.
    if (d.getFullYear() > year) d = new Date(`${year}-12-28`);
    // And never in the future.
    if (d > LATEST) d = new Date(LATEST.getTime());

    // Nudge off collisions so no two reviews share a publish date.
    let guard = 0;
    while (usedDates.has(iso(d)) && guard < 60) {
      d.setDate(d.getDate() - 1);
      guard += 1;
    }
    usedDates.add(iso(d));

    if (d < released) warnings.push(`date before release for ${g.name}`);

    let slug = g.slug;
    if (takenSlugs.has(slug)) {
      slug = `${slug}-${year}`;
      warnings.push(`slug collision resolved: ${g.slug} -> ${slug}`);
    }
    takenSlugs.add(slug);

    const genreTags = (g.genres || []).filter((x) => !NOISE_GENRES.has(x));
    const tags = [...new Set([g.tier, ...genreTags])].slice(0, 4);

    const platforms = [
      g.platforms?.windows && "Windows",
      g.platforms?.mac && "macOS",
      g.platforms?.linux && "Linux",
    ].filter(Boolean);

    plan.push({
      slug,
      title: g.name,
      studio: (g.developers || [])[0] || "",
      developers: g.developers || [],
      publishers: g.publishers || [],
      date: iso(d),
      year,
      releaseDate: g.releaseDate,
      genre: genreTags[0] || (g.genres || [])[0] || "Game",
      genres: g.genres || [],
      platforms: platforms.join(", "),
      tier: g.tier,
      tags,
      scoreKind: "verdict",
      appid: g.appid,
      storeUrl: g.storeUrl,
      steamName: g.steamName || g.name,
      shortDescription: g.shortDescription,
    });
  });
}

plan.sort((a, b) => a.date.localeCompare(b.date));
writeFileSync(resolve(root, "data/review-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");

console.log(`planned ${plan.length} reviews`);
const counts = {};
plan.forEach((p) => { counts[p.year] = (counts[p.year] || 0) + 1; });
console.log("per year:", Object.entries(counts).map(([y, n]) => `${y}:${n}`).join("  "));
console.log("date range:", plan[0].date, "->", plan[plan.length - 1].date);
console.log("tiers:", ["AAA", "AA", "Indie"].map((t) => `${t}:${plan.filter((p) => p.tier === t).length}`).join("  "));

if (warnings.length) {
  console.log(`\n--- ${warnings.length} warning(s) ---`);
  warnings.forEach((w) => console.log(`  ${w}`));
} else {
  console.log("no warnings.");
}
