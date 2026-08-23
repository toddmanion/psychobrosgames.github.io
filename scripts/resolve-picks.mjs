/**
 * Resolves our year-by-year game picks against the live Steam store so that
 * every review is grounded in a real app: real title, real studio, real
 * release date, real genres.
 *
 * We do not trust the name typed below. Steam is the authority. Anything that
 * fails to resolve, resolves to a different title, or lands in the wrong year
 * is reported loudly so it can be replaced rather than silently shipped.
 *
 * Output: data/game-picks.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DELAY_MS = 350;

/** year, the title we think it is, and the tier we are covering it as. */
const PICKS = [
  [2015, "The Witcher 3: Wild Hunt", "AAA"],
  [2015, "Keep Talking and Nobody Explodes", "Indie"],
  [2015, "Undertale", "Indie"],
  [2015, "Fallout 4", "AAA"],
  [2015, "Cities: Skylines", "AA"],

  [2016, "DOOM", "AAA"],
  [2016, "Stardew Valley", "Indie"],
  [2016, "DARK SOULS III", "AAA"],
  [2016, "Firewatch", "Indie"],
  [2016, "XCOM 2", "AAA"],

  [2017, "Divinity: Original Sin 2", "AA"],
  [2017, "Cuphead", "Indie"],
  [2017, "Hollow Knight", "Indie"],
  [2017, "NieR:Automata", "AAA"],
  [2017, "Prey", "AAA"],

  [2018, "Celeste", "Indie"],
  [2018, "Return of the Obra Dinn", "Indie"],
  [2018, "Monster Hunter: World", "AAA"],
  [2018, "Dead Cells", "Indie"],
  [2018, "Subnautica", "AA"],

  [2019, "Disco Elysium", "Indie"],
  [2019, "Sekiro: Shadows Die Twice", "AAA"],
  [2019, "Devil May Cry 5", "AAA"],
  [2019, "Slay the Spire", "Indie"],
  [2019, "Resident Evil 2", "AAA"],

  [2020, "Hades", "Indie"],
  [2020, "Half-Life: Alyx", "AAA"],
  [2020, "DOOM Eternal", "AAA"],
  [2020, "Deep Rock Galactic", "AA"],
  [2020, "Ori and the Will of the Wisps", "AA"],

  [2021, "It Takes Two", "AA"],
  [2021, "Valheim", "Indie"],
  [2021, "Inscryption", "Indie"],
  [2021, "DEATHLOOP", "AAA"],
  [2021, "Resident Evil Village", "AAA"],

  [2022, "ELDEN RING", "AAA"],
  [2022, "Vampire Survivors", "Indie"],
  [2022, "Stray", "AA"],
  [2022, "Cult of the Lamb", "Indie"],
  [2022, "Neon White", "Indie"],

  [2023, "Baldur's Gate 3", "AAA"],
  [2023, "DAVE THE DIVER", "Indie"],
  [2023, "COCOON", "Indie"],
  [2023, "Resident Evil 4", "AAA"],
  [2023, "Pizza Tower", "Indie"],

  [2024, "Balatro", "Indie"],
  [2024, "HELLDIVERS 2", "AAA"],
  [2024, "ANIMAL WELL", "Indie"],
  [2024, "Black Myth: Wukong", "AAA"],
  [2024, "UFO 50", "Indie"],

  [2025, "Hades II", "AA"],
  [2025, "Clair Obscur: Expedition 33", "AA"],
  [2025, "Blue Prince", "Indie"],
  [2025, "Hollow Knight: Silksong", "Indie"],
  [2025, "Split Fiction", "AA"],

  [2026, "Big Walk", "Indie"],
  [2026, "Forza Horizon 6", "AAA"],
  [2026, "Mina the Hollower", "Indie"],
  [2026, "Cairn", "Indie"],
  [2026, "Beast of Reincarnation", "AA"],
];

/**
 * Some canonical store pages carry an edition suffix ("- Definitive Edition").
 * It is the same game and the right appid, but we bill it under the plain
 * title. Keyed by appid so we never guess.
 */
const DISPLAY_OVERRIDES = {
  435150: "Divinity: Original Sin 2",
  632470: "Disco Elysium",
  814380: "Sekiro: Shadows Die Twice",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Strip punctuation, trademarks and casing so "NieR:Automata" matches "NieR:Automata". */
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u2122\u00ae]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[\u2122\u00ae']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function getJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "psychobros-site-build/1.0 (+https://psychobrosgames.github.io/)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function search(term) {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=us&l=english`;
  const data = await getJson(url);
  return Array.isArray(data.items) ? data.items : [];
}

async function details(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`;
  const data = await getJson(url);
  const entry = data?.[String(appid)];
  return entry?.success ? entry.data : null;
}

/** Prefer an exact normalized title match; otherwise fall back to the top hit. */
function pickMatch(items, wanted) {
  const want = norm(wanted);
  const exact = items.find((i) => norm(i.name) === want);
  if (exact) return exact;
  const starts = items.find((i) => norm(i.name).startsWith(want));
  return starts || items[0] || null;
}

const results = [];
const problems = [];

for (const [year, name, tier] of PICKS) {
  try {
    const items = await search(name);
    const match = pickMatch(items, name);
    if (!match) {
      problems.push(`NOT FOUND        ${year}  ${name}`);
      continue;
    }

    await sleep(DELAY_MS);
    const d = await details(match.id);
    if (!d) {
      problems.push(`NO DETAILS       ${year}  ${name} (appid ${match.id})`);
      continue;
    }

    const released = d.release_date?.date || "";
    const gotYear = Number((released.match(/\b(19|20)\d{2}\b/) || [])[0]) || null;

    const displayName = DISPLAY_OVERRIDES[match.id] || d.name;

    if (norm(displayName) !== norm(name)) {
      problems.push(`NAME MISMATCH    ${year}  "${name}" -> "${d.name}" (appid ${match.id})`);
    }
    if (gotYear && gotYear !== year) {
      problems.push(`YEAR MISMATCH    want ${year}  got ${gotYear}  ${d.name}`);
    }

    results.push({
      slug: slugify(displayName),
      coverYear: year,
      tier,
      appid: match.id,
      name: displayName,
      steamName: d.name,
      developers: d.developers || [],
      publishers: d.publishers || [],
      releaseDate: released,
      releaseYear: gotYear,
      comingSoon: Boolean(d.release_date?.coming_soon),
      genres: (d.genres || []).map((g) => g.description),
      platforms: d.platforms || {},
      shortDescription: (d.short_description || "").trim(),
      storeUrl: `https://store.steampowered.com/app/${match.id}/`,
      type: d.type,
    });

    const flag = gotYear === year ? " " : "!";
    console.log(`${flag} ${year}  ${String(match.id).padStart(7)}  ${d.name}  (${released})`);
  } catch (err) {
    problems.push(`ERROR            ${year}  ${name}: ${err.message}`);
  }
  await sleep(DELAY_MS);
}

mkdirSync(resolve(root, "data"), { recursive: true });
writeFileSync(resolve(root, "data/game-picks.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");

console.log("");
console.log(`resolved ${results.length}/${PICKS.length}`);
const byYear = {};
results.forEach((r) => { byYear[r.coverYear] = (byYear[r.coverYear] || 0) + 1; });
console.log("per year:", Object.entries(byYear).map(([y, n]) => `${y}:${n}`).join("  "));

if (problems.length) {
  console.log("");
  console.log(`--- ${problems.length} problem(s) ---`);
  problems.forEach((p) => console.log(`  ${p}`));
} else {
  console.log("no problems.");
}
