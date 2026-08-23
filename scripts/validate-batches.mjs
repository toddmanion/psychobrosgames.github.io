/**
 * Validates writer-agent output before it is allowed anywhere near reviews.json.
 *
 * Two independent classes of check:
 *   1. FACTUAL - every field data/review-plan.json owns (dates, tags, studio,
 *      store URL) must match exactly. Writers supply prose, never facts.
 *   2. VOICE   - the rules from VOICE-GUIDE.md that can be checked
 *      mechanically: banned corporate vocabulary, banned hedges, lens signals
 *      that read as scorecard output, and paragraph/list shape.
 *
 * Usage: node scripts/validate-batches.mjs <file...>
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(
  readFileSync(path.join(root, "data", "review-plan.json"), "utf8"),
);
const planBySlug = new Map(plan.map((p) => [p.slug, p]));

const LENSES = ["The Casual", "The Tactician", "The All-Rounder"];

/** The live reviews.json shape. `statusAtShow` is deliberately absent: it is a
    PAX-only field and meaningless on a back-catalogue verdict. */
const REQUIRED_KEYS = [
  "slug",
  "title",
  "studio",
  "date",
  "genre",
  "platforms",
  "deck",
  "verdictTitle",
  "dadTake",
  "verdict",
  "overview",
  "facts",
  "lenses",
  "bestFor",
  "watchFor",
  "reviewBasis",
  "sources",
  "hype",
  "year",
  "scoreKind",
  "tags",
];

const OPTIONAL_KEYS = ["statusAtShow", "featured"];

// Vocabulary that reads as trade press rather than three dads talking.
const BANNED_WORDS = [
  "legible",
  "legibility",
  "onboarding",
  "cadence",
  "friction",
  "rules ramp",
  "strategic resource",
  "robust",
  "seamless",
  "leverage",
  "curated",
  "offering",
  "delivers on",
  "player agency",
  "at its core",
  "it's worth noting",
  "that said,",
  "in many ways",
];

const BANNED_HEDGES = [
  "the promise rests on",
  "it remains to be seen",
  "players may find",
  "time will tell",
  "whether that holds",
];

// A lens signal is a wry aside, not a rating. These read as scorecard output.
const SCORECARD_SIGNALS = [
  "strong fit",
  "good fit",
  "poor fit",
  "high potential",
  "low potential",
  "moderate",
  "mixed",
  "positive",
  "negative",
  "recommended",
  "not recommended",
  "n/a",
];

const problems = [];
const notes = [];
const seenSlugs = new Map();
let totalRecords = 0;

const files = process.argv.slice(2).filter((a) => a !== "--pax");
/** PAX retrofits are anticipation pieces that predate the plan, so their facts
    are locked to the existing reviews.json rather than review-plan.json. */
const paxMode = process.argv.includes("--pax");
if (files.length === 0) {
  console.error("usage: node scripts/validate-batches.mjs [--pax] <file...>");
  process.exit(2);
}

const liveBySlug = new Map(
  JSON.parse(readFileSync(path.join(root, "data", "reviews.json"), "utf8")).map((r) => [
    r.slug,
    r,
  ]),
);

for (const file of files) {
  const label = path.basename(file);
  if (!existsSync(file)) {
    problems.push(`${label}: MISSING`);
    continue;
  }

  let records;
  try {
    records = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    problems.push(`${label}: does not parse - ${err.message}`);
    continue;
  }
  if (!Array.isArray(records)) {
    problems.push(`${label}: top level is not an array`);
    continue;
  }
  totalRecords += records.length;

  records.forEach((r, i) => {
    const where = `${label}[${i}] ${r.slug || "(no slug)"}`;

    if (seenSlugs.has(r.slug))
      problems.push(`${where}: duplicate slug, already in ${seenSlugs.get(r.slug)}`);
    else seenSlugs.set(r.slug, label);

    // ---- shape -----------------------------------------------------------
    const missing = REQUIRED_KEYS.filter((k) => !(k in r));
    if (missing.length) problems.push(`${where}: missing keys ${missing.join(", ")}`);
    const extra = Object.keys(r).filter(
      (k) => !REQUIRED_KEYS.includes(k) && !OPTIONAL_KEYS.includes(k),
    );
    if (extra.length) problems.push(`${where}: unexpected keys ${extra.join(", ")}`);

    if (!Array.isArray(r.overview) || r.overview.length !== 2)
      problems.push(`${where}: overview must be 2 paragraphs, got ${r.overview?.length}`);
    for (const key of ["facts", "bestFor", "watchFor"]) {
      if (!Array.isArray(r[key]) || r[key].length !== 3)
        problems.push(`${where}: ${key} must have 3 items, got ${r[key]?.length}`);
    }
    if (!Array.isArray(r.sources) || r.sources.length < 1)
      problems.push(`${where}: needs at least one source`);

    if (typeof r.hype !== "number" || r.hype < 1 || r.hype > 10)
      problems.push(`${where}: hype ${r.hype} out of range`);

    // ---- lenses ----------------------------------------------------------
    if (!Array.isArray(r.lenses) || r.lenses.length !== 3) {
      problems.push(`${where}: needs exactly 3 lenses`);
    } else {
      r.lenses.forEach((lens, li) => {
        if (lens.name !== LENSES[li])
          problems.push(`${where}: lens ${li} is "${lens.name}", expected "${LENSES[li]}"`);
        for (const k of ["signal", "headline", "body"]) {
          if (!lens[k]) problems.push(`${where}: lens ${li} missing ${k}`);
        }
        const sig = (lens.signal || "").toLowerCase().trim();
        if (SCORECARD_SIGNALS.includes(sig))
          problems.push(`${where}: lens ${li} signal "${lens.signal}" is a rating, not a voice line`);
        if (sig && sig.split(/\s+/).length < 2)
          problems.push(`${where}: lens ${li} signal "${lens.signal}" is too terse`);
      });
    }

    // ---- factual lock-down ----------------------------------------------
    if (paxMode) {
      const live = liveBySlug.get(r.slug);
      if (!live) {
        problems.push(`${where}: slug is not in the shipped reviews.json`);
      } else {
        for (const key of ["title", "studio", "date", "year", "genre", "platforms", "scoreKind", "statusAtShow"]) {
          if (JSON.stringify(r[key]) !== JSON.stringify(live[key]))
            problems.push(
              `${where}: ${key} changed - got ${JSON.stringify(r[key])}, shipped ${JSON.stringify(live[key])}`,
            );
        }
        if (r.hype !== live.hype)
          problems.push(`${where}: hype changed from ${live.hype} to ${r.hype}`);
      }
      // An anticipation piece must never claim we played it or attended PAX.
      const claims = [
        /\bwe (played|demoed|went hands[- ]on|got hands)\b/,
        /\bour (playthrough|hands[- ]on|demo|session)\b/,
        /\bhours? (in|with) (it|the game)\b/,
        /\bon the show floor\b/,
        /\bat the booth\b/,
        /\bwe (were|was) (there|at pax)\b/,
        /\btalked to the dev/,
      ];
      const proseRaw = [
        r.deck, r.verdictTitle, r.verdict, r.dadTake, ...(r.overview || []),
        ...(r.facts || []), ...(r.bestFor || []), ...(r.watchFor || []),
        ...(r.lenses || []).flatMap((l) => [l.signal, l.headline, l.body]), r.reviewBasis,
      ].filter(Boolean).join("\n").toLowerCase();
      for (const rx of claims) {
        if (rx.test(proseRaw))
          problems.push(`${where}: claims hands-on/attendance (${rx.source}) - these are anticipation pieces`);
      }
    } else {
      const p = planBySlug.get(r.slug);
      if (!p) {
        problems.push(`${where}: slug is not in review-plan.json`);
      } else {
        for (const key of ["title", "studio", "date", "year", "genre", "platforms", "scoreKind"]) {
          if (JSON.stringify(r[key]) !== JSON.stringify(p[key]))
            problems.push(
              `${where}: ${key} changed - got ${JSON.stringify(r[key])}, plan says ${JSON.stringify(p[key])}`,
            );
        }
        if (JSON.stringify(r.tags) !== JSON.stringify(p.tags))
          problems.push(
            `${where}: tags changed - got ${JSON.stringify(r.tags)}, plan says ${JSON.stringify(p.tags)}`,
          );
        const urls = (r.sources || []).map((s) => s.url);
        if (!urls.some((u) => u && u.includes(String(p.appid))))
          problems.push(`${where}: no source points at Steam appid ${p.appid}`);
      }
    }

    // A back-catalogue verdict has no "status at show" - that is PAX framing.
    if (!paxMode && r.scoreKind === "verdict" && "statusAtShow" in r)
      problems.push(`${where}: statusAtShow is PAX-only and must be dropped on a verdict`);

    // ---- voice -----------------------------------------------------------
    const prose = [
      r.deck,
      r.verdictTitle,
      r.verdict,
      r.dadTake,
      ...(r.overview || []),
      ...(r.facts || []),
      ...(r.bestFor || []),
      ...(r.watchFor || []),
      ...(r.lenses || []).flatMap((l) => [l.signal, l.headline, l.body]),
      r.reviewBasis,
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();

    for (const word of BANNED_WORDS) {
      if (prose.includes(word)) problems.push(`${where}: banned word "${word}"`);
    }
    for (const hedge of BANNED_HEDGES) {
      if (prose.includes(hedge)) problems.push(`${where}: banned hedge "${hedge}"`);
    }

    // Cheapest proxies for "does this sound like a person".
    const contractions = (prose.match(/\b\w+'(s|t|re|ve|ll|d|m)\b/g) || []).length;
    if (contractions < 8) notes.push(`${where}: ${contractions} contractions - may read stiff`);
    if (!/\b(we|our|us)\b/.test(prose))
      problems.push(`${where}: no first person plural anywhere - not our voice`);
  });

  console.log(`${label.padEnd(34)} ${String(records.length).padStart(2)} records`);
}

console.log(`\ntotal records: ${totalRecords}`);

if (notes.length) {
  console.log(`\nnotes (${notes.length}):`);
  for (const n of notes) console.log(`  - ${n}`);
}
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const p of problems) console.log(`  ! ${p}`);
  process.exit(1);
}
console.log("\nno problems.");
