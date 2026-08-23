import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const reviews = JSON.parse(
  fs.readFileSync(path.join(rootDir, "data", "reviews.json"), "utf8"),
).sort((left, right) => right.date.localeCompare(left.date));

/* Official press art, keyed by slug. Produced by scripts/fetch-press-art.mjs
   (pulls each game's own Steam store listing, already cited in that review's
   sources) then scripts/optimize-press-art.py. Missing entries fall back to the
   generated SVG cover, so the site still builds if the manifest is absent. */
const pressArtPath = path.join(rootDir, "data", "press-art.json");
const pressArt = fs.existsSync(pressArtPath)
  ? JSON.parse(fs.readFileSync(pressArtPath, "utf8"))
  : {};

const art = (review) => pressArt[review.slug] || null;

/** Attribution string for a game's imagery. Publisher is only named separately
    when it differs from the developer, which is the common indie case. */
const artCredit = (review) => {
  const a = art(review);
  if (!a) return null;
  const devs = (a.developers || []).join(", ");
  const pubs = (a.publishers || []).join(", ");
  if (devs && pubs && devs !== pubs) return `${devs} / ${pubs}`;
  return devs || pubs || review.studio;
};

const siteUrl = "https://psychobrosgames.github.io/";
const modifiedDate = "2026-08-22";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const escapeXml = escapeHtml;

const formatDate = (date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

const shortDate = (date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

const dadLabels = {
  "The Casual": "Dad Who Skipped the Tutorial",
  "The Tactician": "The Descent Guy",
  "The All-Rounder": "Normal-ish Dad",
};

const dadLabel = (name) => dadLabels[name] || name;

const hypeBand = (hype) => {
  if (hype >= 9) return "Group chat meltdown";
  if (hype >= 8.5) return "Snacks were abandoned";
  if (hype >= 8) return "Wishlisted immediately";
  if (hype >= 7.5) return "Solid dad approval";
  return "Cautious dad nodding";
};

const hypeTone = (hype) => (hype >= 8.5 ? "hot" : hype >= 7.8 ? "warm" : "cool");

const reviewYear = (review) => review.year || Number(String(review.date).slice(0, 4));

const tagSlug = (tag) =>
  String(tag)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** PAX write-ups score anticipation; everything else scores a game we finished.
    The chip label has to tell the truth about which one you are looking at. */
const isHype = (review) => review.scoreKind !== "verdict";
const scoreWord = (review) => (isHype(review) ? "hype" : "score");

const allYears = () => [...new Set(reviews.map(reviewYear))].sort((a, b) => b - a);

const reviewsInYear = (year) => reviews.filter((r) => reviewYear(r) === year);

/** Tags are free text in the data; this collects them for the browse pages. */
const allTags = () => {
  const counts = new Map();
  for (const review of reviews) {
    for (const tag of review.tags || []) {
      const slug = tagSlug(tag);
      const existing = counts.get(slug);
      if (existing) existing.count += 1;
      else counts.set(slug, { slug, label: tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

/** A tag page holding one review is thin content nobody wants to land on, so
    tags only earn a page once at least two reviews share them. */
const TAG_PAGE_MIN = 2;
const pagedTags = () => allTags().filter((t) => t.count >= TAG_PAGE_MIN);
const tagHasPage = (slug) => pagedTags().some((t) => t.slug === slug);

const reviewsWithTag = (slug) =>
  reviews.filter((r) => (r.tags || []).some((t) => tagSlug(t) === slug));

/* ---------------------------------------------------------------- chrome */

const brandMark = `
  <svg class="brand__mark" viewBox="0 0 40 40" aria-hidden="true">
    <rect x="1.5" y="8.5" width="37" height="23" rx="7.5" fill="var(--pb-blue)" />
    <path d="M9.5 20h7M13 16.5v7" stroke="#0b0d12" stroke-width="2.8" stroke-linecap="round" />
    <circle cx="26.5" cy="17.6" r="2.5" fill="#0b0d12" />
    <circle cx="31" cy="23" r="2.5" fill="#0b0d12" />
  </svg>`;

const themeToggle = `
  <button class="iconbtn" type="button" data-theme-toggle aria-label="Switch color theme">
    <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.4M12 19.2v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.4 12h2.4M19.2 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7" />
    </svg>
    <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.7 14.1A8 8 0 0 1 9.9 3.3 8.5 8.5 0 1 0 20.7 14.1Z" />
    </svg>
  </button>`;

const navLinks = (prefix) => [
  ["reviews", `${prefix}reviews/`, "Reviews"],
  ["years", `${prefix}years/`, "By Year"],
  ["crew", `${prefix}about/#crew`, "The Dads"],
  ["about", `${prefix}about/`, "About &amp; Press"],
];

const header = (prefix, active) => {
  const links = navLinks(prefix)
    .map(
      ([key, href, label]) =>
        `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`,
    )
    .join("\n          ");

  return `
    <header class="masthead" data-masthead>
      <div class="wrap masthead__inner">
        <a class="brand" href="${prefix}" aria-label="PsychoBros home">
          ${brandMark}
          <span class="brand__word">Psycho<em>Bros</em></span>
        </a>
        <nav class="masthead__nav" aria-label="Main navigation">
          ${links}
        </nav>
        <div class="masthead__actions">
          ${themeToggle}
          <button class="iconbtn burger" type="button" data-menu-toggle aria-expanded="false" aria-controls="mobile-nav" aria-label="Open navigation">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
      <nav class="mobilenav" id="mobile-nav" aria-label="Mobile navigation" aria-hidden="true" inert>
        ${links}
      </nav>
    </header>`;
};

/** A function, not a constant, so it reads `reviews` after module init rather
    than at declaration time. */
const ticker = () => {
  const years = allYears();
  return `
  <div class="ticker">
    <div class="wrap ticker__inner">
      <span><b>3</b> dads</span>
      <span><b>0</b> media training</span>
      <span><b>1</b> group chat that never sleeps</span>
      <span class="ticker__live"><i></i> Playing together since ${years[years.length - 1]}</span>
    </div>
  </div>`;
};

const footer = (prefix) => `
  <footer class="foot">
    <div class="wrap foot__grid">
      <div class="foot__brandcol">
        <a class="brand" href="${prefix}" aria-label="PsychoBros home">
          ${brandMark}
          <span class="brand__word">Psycho<em>Bros</em></span>
        </a>
        <p>Three dads in their forties reviewing games between school pickup and bedtime. One of us will not stop talking about Descent.</p>
      </div>
      <div class="foot__col">
        <h2>Read</h2>
        <a href="${prefix}reviews/">All reviews</a>
        <a href="${prefix}years/">Browse by year</a>
        <a href="${prefix}tags/pax-west-2025/">PAX West 2025</a>
      </div>
      <div class="foot__col">
        <h2>The boring bits</h2>
        <a href="${prefix}about/#crew">Meet the dads</a>
        <a href="${prefix}about/#standards">How we stay honest</a>
        <a href="${prefix}about/#press">Press &amp; partnerships</a>
      </div>
      <div class="foot__col">
        <h2>Elsewhere</h2>
        <a href="https://github.com/PsychoBrosGames" rel="noreferrer">GitHub</a>
        <a href="${prefix}about/#press">Get in touch</a>
      </div>
    </div>
    <div class="wrap foot__bottom">
      <p>&copy; <span data-year></span> PsychoBros. Built after the kids went to bed. Mostly.</p>
      <p class="foot__rights">Game screenshots and key art are official press assets belonging to their respective developers and publishers, used editorially. <a href="${prefix}about/#standards">Image policy</a>.</p>
      <a class="totop" href="#top">Back to top <span aria-hidden="true">&uarr;</span></a>
    </div>
  </footer>`;

/** Per-page social image. Review pages pass the game's own press screenshot,
    which shares far better than a generic site card; everything else falls back
    to the house card. */
const defaultSocialImage = {
  url: `${siteUrl}assets/psychobros-social-card.png`,
  width: 1200,
  height: 630,
  alt: "PsychoBros: game reviews from three dads",
};

const pageHead = ({
  title,
  description,
  canonical,
  prefix,
  type = "website",
  structuredData,
  socialImage = defaultSocialImage,
}) => `
  <head>
    <meta charset="UTF-8" />
    <script>
      (() => {
        document.documentElement.classList.add("js");
        const ok = new Set(["light", "dark"]);
        const saved = localStorage.getItem("psychobros-theme");
        const theme = (ok.has(saved) && saved) ||
          (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
        document.documentElement.setAttribute("data-theme", theme);
      })();
    </script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="theme-color" content="#0b0d12" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="PsychoBros" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${socialImage.url}" />
    <meta property="og:image:width" content="${socialImage.width}" />
    <meta property="og:image:height" content="${socialImage.height}" />
    <meta property="og:image:alt" content="${escapeHtml(socialImage.alt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${socialImage.url}" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${canonical}" />
    <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${prefix}styles.css" />
    ${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>` : ""}
  </head>`;

const pageShell = ({ head, body, prefix = "", active = "", bodyClass = "" }) => `<!doctype html>
<html lang="en">
${head}
  <body${bodyClass ? ` class="${bodyClass}"` : ""}>
    <a class="skip" href="#main">Skip to content</a>
    ${header(prefix, active)}
    ${body}
    ${footer(prefix)}
    <script src="${prefix}script.js"></script>
  </body>
</html>
`;

/* ------------------------------------------------------------ components */

const scoreChip = (review, size = "") =>
  `<span class="score${size ? ` score--${size}` : ""}" data-tone="${hypeTone(review.hype)}"><b>${review.hype.toFixed(1)}</b><i>${scoreWord(review)}</i></span>`;

/** Card/thumb imagery. Prefers official press art, falls back to the generated
    SVG cover for any game without a manifest entry. Alt stays empty because in
    every card context the title sits adjacent as real text. */
const cardArt = (review, prefix, sizes, variant = "cover") => {
  const a = art(review);
  const file = a && a[variant] ? a[variant] : null;
  const src = file ? `${prefix}${file}` : `${prefix}assets/reviews/${review.slug}.svg`;
  const [w, h] = variant === "thumb" ? [480, 270] : [1200, 675];
  return `<img src="${src}" alt="" loading="lazy" decoding="async" width="${w}" height="${h}"${sizes ? ` sizes="${sizes}"` : ""} />`;
};

const card = (review, prefix) => `
  <article class="card reveal"
    data-card
    data-title="${escapeHtml(review.title.toLowerCase())}"
    data-studio="${escapeHtml(review.studio.toLowerCase())}"
    data-genre="${escapeHtml(review.genre.toLowerCase())}"
    data-year="${reviewYear(review)}"
    data-tags="${escapeHtml((review.tags || []).map(tagSlug).join("|"))}">
    <a class="card__art" href="${prefix}reviews/${review.slug}/" tabindex="-1" aria-hidden="true">
      ${cardArt(review, prefix, "(max-width: 640px) 92vw, (max-width: 1080px) 44vw, 30vw")}
      ${scoreChip(review)}
    </a>
    <div class="card__body">
      <p class="card__meta"><span class="tag">${escapeHtml(review.genre)}</span><time datetime="${review.date}">${shortDate(review.date)}</time></p>
      <h3 class="card__title"><a href="${prefix}reviews/${review.slug}/">${escapeHtml(review.title)}</a></h3>
      <p class="card__take">${escapeHtml(review.dadTake)}</p>
      <p class="card__foot"><span>${escapeHtml(review.studio)}</span></p>
    </div>
  </article>`;

const railItem = (review, prefix) => `
  <a class="rail__item reveal" href="${prefix}reviews/${review.slug}/">
    <span class="rail__thumb">    ${cardArt(review, prefix, "120px", "thumb")}</span>
    <span class="rail__text">
      <span class="rail__meta">${escapeHtml(review.genre)} &middot; ${shortDate(review.date)}</span>
      <span class="rail__title">${escapeHtml(review.title)}</span>
      <span class="rail__take">${escapeHtml(review.dadTake)}</span>
    </span>
    <span class="rail__score" data-tone="${hypeTone(review.hype)}">${review.hype.toFixed(1)}</span>
  </a>`;

const listRow = (review, prefix, index) => `
  <a class="row reveal" href="${prefix}reviews/${review.slug}/">
    <span class="row__n">${String(index + 1).padStart(2, "0")}</span>
    <span class="row__thumb">    ${cardArt(review, prefix, "88px", "thumb")}</span>
    <span class="row__main">
      <span class="row__title">${escapeHtml(review.title)}</span>
      <span class="row__take">${escapeHtml(review.dadTake)}</span>
    </span>
    <span class="row__genre">${escapeHtml(review.genre)}</span>
    <time class="row__date" datetime="${review.date}">${shortDate(review.date)}</time>
    <span class="row__score" data-tone="${hypeTone(review.hype)}">${review.hype.toFixed(1)}</span>
  </a>`;

const sectionHead = ({ kicker, title, note, link }) => `
  <div class="sechead">
    <div class="sechead__text">
      <p class="kicker">${kicker}</p>
      <h2>${title}</h2>
      ${note ? `<p class="sechead__note">${note}</p>` : ""}
    </div>
    ${link ? `<a class="btn btn--ghost" href="${link[0]}">${link[1]} <span aria-hidden="true">&rarr;</span></a>` : ""}
  </div>`;

/* ------------------------------------------------------------------ home */

const homePage = () => {
  const featured = reviews.find((r) => r.featured) || reviews[0];
  const rest = reviews.filter((r) => r.slug !== featured.slug);
  // The rail sits beside the taller lead card, so it carries seven items to
  // keep both columns roughly the same height.
  const rail = rest.slice(0, 7);
  const grid = rest.slice(7, 15);
  const more = rest.slice(15, 19);
  const description =
    "Game reviews from three dads in their forties. A decade of AAA blockbusters and tiny indies, scored by how loud the group chat got.";

  return pageShell({
    active: "",
    bodyClass: "page-home",
    head: pageHead({
      title: "PsychoBros — Game reviews from three dads",
      description,
      canonical: siteUrl,
      prefix: "",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "PsychoBros",
        url: siteUrl,
        description,
        logo: `${siteUrl}assets/favicon.svg`,
        sameAs: ["https://github.com/PsychoBrosGames"],
      },
    }),
    body: `
      <main id="main">
        <span id="top"></span>
        ${ticker()}

        <section class="lead wrap" aria-label="Featured review">
          <article class="lead__main reveal">
            <a class="lead__art" href="reviews/${featured.slug}/" tabindex="-1" aria-hidden="true">
              <img src="${art(featured)?.cover ? art(featured).cover : `assets/reviews/${featured.slug}.svg`}" alt="" width="1200" height="675" fetchpriority="high" />
              ${scoreChip(featured, "lg")}
            </a>
            <div class="lead__copy">
              <p class="card__meta">
                <span class="tag tag--blue">Featured</span>
                <span class="tag">${escapeHtml(featured.genre)}</span>
                <time datetime="${featured.date}">${formatDate(featured.date)}</time>
              </p>
              <h1 class="lead__title"><a href="reviews/${featured.slug}/">${escapeHtml(featured.title)}</a></h1>
              <p class="lead__deck">${escapeHtml(featured.deck)}</p>
              <blockquote class="pullquote">
                <p>${escapeHtml(featured.dadTake)}</p>
                <cite>The group chat, 11:40pm</cite>
              </blockquote>
              <p class="lead__foot">
                <a class="btn btn--blue" href="reviews/${featured.slug}/">Read the review <span aria-hidden="true">&rarr;</span></a>
                <span class="byline">${escapeHtml(featured.studio)}</span>
              </p>
            </div>
          </article>

          <div class="rail">
            <p class="rail__head">Latest</p>
            ${rail.map((r) => railItem(r, "")).join("")}
            <a class="rail__all" href="reviews/">All ${reviews.length} reviews <span aria-hidden="true">&rarr;</span></a>
          </div>
        </section>

        <section class="wrap section" aria-labelledby="latest-title">
          ${sectionHead({
            kicker: "The reviews",
            title: '<span id="latest-title">Games we could not stop texting about</span>',
            note: "Ten years of games, mostly written up after bedtime. Some of these are twelve-quid indies. Some cost more than our first cars.",
            link: ["reviews/", "See all"],
          })}
          <div class="grid">
            ${grid.map((r) => card(r, "")).join("")}
          </div>
        </section>

        <section class="band" aria-labelledby="hype-title">
          <div class="wrap band__inner">
            <div class="band__copy reveal">
              <p class="kicker kicker--onblue">How the score works</p>
              <h2 id="hype-title">The Dad Hype Meter</h2>
              <p>It is a number out of ten for how hard a game hijacked our group chat. For the games we actually finished, that is our verdict and we will stand behind it. For the PAX West 2025 write-ups it is pure anticipation, and those are labelled so you know the difference. Nine and up means somebody stopped loading the dishwasher mid-cycle.</p>
              <a class="btn btn--ink" href="about/#standards">How we stay honest <span aria-hidden="true">&rarr;</span></a>
            </div>
            <ul class="scale reveal">
              <li><b data-tone="hot">9.0</b> <span>Group chat meltdown</span></li>
              <li><b data-tone="hot">8.5</b> <span>Snacks were abandoned</span></li>
              <li><b data-tone="warm">8.0</b> <span>Wishlisted immediately</span></li>
              <li><b data-tone="warm">7.5</b> <span>Solid dad approval</span></li>
              <li><b data-tone="cool">7.0</b> <span>Cautious dad nodding</span></li>
            </ul>
          </div>
        </section>

        <section class="wrap section" aria-labelledby="more-title">
          ${sectionHead({
            kicker: "Keep scrolling",
            title: '<span id="more-title">More from the back catalogue</span>',
            link: ["reviews/", "The full archive"],
          })}
          <div class="rows">
            ${more.map((r, i) => listRow(r, "", i)).join("")}
          </div>
        </section>

        <section class="wrap section" aria-labelledby="years-title">
          ${sectionHead({
            kicker: "Since 2015",
            title: '<span id="years-title">We have been doing this a while</span>',
            note: "Every year we have been playing together, and the games that survived the group chat.",
            link: ["years/", "All years"],
          })}
          <div class="yearstrip">
            ${allYears()
              .map(
                (y) =>
                  `<a class="yearstrip__item reveal" href="years/${y}/"><b>${y}</b><span>${reviewsInYear(y).length} reviews</span></a>`,
              )
              .join("")}
          </div>
        </section>

        <section class="wrap section" aria-labelledby="crew-title">
          ${sectionHead({
            kicker: "The tribunal",
            title: '<span id="crew-title">Every review gets three opinions</span>',
            note: "We each play differently, so we each review differently. Nobody has ever fully agreed on anything.",
            link: ["about/#crew", "Meet the dads"],
          })}
          <div class="crew">
            <article class="crew__card reveal">
              <p class="crew__n">01</p>
              <h3>Dad Who Skipped the Tutorial</h3>
              <p>Plays maybe four games a year and refuses to read a single tooltip. If he cannot work it out in ninety seconds, he decides that is the game's problem. Our onboarding canary.</p>
            </article>
            <article class="crew__card reveal">
              <p class="crew__n">02</p>
              <h3>The Descent Guy</h3>
              <p>Has opinions about six-degrees-of-freedom movement that predate two of his children. Will find the systems depth in anything, then compare it unfavourably to Descent.</p>
            </article>
            <article class="crew__card reveal">
              <p class="crew__n">03</p>
              <h3>Normal-ish Dad</h3>
              <p>The control group. Plays a reasonable amount, finishes about half of it, and is the only one of us who checks whether a game is still fun at hour three.</p>
            </article>
          </div>
        </section>
      </main>`,
  });
};

/* --------------------------------------------------------------- reviews */

const reviewsPage = () => {
  const years = allYears();
  // Curated rather than top-N: the raw leaders are all broad genre tags, which
  // makes for a duller filter row than tier + the show tag.
  const chipOrder = ["AAA", "Indie", "RPG", "Strategy", "PAX West 2025"];
  const tags = allTags();
  const chipTags = chipOrder.map((label) => tags.find((t) => t.label === label)).filter(Boolean);
  const description = `All ${reviews.length} PsychoBros reviews, ${years[years.length - 1]} to ${years[0]}, with a Dad Hype Meter score for each game.`;

  return pageShell({
    prefix: "../",
    active: "reviews",
    bodyClass: "page-archive",
    head: pageHead({
      title: "All reviews — PsychoBros",
      description,
      canonical: `${siteUrl}reviews/`,
      prefix: "../",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "PsychoBros reviews",
        url: `${siteUrl}reviews/`,
        description,
      },
    }),
    body: `
      <main id="main">
        <span id="top"></span>
        <section class="pagehead">
          <div class="wrap">
            <nav class="crumbs" aria-label="Breadcrumb"><a href="../">Home</a><span>/</span><span aria-current="page">Reviews</span></nav>
            <p class="kicker">The archive</p>
            <h1>All ${reviews.length} reviews</h1>
            <p class="pagehead__deck">Everything we have written up since ${years[years.length - 1]}, newest first. Search it, filter it, or just scroll until something looks weird enough to click.</p>
          </div>
        </section>

        <div class="wrap section">
          <div class="filters">
            <label class="field">
              <span class="visually-hidden">Search reviews</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
              <input type="search" data-search placeholder="Search by game, studio, genre, or year" autocomplete="off" />
            </label>
            <div class="chips" role="group" aria-label="Filter by tag">
              <button class="chip is-active" type="button" data-filter="all">All <b>${reviews.length}</b></button>
              ${chipTags
                .map(
                  (t) =>
                    `<button class="chip" type="button" data-filter="${t.slug}">${escapeHtml(t.label)} <b>${t.count}</b></button>`,
                )
                .join("\n              ")}
            </div>
          </div>
          <p class="resultline" data-result aria-live="polite"></p>
          <div class="grid" data-grid>
            ${reviews.map((r) => card(r, "../")).join("")}
          </div>
          <p class="empty" data-empty hidden>No games match that. The dads are as confused as you are.</p>
        </div>
      </main>`,
  });
};

/* ------------------------------------------------------------------- pax */

const tagPage = (tag) => {
  const list = reviewsWithTag(tag.slug);
  const description = `Every PsychoBros review tagged ${tag.label} — ${list.length} game${list.length === 1 ? "" : "s"}.`;

  return pageShell({
    prefix: "../../",
    active: "reviews",
    bodyClass: "page-archive",
    head: pageHead({
      title: `${tag.label} — PsychoBros`,
      description,
      canonical: `${siteUrl}tags/${tag.slug}/`,
      prefix: "../../",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${tag.label} reviews`,
        url: `${siteUrl}tags/${tag.slug}/`,
        description,
      },
    }),
    body: `
      <main id="main">
        <span id="top"></span>
        <section class="pagehead">
          <div class="wrap">
            <nav class="crumbs" aria-label="Breadcrumb"><a href="../../">Home</a><span>/</span><a href="../../reviews/">Reviews</a><span>/</span><span aria-current="page">${escapeHtml(tag.label)}</span></nav>
            <p class="kicker">Tag</p>
            <h1>${escapeHtml(tag.label)}</h1>
            <p class="pagehead__deck">${list.length} review${list.length === 1 ? "" : "s"} tagged ${escapeHtml(tag.label)}, newest first.</p>
          </div>
        </section>

        <div class="wrap section">
          <div class="grid">${list.map((r) => card(r, "../../")).join("")}</div>
        </div>
      </main>`,
  });
};

/* ----------------------------------------------------------------- years */

const yearsPage = () => {
  const years = allYears();
  const first = years[years.length - 1];
  const description = `Every PsychoBros review by year, ${first} to ${years[0]}.`;

  return pageShell({
    prefix: "../",
    active: "years",
    bodyClass: "page-archive",
    head: pageHead({
      title: "Reviews by year — PsychoBros",
      description,
      canonical: `${siteUrl}years/`,
      prefix: "../",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "PsychoBros reviews by year",
        url: `${siteUrl}years/`,
        description,
      },
    }),
    body: `
      <main id="main">
        <span id="top"></span>
        <section class="pagehead">
          <div class="wrap">
            <nav class="crumbs" aria-label="Breadcrumb"><a href="../">Home</a><span>/</span><span aria-current="page">By year</span></nav>
            <p class="kicker">The back catalogue</p>
            <h1>A decade of this</h1>
            <p class="pagehead__deck">We started playing together in ${first} and somehow never stopped. Here is every year since, and what we made time for.</p>
          </div>
        </section>

        <div class="wrap section">
          <div class="yearstrip">
            ${years
              .map(
                (y) =>
                  `<a class="yearstrip__item reveal" href="${y}/"><b>${y}</b><span>${reviewsInYear(y).length} reviews</span></a>`,
              )
              .join("")}
          </div>
        </div>

        ${years
          .map((year) => {
            const list = reviewsInYear(year);
            return `
        <section class="wrap section" aria-labelledby="y-${year}">
          ${sectionHead({
            kicker: `${list.length} review${list.length === 1 ? "" : "s"}`,
            title: `<span id="y-${year}">${year}</span>`,
            link: [`${year}/`, `All of ${year}`],
          })}
          <div class="rows">
            ${list.map((r, i) => listRow(r, "../", i)).join("")}
          </div>
        </section>`;
          })
          .join("")}
      </main>`,
  });
};

const yearPage = (year) => {
  const list = reviewsInYear(year);
  const years = allYears();
  const at = years.indexOf(year);
  const newer = years[at - 1];
  const older = years[at + 1];
  const description = `The ${list.length} game${list.length === 1 ? "" : "s"} PsychoBros reviewed in ${year}.`;

  return pageShell({
    prefix: "../../",
    active: "years",
    bodyClass: "page-archive",
    head: pageHead({
      title: `${year} reviews — PsychoBros`,
      description,
      canonical: `${siteUrl}years/${year}/`,
      prefix: "../../",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `PsychoBros reviews from ${year}`,
        url: `${siteUrl}years/${year}/`,
        description,
      },
    }),
    body: `
      <main id="main">
        <span id="top"></span>
        <section class="pagehead">
          <div class="wrap">
            <nav class="crumbs" aria-label="Breadcrumb"><a href="../../">Home</a><span>/</span><a href="../">By year</a><span>/</span><span aria-current="page">${year}</span></nav>
            <p class="kicker">The year in games</p>
            <h1>${year}</h1>
            <p class="pagehead__deck">${list.length} review${list.length === 1 ? "" : "s"} from ${year}, newest first.</p>
          </div>
        </section>

        <div class="wrap section">
          <div class="grid">${list.map((r) => card(r, "../../")).join("")}</div>
        </div>

        <div class="wrap section">
          <nav class="pager pager--three" aria-label="Other years">
            ${older ? `<a class="pager__link" href="../${older}/"><span>Earlier</span><strong>${older}</strong></a>` : `<span class="pager__link pager__link--empty"></span>`}
            <a class="pager__link pager__link--mid" href="../"><span>Browse</span><strong>All years</strong></a>
            ${newer ? `<a class="pager__link pager__link--next" href="../${newer}/"><span>Later</span><strong>${newer}</strong></a>` : `<span class="pager__link pager__link--empty"></span>`}
          </nav>
        </div>
      </main>`,
  });
};

/* ----------------------------------------------------------------- about */

const aboutPage = () => {
  const description =
    "Who the PsychoBros are, how we review games, and how to reach us about press access, review codes, and events.";

  return pageShell({
    prefix: "../",
    active: "about",
    bodyClass: "page-about",
    head: pageHead({
      title: "About & Press — PsychoBros",
      description,
      canonical: `${siteUrl}about/`,
      prefix: "../",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: "About PsychoBros",
        url: `${siteUrl}about/`,
        description,
      },
    }),
    body: `
      <main id="main">
        <span id="top"></span>
        <section class="pagehead">
          <div class="wrap">
            <nav class="crumbs" aria-label="Breadcrumb"><a href="../">Home</a><span>/</span><span aria-current="page">About &amp; Press</span></nav>
            <p class="kicker">About</p>
            <h1>Three dads, one group chat</h1>
            <p class="pagehead__deck">PsychoBros is a small independent games site run by three friends in their forties. We cover indie games, we write up what we actually think, and we are extremely normal about it.</p>
          </div>
        </section>

        <div class="wrap section prose prose--intro">
          <p>We started PsychoBros because our group chat had quietly turned into an unpaid, unedited games publication, and one of us finally said "we should probably put this somewhere." We have been playing together since 2015, back when two of us had no children and the third had one who could not yet operate a door handle. Between us we have three very different tolerances for tutorials and one ongoing argument about whether Descent peaked in 1995.</p>
          <p>These days we write up whatever we are actually playing — hundred-million-dollar blockbusters, twelve-quid indies, and the occasional thing nobody else on earth reviewed. In September 2025 we covered PAX West, which is still the largest single batch of games we have written up in one month.</p>
        </div>

        <section class="wrap section" id="crew" aria-labelledby="crew-heading">
          ${sectionHead({ kicker: "The crew", title: '<span id="crew-heading">Meet the dads</span>' })}
          <div class="crew crew--lg">
            <article class="crew__card reveal">
              <p class="crew__n">01</p>
              <h3>Dad Who Skipped the Tutorial</h3>
              <p class="crew__role">Accessibility &amp; first impressions</p>
              <p>Plays four, maybe five games a year and has never willingly read a tooltip. He is our early warning system for confusing onboarding, unreadable UI, and games that assume you already know the genre. If he bounces in the first ten minutes, we say so.</p>
            </article>
            <article class="crew__card reveal">
              <p class="crew__n">02</p>
              <h3>The Descent Guy</h3>
              <p class="crew__role">Systems &amp; mechanics</p>
              <p>The reason this site exists. Deep and slightly alarming knowledge of movement systems, level design and difficulty curves, anchored by a thirty-year relationship with Descent. He finds the mechanical idea at the centre of a game faster than anyone we know.</p>
            </article>
            <article class="crew__card reveal">
              <p class="crew__n">03</p>
              <h3>Normal-ish Dad</h3>
              <p class="crew__role">The control group</p>
              <p>Plays a healthy amount, finishes roughly half of it, and owns the only functioning sense of proportion in the building. When the other two spiral, he asks the question that actually matters: is this still fun three hours in?</p>
            </article>
          </div>
        </section>

        <section class="wrap section" id="standards" aria-labelledby="standards-heading">
          ${sectionHead({ kicker: "Editorial", title: '<span id="standards-heading">How we stay honest</span>' })}
          <ol class="standards">
            <li>
              <h3>We say what every review is based on</h3>
              <p>Each review carries a plain-language basis note. Most of our reviews are written after we have played the game, and they say so. Our PAX West 2025 write-ups are the exception: those are retrospective mini-reviews built from the official PAX West 2025 Steam event page, the PAX Rising Showcase listing, and each game's own published materials. They are not final-release reviews and they never claim hands-on time we did not have.</p>
            </li>
            <li>
              <h3>The Dad Hype Meter tells you which kind of score it is</h3>
              <p>The number on each review measures how much a game took over our group chat. On a game we played, that is our verdict. On the PAX West 2025 entries it is anticipation, clearly labelled as anticipation. We are not going to hand out review scores for games we have not played.</p>
            </li>
            <li>
              <h3>Three perspectives, no forced consensus</h3>
              <p>Every write-up is read through all three of us and we publish the places we disagree. A game that works brilliantly for one dad and loses another is more useful than an averaged shrug.</p>
            </li>
            <li>
              <h3>Sources are linked, always</h3>
              <p>Every review lists the sources it draws on so you can check our work. If we get something wrong, tell us and we will correct it in place with a note explaining what changed.</p>
            </li>
            <li>
              <h3>Game images belong to the people who made them</h3>
              <p>Screenshots and key art on this site are the official press assets published by each game's developer on its own Steam store listing, used editorially alongside our coverage of that specific game. Every image is credited to its developer and publisher where it appears, and links back to the source listing. We do not alter artwork beyond cropping and resizing it to fit the page. If you made one of these games and would rather we used different images, or none at all, email us and it is done the same day.</p>
            </li>
            <li>
              <h3>We disclose anything we are given</h3>
              <p>Review codes, event access, travel, hardware, snacks. If somebody gives us something, it goes in the disclosure line on that piece. Nobody has offered yet, but we are ready.</p>
            </li>
          </ol>
        </section>

        <section class="wrap section" id="press" aria-labelledby="press-heading">
          ${sectionHead({ kicker: "Press", title: '<span id="press-heading">Press &amp; partnerships</span>' })}
          <div class="presskit">
            <article class="presskit__card">
              <h3>What we cover</h3>
              <p>Everything, honestly. Big-budget releases, indies, and mid-size games across PC and console, with a bias toward interesting mechanical ideas and anything a busy adult can pick up in short sessions. Strategy, tactics, roguelites, immersive sims and well-made weird stuff.</p>
            </article>
            <article class="presskit__card">
              <h3>What we produce</h3>
              <p>Written reviews and collections, three-perspective breakdowns, show coverage and commentary. Streaming and video are in progress. Everything is published here first.</p>
            </article>
            <article class="presskit__card">
              <h3>Review codes &amp; events</h3>
              <p>We accept review codes and event access, and we disclose every one of them. We will always tell you honestly whether a game is a fit for our audience before you send anything over.</p>
            </article>
            <article class="presskit__card">
              <h3>Get in touch</h3>
              <p>The fastest route is <a href="https://github.com/PsychoBrosGames" rel="noreferrer">github.com/PsychoBrosGames</a>. Publicists and event organisers: mention the show or title in the first line and one of us will reply, usually after bedtime.</p>
            </article>
          </div>
          <div class="note note--blue">
            <h2>Quick facts for your media list</h2>
            <ul class="facts">
              <li><b>Outlet</b> PsychoBros</li>
              <li><b>Founded</b> 2015</li>
              <li><b>Team</b> Three writers</li>
              <li><b>Focus</b> AAA, indie &amp; everything between</li>
              <li><b>Format</b> Reviews, collections, commentary</li>
              <li><b>Published</b> ${reviews.length} reviews to date</li>
            </ul>
          </div>
        </section>
      </main>`,
  });
};

/* ------------------------------------------------------------ review page */

const reviewPage = (review, index) => {
  const previous = reviews[index - 1];
  const next = reviews[index + 1];
  const related = reviews.filter((r) => r.slug !== review.slug).slice(0, 3);
  const description = `${review.deck} A PsychoBros review of ${review.title} by ${review.studio}.`;

  return pageShell({
    prefix: "../../",
    active: "reviews",
    bodyClass: "page-review",
    head: pageHead({
      title: `${review.title} review — PsychoBros`,
      description,
      canonical: `${siteUrl}reviews/${review.slug}/`,
      prefix: "../../",
      type: "article",
      socialImage: art(review)?.cover
        ? {
            url: `${siteUrl}${art(review).cover}`,
            width: 1200,
            height: 675,
            alt: `Screenshot from ${review.title}`,
          }
        : defaultSocialImage,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: `${review.title} review`,
        description,
        datePublished: review.date,
        dateModified: review.date,
        url: `${siteUrl}reviews/${review.slug}/`,
        image: `${siteUrl}${art(review)?.cover || `assets/reviews/${review.slug}.svg`}`,
        author: { "@type": "Organization", name: "PsychoBros" },
        publisher: {
          "@type": "Organization",
          name: "PsychoBros",
          logo: { "@type": "ImageObject", url: `${siteUrl}assets/favicon.svg` },
        },
        about: { "@type": "VideoGame", name: review.title, genre: review.genre },
      },
    }),
    body: `
      <main id="main">
        <span id="top"></span>
        <article class="article">
          <header class="pagehead pagehead--article">
            <div class="wrap">
              <nav class="crumbs" aria-label="Breadcrumb">
                <a href="../../">Home</a><span>/</span><a href="../">Reviews</a><span>/</span><span aria-current="page">${escapeHtml(review.title)}</span>
              </nav>
              <p class="kicker">${escapeHtml((review.tags && review.tags[0]) || review.genre)}</p>
              <h1>${escapeHtml(review.title)}</h1>
              <p class="pagehead__deck">${escapeHtml(review.deck)}</p>
              <div class="byline byline--article">
                <span>By <b>PsychoBros</b></span>
                <time datetime="${review.date}">${formatDate(review.date)}</time>
                <span>${escapeHtml(review.studio)}</span>
              </div>
            </div>
          </header>

          <div class="wrap article__hero reveal">
            <figure class="article__figure">
              <img class="article__cover" src="${art(review)?.cover ? `../../${art(review).cover}` : `../../assets/reviews/${review.slug}.svg`}" alt="Screenshot from ${escapeHtml(review.title)}" width="1200" height="675" fetchpriority="high" />
              ${
                artCredit(review)
                  ? `<figcaption class="article__credit">Press image courtesy of ${escapeHtml(artCredit(review))}. Sourced from the game's <a href="${art(review).storeUrl}" rel="noopener">official Steam listing</a>.</figcaption>`
                  : `<figcaption class="article__credit">Original PsychoBros artwork.</figcaption>`
              }
            </figure>
            <div class="article__aside">
              <div class="article__scorecard">
                <p class="kicker">Dad Hype Meter</p>
                <p class="article__score" data-tone="${hypeTone(review.hype)}">${review.hype.toFixed(1)}<i>/10</i></p>
                <p class="article__band">${hypeBand(review.hype)}</p>
                <p class="article__scorenote">${
                  isHype(review)
                    ? "An anticipation score, not a play-tested verdict."
                    : "Our verdict, after we actually played the thing."
                } <a href="../../about/#standards">How this works</a></p>
              </div>
              ${
                art(review)?.keyArt
                  ? `<figure class="keyart">
                <h2 class="kicker">Official key art</h2>
                <img src="../../${art(review).keyArt}" alt="Official key art for ${escapeHtml(review.title)}" width="460" height="215" loading="lazy" decoding="async" />
                <figcaption>&copy; ${escapeHtml(artCredit(review))}</figcaption>
              </figure>`
                  : ""
              }
            </div>
          </div>

          <div class="wrap article__grid">
            <aside class="article__side">
              <div class="specs">
                <h2 class="kicker">The basics</h2>
                <dl>
                  <div><dt>Developer</dt><dd>${escapeHtml(review.studio)}</dd></div>
                  <div><dt>Genre</dt><dd>${escapeHtml(review.genre)}</dd></div>
                  <div><dt>Platforms</dt><dd>${escapeHtml(review.platforms)}</dd></div>
                  ${review.statusAtShow ? `<div><dt>At the show</dt><dd>${escapeHtml(review.statusAtShow)}</dd></div>` : ""}
                  <div><dt>Reviewed</dt><dd><a href="../../years/${reviewYear(review)}/">${reviewYear(review)}</a></dd></div>
                </dl>
              </div>
              ${
                (review.tags || []).length
                  ? `<div class="specs">
                <h2 class="kicker">Tagged</h2>
                <p class="taglist">${review.tags
                  .map((t) =>
                    tagHasPage(tagSlug(t))
                      ? `<a class="tag" href="../../tags/${tagSlug(t)}/">${escapeHtml(t)}</a>`
                      : `<span class="tag">${escapeHtml(t)}</span>`,
                  )
                  .join("")}</p>
              </div>`
                  : ""
              }
              <div class="specs">
                <h2 class="kicker">Dad consensus</h2>
                <dl>
                  ${review.lenses
                    .map(
                      (l) =>
                        `<div><dt>${escapeHtml(dadLabel(l.name))}</dt><dd>${escapeHtml(l.signal)}</dd></div>`,
                    )
                    .join("")}
                </dl>
              </div>
            </aside>

            <div class="article__body">
              <div class="verdict reveal">
                <p class="kicker">The thirty-second version</p>
                <h2>${escapeHtml(review.verdictTitle)}</h2>
                <p class="verdict__joke">${escapeHtml(review.dadTake)}</p>
                <p>${escapeHtml(review.verdict)}</p>
              </div>

              <section class="prose reveal" aria-labelledby="what-title">
                <h2 id="what-title">Okay, what is this thing?</h2>
                ${review.overview.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
              </section>

              ${
                (art(review)?.gallery || []).length
                  ? `<figure class="shots reveal">
                <div class="shots__grid">
                  ${art(review)
                    .gallery.map(
                      (g, i) =>
                        `<img src="../../${g}" alt="Screenshot ${i + 2} from ${escapeHtml(review.title)}" width="800" height="450" loading="lazy" decoding="async" />`,
                    )
                    .join("")}
                </div>
                <figcaption>Press screenshots courtesy of ${escapeHtml(artCredit(review))}.</figcaption>
              </figure>`
                  : ""
              }

              <section class="reveal" aria-labelledby="why-title">
                <h2 class="h-rule" id="why-title">Why it escaped the group chat</h2>
                <ul class="checklist">
                  ${review.facts.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
                </ul>
              </section>

              <section class="reveal" aria-labelledby="tribunal-title">
                <h2 class="h-rule" id="tribunal-title">Three dads enter</h2>
                <div class="tribunal">
                  ${review.lenses
                    .map(
                      (l, i) => `
                  <article class="tribunal__item">
                    <p class="tribunal__n">0${i + 1}</p>
                    <div>
                      <p class="tribunal__who">${escapeHtml(dadLabel(l.name))}</p>
                      <h3>${escapeHtml(l.headline)}</h3>
                      <p>${escapeHtml(l.body)}</p>
                    </div>
                  </article>`,
                    )
                    .join("")}
                </div>
              </section>

              <section class="reveal" aria-labelledby="fit-title">
                <h2 class="visually-hidden" id="fit-title">Who it is for and what to watch</h2>
                <div class="fit">
                  <div class="fit__col fit__col--yes">
                    <h3>Invite these people</h3>
                    <ul>${review.bestFor.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
                  </div>
                  <div class="fit__col fit__col--watch">
                    <h3>Dad caveats</h3>
                    <ul>${review.watchFor.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
                  </div>
                </div>
              </section>

              <section class="receipts reveal" aria-labelledby="receipts-title">
                <h2 class="kicker" id="receipts-title">Receipts</h2>
                <p>${escapeHtml(review.reviewBasis)}</p>
                <ul>
                  ${review.sources
                    .map(
                      (s) =>
                        `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.label)}</a></li>`,
                    )
                    .join("")}
                </ul>
              </section>
            </div>
          </div>

          <nav class="wrap pager" aria-label="More reviews">
            ${
              previous
                ? `<a class="pager__link" href="../${previous.slug}/"><span>&larr; Newer</span><strong>${escapeHtml(previous.title)}</strong></a>`
                : '<span class="pager__link pager__link--empty"></span>'
            }
            ${
              next
                ? `<a class="pager__link pager__link--next" href="../${next.slug}/"><span>Older &rarr;</span><strong>${escapeHtml(next.title)}</strong></a>`
                : '<span class="pager__link pager__link--empty"></span>'
            }
          </nav>

          <section class="wrap section" aria-labelledby="related-title">
            ${sectionHead({
              kicker: "Keep going",
              title: '<span id="related-title">More reviews</span>',
              link: ["../", "All 20"],
            })}
            <div class="grid">${related.map((r) => card(r, "../../")).join("")}</div>
          </section>
        </article>
      </main>`,
  });
};

/* ------------------------------------------------------------- cover art */

const BLUE = "#4d9dff";
const CYAN = "#3ddceb";
const INK = "#0b0d12";
const INK_2 = "#161c27";
const PAPER = "#eef1f7";

const reviewCover = (review, index) => {
  const seed = [...review.slug].reduce((total, character) => total + character.charCodeAt(0), 0);
  const variant = seed % 6;
  const cyanLed = Math.floor(seed / 6) % 2 === 0;
  const hero = cyanLed ? CYAN : BLUE;
  const support = cyanLed ? BLUE : CYAN;
  const id = review.slug.replace(/[^a-z0-9]/g, "");
  // Small deterministic jitter so no two covers line up pixel for pixel.
  const jitter = (seed % 7) * 9 - 27;

  let art;
  if (variant === 0) {
    art = `
    <circle cx="${600 + jitter}" cy="300" r="214" fill="none" stroke="${hero}" stroke-width="18"/>
    <circle cx="${600 + jitter}" cy="300" r="140" fill="none" stroke="${hero}" stroke-width="11" opacity="0.5"/>
    <circle cx="${600 + jitter}" cy="300" r="68" fill="${hero}"/>
    <path d="M150 512h900" stroke="${support}" stroke-width="9"/>
    <circle cx="906" cy="126" r="24" fill="${support}"/>
    <circle cx="288" cy="150" r="12" fill="${support}" opacity="0.6"/>`;
  } else if (variant === 1) {
    art = [0, 1, 2, 3, 4, 5, 6, 7, 8]
      .map(
        (i) =>
          `<path d="M${292 + i * 96 + jitter} 0 L${420 + i * 96 + jitter} 0 L${196 + i * 96 + jitter} 675 L${68 + i * 96 + jitter} 675 Z" fill="${i % 2 ? support : hero}" opacity="${i % 2 ? 0.28 : 0.85}"/>`,
      )
      .join("\n    ");
  } else if (variant === 2) {
    const dots = [0, 1, 2, 3]
      .map((r) =>
        [0, 1, 2, 3, 4, 5, 6, 7, 8]
          .map((c) => `<circle cx="${168 + c * 108}" cy="${104 + r * 62}" r="8"/>`)
          .join(""),
      )
      .join("");
    art = `
    <path d="M304 596 A 296 296 0 0 1 896 596" fill="none" stroke="${hero}" stroke-width="26"/>
    <path d="M396 596 A 204 204 0 0 1 804 596" fill="none" stroke="${support}" stroke-width="13" opacity="0.72"/>
    <g fill="${hero}" opacity="0.5">${dots}</g>`;
  } else if (variant === 3) {
    art = `
    <path d="M0 0 L742 0 L0 470 Z" fill="${hero}" opacity="0.9"/>
    <path d="M1200 675 L1200 214 L560 675 Z" fill="${support}" opacity="0.42"/>
    <path d="M${470 + jitter} 236 L${906 + jitter} 236 L${688 + jitter} 552 Z" fill="none" stroke="${hero}" stroke-width="16"/>
    <circle cx="1020" cy="150" r="34" fill="${support}"/>`;
  } else if (variant === 4) {
    art = `
    <rect x="${420 + jitter}" y="118" width="360" height="360" fill="none" stroke="${hero}" stroke-width="18" transform="rotate(45 ${600 + jitter} 298)"/>
    <rect x="${500 + jitter}" y="198" width="200" height="200" fill="${support}" opacity="0.32" transform="rotate(45 ${600 + jitter} 298)"/>
    <rect x="${560 + jitter}" y="258" width="80" height="80" fill="${hero}" transform="rotate(45 ${600 + jitter} 298)"/>
    <path d="M96 604h1008" stroke="${support}" stroke-width="10" opacity="0.8"/>`;
  } else {
    const bars = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      .map((i) => {
        const height = 88 + ((seed + i * 37) % 11) * 38;
        return `<rect x="${152 + i * 78}" y="${520 - height}" width="46" height="${height}" fill="${i % 3 === 0 ? support : hero}" opacity="${i % 3 === 0 ? 0.55 : 0.92}"/>`;
      })
      .join("\n    ");
    art = `
    ${bars}
    <path d="M120 556h960" stroke="${hero}" stroke-width="8" opacity="0.5"/>`;
  }

  const tagWidth = 118 + String(index + 1).padStart(2, "0").length * 11;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-labelledby="t-${id}">
  <title id="t-${id}">${escapeXml(review.title)} artwork</title>
  <defs>
    <linearGradient id="bg-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${INK_2}"/>
      <stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <radialGradient id="fade-${id}" cx="0.5" cy="0.46" r="0.78">
      <stop offset="0.45" stop-color="${INK}" stop-opacity="0"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0.82"/>
    </radialGradient>
    <pattern id="grid-${id}" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="${PAPER}" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="675" fill="url(#bg-${id})"/>
  <rect width="1200" height="675" fill="url(#grid-${id})"/>
  <g>
    ${art}
  </g>
  <rect width="1200" height="675" fill="url(#fade-${id})"/>
  <rect y="659" width="1200" height="16" fill="${hero}"/>
  <rect x="64" y="54" width="${tagWidth}" height="34" fill="${hero}"/>
  <text x="78" y="78" fill="${INK}" font-family="'Arial Black',Arial,sans-serif" font-size="17" font-weight="900" letter-spacing="2.5">REVIEW ${String(index + 1).padStart(2, "0")}</text>
</svg>
`;
};

/* ------------------------------------------------------------------ emit */

const writeFile = (relativePath, contents) => {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};

/** The PAX collection had its own published URL before it became a tag. Old
    links stay alive rather than 404ing. */
const redirectPage = (target, label, canonical) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(label)} — PsychoBros</title>
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="noindex, follow" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body>
    <main id="main" class="wrap section">
      <p>This collection is a tag now. <a href="${target}">Continue to ${escapeHtml(label)}</a>.</p>
    </main>
  </body>
</html>
`;

writeFile("index.html", homePage());
writeFile("reviews/index.html", reviewsPage());
writeFile("about/index.html", aboutPage());
writeFile("years/index.html", yearsPage());

allYears().forEach((year) => {
  writeFile(`years/${year}/index.html`, yearPage(year));
});

pagedTags().forEach((tag) => {
  writeFile(`tags/${tag.slug}/index.html`, tagPage(tag));
});
writeFile(
  "pax-west-2025/index.html",
  redirectPage("../tags/pax-west-2025/", "PAX West 2025", `${siteUrl}tags/pax-west-2025/`),
);

reviews.forEach((review, index) => {
  writeFile(`reviews/${review.slug}/index.html`, reviewPage(review, index));
  writeFile(`assets/reviews/${review.slug}.svg`, reviewCover(review, index));
});

const urls = [
  { loc: siteUrl, priority: "1.0" },
  { loc: `${siteUrl}reviews/`, priority: "0.9" },
  { loc: `${siteUrl}years/`, priority: "0.8" },
  { loc: `${siteUrl}about/`, priority: "0.7" },
  ...allYears().map((year) => ({
    loc: `${siteUrl}years/${year}/`,
    priority: "0.6",
  })),
  ...pagedTags().map((tag) => ({
    loc: `${siteUrl}tags/${tag.slug}/`,
    priority: "0.5",
  })),
  ...reviews.map((review) => ({
    loc: `${siteUrl}reviews/${review.slug}/`,
    priority: "0.6",
    lastmod: review.date,
  })),
];

writeFile(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod || modifiedDate}</lastmod>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`,
);

console.log(`Built ${reviews.length} reviews across ${urls.length} pages.`);
