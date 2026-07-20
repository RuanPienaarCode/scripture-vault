// Builds "Bible Search.html" from the vault's full-text chapter notes.
// Usage: node build-bible-search.js "<vault root>" "<template path>" "<output path>"
const fs = require("fs");
const path = require("path");

const [, , VAULT, TEMPLATE, OUT] = process.argv;

const ORDER = [
  "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth",
  "1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra",
  "Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Songs",
  "Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos",
  "Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah",
  "Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians",
  "2 Corinthians","Galatians","Ephesians","Philippians","Colossians",
  "1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon",
  "Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude",
  "Revelation"
];
/* Which translations exist is detected, not hardcoded — see tools/lib/translations.js. */
const { detectTranslations } = require("../tools/lib/translations.js");

const TRANS = detectTranslations(VAULT);
if (!TRANS.length) {
  console.error(`No translations found under ${path.join(VAULT, "Bible")}.`);
  console.error(`A translation is a folder of canonical book folders, e.g. Bible/BSB/Ruth/.`);
  console.error(`Import one:  node tools/import-bible.js . BSB`);
  process.exit(1);
}
const VERSE_RE = /^\*\*(\d+)\*\*\s*(.*?)\s*\^(\d+)\s*$/;

const data = {};
const problems = [];

for (const t of TRANS) {
  const rows = [];
  for (let bi = 0; bi < ORDER.length; bi++) {
    const book = ORDER[bi];
    const dir = path.join(VAULT, "Bible", t, book);
    if (!fs.existsSync(dir)) { problems.push(`${t}: missing book folder ${book}`); continue; }
    // collect chapter files, sorted numerically
    const chapters = fs.readdirSync(dir)
      .map(f => {
        // "Ruth 1.md" (anchor translation) or "Ruth 1 (BSB).md" — any suffix
        const m = f.match(/^(.+?)\s(\d+)(?:\s\([A-Za-z0-9]+\))?\.md$/);
        return m && m[1] === book ? { file: f, ch: +m[2] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.ch - b.ch);
    if (!chapters.length) { problems.push(`${t}: no chapter files in ${book}`); continue; }
    for (const { file, ch } of chapters) {
      const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
      let count = 0;
      for (const line of lines) {
        const m = line.match(VERSE_RE);
        if (!m) continue;
        const text = m[2].replace(/\s+/g, " ").trim();
        if (text) { rows.push([bi, ch, +m[1], text]); count++; }
      }
      if (!count) problems.push(`${t}: no verses parsed in ${book} ${ch} (${file})`);
    }
  }
  data[t] = rows;
  console.log(`${t}: ${rows.length.toLocaleString()} verses`);
}

/* ── Articles ─────────────────────────────────────────────────── */
// [ title, author, date, topics, excerpt, path(vault-relative, no .md), sourceUrl, bodyText, source ]
// Every .md under Teaching/ is an article except hub/index notes. The source label is the folder
// directly under Teaching/ ("Example Ministry", "Desiring God", …), so a new ministry becomes
// searchable by dropping its folder in — no code change here.
function fmValue(fm, key){
  const m = fm.match(new RegExp("^" + key + ':\\s*"?(.*?)"?\\s*$', "m"));
  return m ? m[1].trim() : "";
}
function fmList(fm, key){
  // supports both inline "[a, b]" and YAML block "  - a"
  const inline = fm.match(new RegExp("^" + key + ":\\s*\\[(.*)\\]\\s*$", "m"));
  if (inline) return inline[1].split(",").map(s => s.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  const block = fm.match(new RegExp("^" + key + ":\\s*\\n((?:\\s*-\\s*.*\\n?)+)", "m"));
  if (block) return block[1].split("\n").map(l => l.replace(/^\s*-\s*/, "").replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  return [];
}
// Convert an article's markdown body to clean reading paragraphs (joined by "\n").
// Drops the breadcrumb + excerpt callout, keeps prose and headings, strips md syntax.
function toParagraphs(body){
  const clean = s => s
    .replace(/\[+\d+\]+\(#_?ftn[a-z0-9]*\)/gi, "")    // footnote markers [[1]](#_ftn1)
    .replace(/!\[\[[^\]]*\]\]/g, "")                  // embeds
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")   // wikilinks → text
    .replace(/\[([^\]]*)\]\((?:\\.|[^)\\])*\)/g, "$1") // md links → text (url may contain \( \))
    .replace(/[*_`]/g, "")                            // emphasis marks
    .replace(/\s+/g, " ").trim();
  const lines = body.split("\n");
  const paras = [];
  let buf = [], inCallout = false;
  const flush = () => { if (buf.length){ const p = clean(buf.join(" ")); if (p) paras.push(p); buf = []; } };
  for (const line of lines){
    const t = line.trim();
    if (t === ""){ inCallout = false; flush(); continue; }
    if (/^Part of\b/.test(t)) continue;                       // breadcrumb line
    if (/^#\s+/.test(t)){ flush(); continue; }                // H1 = article title, already shown — drop
    if (/^#{2,6}\s+/.test(t)){ flush(); const h = clean(t.replace(/^#{2,6}\s+/, "")); if (h) paras.push(h); continue; }
    if (/^>\s*\[!/.test(t)){ inCallout = true; continue; }     // callout header → skip its block
    if (inCallout){ if (/^>/.test(t)) continue; inCallout = false; }
    buf.push(t.replace(/^>\s?/, ""));                         // keep blockquote prose as normal text
  }
  flush();
  return paras;
}

// every .md under a directory, depth-first, name-sorted. README notes document a folder —
// they aren't content, so they never reach the index.
function walkMd(dir){
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))){
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p));
    else if (e.name.endsWith(".md") && !/^readme\.md$/i.test(e.name)) out.push(p);
  }
  return out;
}
// hub/index notes list other notes — they aren't articles themselves
function isHub(fm){
  return /^type:\s*\S*hub\b/mi.test(fm) || fmList(fm, "tags").some(t => t === "hub" || t.endsWith("/hub"));
}
const firstHeading = body => (body.match(/^#\s+(.+)$/m) || [, ""])[1].trim();
const firstUrl = body => (body.match(/\((https?:\/\/[^)\s]+)\)/) || [, ""])[1];
// Only http(s) source URLs are kept — a frontmatter `source: "javascript:…"` would
// otherwise reach an href in the same-origin search page. The template's safeUrl()
// is the second line of defence; this stops it entering the payload at all.
const safeUrl = u => (/^https?:\/\//i.test(u || "") ? u : "");

const ARTICLES = [];
const teachDir = path.join(VAULT, "Teaching");
if (fs.existsSync(teachDir)) {
  const counts = {};
  for (const abs of walkMd(teachDir)) {
    const rel = path.relative(VAULT, abs).split(path.sep).join("/");
    const source = rel.split("/")[1] || "Teaching";       // folder directly under Teaching/
    const raw = fs.readFileSync(abs, "utf8");
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const fm = fmMatch ? fmMatch[1] : "";                 // no frontmatter is fine — infer below
    const bodyRaw = fmMatch ? fmMatch[2] : raw;
    if (isHub(fm)) continue;

    const paras = toParagraphs(bodyRaw);
    if (!paras.length) { problems.push(`${source}: no readable body in ${rel}`); continue; }

    const tagTopics = fmList(fm, "tags")
      .map(t => (t.startsWith("topic/") ? t.slice(6).replace(/-/g, " ") : t))
      .filter(t => !t.includes("/") && !/^(article|hub|devotional|teaching)$/i.test(t));
    const topics = (fmList(fm, "topics").length ? fmList(fm, "topics") : tagTopics).slice(0, 6).join(", ");

    ARTICLES.push([
      fmValue(fm, "title") || firstHeading(bodyRaw) || path.basename(rel, ".md"),
      fmValue(fm, "author"),          // may be blank — the source badge already names the ministry
      fmValue(fm, "date"),
      topics,
      fmValue(fm, "excerpt") || paras[0].slice(0, 240),
      rel.replace(/\.md$/, ""),
      safeUrl(fmValue(fm, "source") || firstUrl(bodyRaw)),
      paras.join("\n"),
      source,
    ]);
    counts[source] = (counts[source] || 0) + 1;
  }
  const summary = Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(" · ");
  console.log(`Articles: ${ARTICLES.length} (${summary})`);
} else {
  problems.push("Teaching folder not found — search will be Bible-only");
}

if (problems.length) {
  console.log(`\n${problems.length} problems:`);
  problems.slice(0, 20).forEach(p => console.log("  - " + p));
  if (problems.length > 20) console.log(`  … and ${problems.length - 20} more`);
}

const enc = s => s.replace(/</g, "\\u003c"); // never break out of <script>

/* ── payload emission ─────────────────────────────────────────────
   The verse text is ~17 MB. Inlined as `const DATA = {…}` the JS engine had to
   parse the whole object literal at boot — to read the one translation you're
   actually looking at. Instead each payload goes in its own
   <script type="application/json">, which the JS engine never parses at all: the
   HTML parser treats it as a text node, and the page JSON.parse()s a translation
   on first use (see D() / A() in the template). Boot cost becomes the ~40 KB
   shell. This is what makes the page usable on a phone.
   enc() has already escaped every "<" as < — a valid JSON escape — so the
   emitted text contains no literal "<" and can't terminate the script tag. */
const dataScripts = [
  ...TRANS.map(t => `<script type="application/json" id="bd-${t}">${enc(JSON.stringify(data[t]))}<\/script>`),
  `<script type="application/json" id="ad">${enc(JSON.stringify(ARTICLES))}<\/script>`,
].join("\n");

/* STRUCT — max chapter per book, max verse per chapter, across all translations.
   The template used to derive this at boot by scanning all 124k rows, which alone
   forced every translation to load. Precomputed here it costs ~30 KB and no scan. */
const STRUCT = ORDER.map(() => ({ maxCh: 0, ch: {} }));
for (const t of TRANS) {
  for (const r of data[t]) {
    const b = STRUCT[r[0]];
    if (r[1] > b.maxCh) b.maxCh = r[1];
    if (!b.ch[r[1]] || r[2] > b.ch[r[1]]) b.ch[r[1]] = r[2];
  }
}

const books = JSON.stringify(ORDER);
const generated = new Date().toISOString().slice(0, 10);

/* ── translation-dependent UI ─────────────────────────────────────
   Built from the detected set so the page never advertises a translation the
   vault doesn't have. "All four" becomes "All N"; with one translation the
   picker is pointless, so it's dropped entirely. */
const DEFAULT_TRANS = TRANS[0];
const transMenu = TRANS
  .map(t => `        <button role="menuitemradio" data-t="${t}" aria-checked="${t === DEFAULT_TRANS}">${t}</button>`)
  .concat(TRANS.length > 1
    ? [`        <button role="menuitemradio" data-t="ALL" aria-checked="false">All ${TRANS.length}</button>`]
    : [])
  .join("\n");
const transList = TRANS.length === 1
  ? `the ${TRANS[0]} text`
  : `${TRANS.length} translations — ${TRANS.join(", ")}`;

let html = fs.readFileSync(TEMPLATE, "utf8");
html = html.replace("__DATA_SCRIPTS__", () => dataScripts)
           .replace("__BOOKS__", () => books)
           .replace("__TRANS__", () => JSON.stringify(TRANS))
           .replace("__DEFAULT_TRANS__", () => JSON.stringify(DEFAULT_TRANS))
           .replace("__DEFAULT_TRANS_LABEL__", () => DEFAULT_TRANS)
           .replace("__TRANS_MENU__", () => transMenu)
           .replace(/__TRANS_LIST__/g, () => transList)
           .replace(/__TRANS_DOT__/g, () => TRANS.join(" · "))
           .replace("__TRANS_HIDDEN__", () => (TRANS.length > 1 ? "" : " hidden"))
           .replace("__STRUCT__", () => enc(JSON.stringify(STRUCT)))
           .replace("__ARTCOUNT__", () => String(ARTICLES.length))
           .replace("__GENERATED__", () => generated);

/* Only write when the content actually changed. The file is ~20 MB and lives in an
   iCloud-synced vault: rewriting it byte-identical still costs a full re-sync to
   every device, and reloads any open search view for nothing. The __GENERATED__
   date is part of the content, so a rebuild on a new day does rewrite — that's
   intended, it's a real change to what the page says. */
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
const mb = Buffer.byteLength(html) / 1024 / 1024;
const shellMb = (Buffer.byteLength(html) - Buffer.byteLength(dataScripts)) / 1024 / 1024;
if (prev === html) {
  console.log(`\n${OUT} unchanged (${mb.toFixed(1)} MB) — not rewritten, nothing to re-sync`);
} else {
  fs.writeFileSync(OUT, html);
  console.log(`\nWrote ${OUT} (${mb.toFixed(1)} MB self-contained — ${shellMb.toFixed(2)} MB parsed at boot, verse text on demand)`);
}
