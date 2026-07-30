// Builds "Bible Search.html" from the vault's full-text chapter notes.
//
// Same OUTPUT SHAPE as the plugin's in-app rebuild (README: "same output as the in-app
// rebuild, for terminal/CI use") — every layer whose folder or pack is present is emitted,
// and a layer that is absent is omitted so its tab hides. The On This Day and Church
// History layers read the assembled data/*.json packs rather than the private source
// modules that generate them.
// Usage: node build-bible-search.js "<vault root>" "<template path>" "<output path>" [--inline]
//
// Default build is SPLIT: the page is a ~2.5 MB shell and each translation's
// verse text goes to Bible/search-data/bd-<TRANS>.json, which the Obsidian
// plugin feeds to the page on demand. --inline embeds the verse text in the
// page itself (the old ~20 MB self-contained file) for use outside Obsidian —
// the template supports both shapes.
const fs = require("fs");
const path = require("path");

const INLINE = process.argv.includes("--inline");
const [VAULT, TEMPLATE, OUT] = process.argv.slice(2).filter(a => a !== "--inline");

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
// Quote-stripping must run AFTER trim, not before: the comma split of an inline
// list leaves a leading space (`tags: [a, "b"]` → ` "b"`), so `^["']` never
// matched and the opening quote survived into the payload as `"b`.
function fmList(fm, key){
  // supports both inline "[a, b]" and YAML block "  - a"
  const unquote = s => s.trim().replace(/^["']|["']$/g, "").trim();
  const inline = fm.match(new RegExp("^" + key + ":\\s*\\[(.*)\\]\\s*$", "m"));
  if (inline) return inline[1].split(",").map(unquote).filter(Boolean);
  const block = fm.match(new RegExp("^" + key + ":\\s*\\n((?:\\s*-\\s*.*\\n?)+)", "m"));
  if (block) return block[1].split("\n").map(l => unquote(l.replace(/^\s*-\s*/, ""))).filter(Boolean);
  return [];
}
/* A [[wikilink]] survives into the payload as a link MARKER — \u0001target\u0002alias\u0003 —
   instead of being flattened to its alias text. The reader turns each marker into a real
   anchor (verse → the in-page chapter reader, note → that note’s reader page), so a curated
   Topics page keeps its graph inside the search app instead of dead-ending. Control characters
   are the marker because prose cannot contain them and JSON.stringify escapes them to \uXXXX,
   so the payload stays plain ASCII. The format is a contract with the template’s stripLinks()
   and noteSegments() — change it in both or not at all. Anything that INDEXES or EXCERPTS a
   body must run it through stripLinks() first. */
const LINK_MARK = (target, alias) => "\u0001" + target + "\u0002" + alias + "\u0003";
const stripLinks = s => String(s).replace(/\u0001([^\u0001\u0002\u0003]*)\u0002([^\u0001\u0002\u0003]*)\u0003/g, "$2");
// Convert an article's markdown body to clean reading paragraphs (joined by "\n").
// Drops the breadcrumb + excerpt callout, keeps prose and headings, strips md syntax.
function toParagraphs(body){
  // A wikilink with an empty alias ("[[Faith|]]") carries no display text — drop it
  // rather than emit a marker whose anchor would render as nothing to click.
  const wiki = (target, alias) => {
    const t = target.replace(/\s+/g, " ").trim(), a = alias.replace(/\s+/g, " ").trim();
    return t && a ? LINK_MARK(t, a) : a;
  };
  const clean = s => s
    .replace(/\[+\d+\]+\(#_?ftn[a-z0-9]*\)/gi, "")    // footnote markers [[1]](#_ftn1)
    .replace(/!\[\[[^\]]*\]\]/g, "")                  // embeds
    .replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, (_, t, a) => wiki(t, a))   // [[Target|Alias]]
    .replace(/\[\[([^\]|]+)\]\]/g, (_, t) => wiki(t, t))                // [[Target]]
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
// hub/index/MOC notes list other notes — they aren't content themselves
function isHub(fm){
  return /^type:\s*\S*(hub|moc)\b/mi.test(fm) ||
    fmList(fm, "tags").some(t => t === "hub" || t === "moc" || t.endsWith("/hub") || t.endsWith("/moc"));
}
const firstHeading = body => (body.match(/^#\s+(.+)$/m) || [, ""])[1].trim();
const firstUrl = body => (body.match(/\((https?:\/\/[^)\s]+)\)/) || [, ""])[1];
// Only http(s) source URLs are kept — a frontmatter `source: "javascript:…"` would
// otherwise reach an href in the same-origin search page. The template's safeUrl()
// is the second line of defence; this stops it entering the payload at all.
const safeUrl = u => (/^https?:\/\//i.test(u || "") ? u : "");

// Index every .md note under a folder into the shared record shape. The Articles,
// Topics, FAQ and History search tabs are all just different folders run through
// this one function — sourceOf(rel) picks each result's badge label. Hub/index
// notes are skipped, so a folder's MOC/hub note never shows up as content.
function collectNotes(rootAbs, label, sourceOf) {
  const out = [], counts = {};
  if (!fs.existsSync(rootAbs)) {
    problems.push(`${label} folder not found (${path.relative(VAULT, rootAbs)}) — that tab will be empty`);
    return out;
  }
  for (const abs of walkMd(rootAbs)) {
    const rel = path.relative(VAULT, abs).split(path.sep).join("/");
    const source = sourceOf(rel);
    const raw = fs.readFileSync(abs, "utf8");
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const fm = fmMatch ? fmMatch[1] : "";                 // no frontmatter is fine — infer below
    const bodyRaw = fmMatch ? fmMatch[2] : raw;
    if (isHub(fm)) continue;

    const paras = toParagraphs(bodyRaw);
    if (!paras.length) { problems.push(`${source}: no readable body in ${rel}`); continue; }

    const tagTopics = fmList(fm, "tags")
      .map(t => (t.startsWith("topic/") ? t.slice(6).replace(/-/g, " ") : t))
      // Anonymized filter: the private builder also excludes a ministry-specific token and
      // the Topics-folder tags. Do NOT widen this one to match it — see the plugin twin.
      .filter(t => !t.includes("/") && !/^(article|hub|devotional|teaching)$/i.test(t));
    const topics = (fmList(fm, "topics").length ? fmList(fm, "topics") : tagTopics).slice(0, 6).join(", ");

    out.push([
      fmValue(fm, "title") || firstHeading(bodyRaw) || path.basename(rel, ".md"),
      fmValue(fm, "author"),          // may be blank — the source badge already names the collection
      fmValue(fm, "date"),
      topics,
      // The excerpt is shown as plain text on result cards, so it is the one body-derived
      // field that must NOT carry link markers — slicing could even cut one in half.
      fmValue(fm, "excerpt") || stripLinks(paras[0]).slice(0, 240),
      rel.replace(/\.md$/, ""),
      safeUrl(fmValue(fm, "source") || firstUrl(bodyRaw)),
      paras.join("\n"),
      source,
    ]);
    counts[source] = (counts[source] || 0) + 1;
  }
  const summary = Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(" · ");
  console.log(`${label}: ${out.length}${summary ? ` (${summary})` : ""}`);
  return out;
}

/* Optional-layer config, kept in lock-step with the plugin's `layers` setting:
   the plugin writes tools/data/search-layers.json on every settings save (see
   writeLayerConfig in main.js), and this build reads it. It turns layers off by
   key ({ "articles": false, "onthisday": false, … }); absent or partial means
   "include everything present". A disabled layer is skipped entirely here, so
   its payload is never emitted and its tab hides — same contract as the plugin. */
let LAYER_CFG = {};
try { LAYER_CFG = require(path.resolve(VAULT, "tools", "data", "search-layers.json")); }
catch { /* no config → all layers on */ }
const layerOn = k => LAYER_CFG[k] !== false;

// Teaching/ → Articles tab. The badge is the folder directly under Teaching/
// ("Example Ministry", "Desiring God", …), so a new ministry becomes searchable by
// dropping its folder in — no code change here.
const ARTICLES = layerOn("articles") ? collectNotes(path.join(VAULT, "Teaching"), "Articles",
  rel => rel.split("/")[1] || "Teaching") : [];
// Topics/ → Topics tab. Flat folder of concept-topic notes; one constant badge.
const TOPICS = layerOn("topics") ? collectNotes(path.join(VAULT, "Topics"), "Topics", () => "Topic") : [];
// FAQ/ → FAQ tab. Flat folder of question-and-answer notes; one constant badge.
const FAQ = layerOn("faq") ? collectNotes(path.join(VAULT, "FAQ"), "FAQ", () => "FAQ") : [];
// Bible History/ → History tab. Badge is the sub-folder (People, Concepts, Sources,
// Events, Canons, …); notes sitting at the folder root read "History".
const HISTORY = layerOn("history") ? collectNotes(path.join(VAULT, "Bible History"), "History",
  rel => { const p = rel.split("/"); return p.length > 2 ? p[1] : "History"; }) : [];

/* ── On This Day (Christian-year calendar) ─────────────────────────
   Read from the ASSEMBLED pack — the shape the page renders directly:
   { "MM-DD": { label, entries[] } }. The private vault generates this pack from a
   curated source module; here we read the finished JSON, which is byte-identical to
   what that assembly emits. Same file and same precedence the in-app rebuild uses
   (a downloaded Bible/ copy wins over the repo copy), parsed as JSON and never
   executed. Read at BUILD time only — the page never touches the network. */
function readJsonPack(rels, label) {
  for (const rel of rels) {
    const abs = path.join(VAULT, rel);
    if (!fs.existsSync(abs)) continue;
    try { return JSON.parse(fs.readFileSync(abs, "utf8")); }
    catch (e) { problems.push(`${label} pack unreadable at ${rel} — ${e.message}`); return null; }
  }
  problems.push(`${label} pack not found (${rels.join(" or ")}) — that layer will be empty`);
  return null;
}
function buildOnThisDay() {
  const pack = readJsonPack(["Bible/on-this-day.json", "data/on-this-day.json"], "On This Day");
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return {};
  // Only well-formed MM-DD days with entries reach the page, so a hand-edited pack
  // degrades that day rather than the whole layer.
  const out = {};
  for (const mmdd of Object.keys(pack).sort()) {
    if (!/^\d{2}-\d{2}$/.test(mmdd)) continue;
    const m = Number(mmdd.slice(0, 2)), d = Number(mmdd.slice(3, 5));
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) continue;
    const day = pack[mmdd];
    if (!day || !day.label || !Array.isArray(day.entries) || !day.entries.length) continue;
    /* Re-gate every link through safeUrl even though the template does the same before it
       becomes an href. The private builder sanitizes while ASSEMBLING the pack; this copy
       only READS one, and a pack can be hand-edited or downloaded — so keep both layers.
       A clean pack passes through byte-identical. */
    out[mmdd] = { label: day.label, entries: day.entries.map(e =>
      (e && e.link && !safeUrl(e.link)) ? { ...e, link: "" } : e) };
  }
  return out;
}
const ONTHISDAY = layerOn("onthisday") ? buildOnThisDay() : {};
const OTD_DAYS = Object.keys(ONTHISDAY).length;
console.log(`On This Day: ${OTD_DAYS} calendar days`);

/* ── Church History (denominational family tree) ───────────────────
   The whole tree — eras, colour-coded families, and dated nodes with their
   parent lineage — is a single hand-curated module. Read at BUILD time only;
   the page renders it entirely offline. Emitted as one { eras, families, nodes }
   object the Church History tab parses on first use. */
const chShapeOk = d => !!(d && Array.isArray(d.eras) && Array.isArray(d.families) &&
  Array.isArray(d.nodes) && d.nodes.length);
function buildChurchHistory() {
  // The assembled pack, not the private tools/data/denominations.js source module — same
  // precedence as the in-app rebuild, parsed as JSON, never executed.
  const tree = readJsonPack(["Bible/church-history.json", "data/church-history.json"], "Church History");
  if (!tree) return null;
  // A malformed pack must degrade the layer, not crash the build (the plugin twin does the
  // same) — so CH_NODES's .nodes.length read below stays safe.
  if (!chShapeOk(tree)) { problems.push("church-history pack has an unexpected shape — Church History layer empty"); return null; }
  return tree;
}
const CHURCHHISTORY = layerOn("churchhistory") ? buildChurchHistory() : null;
const CH_NODES = CHURCHHISTORY ? CHURCHHISTORY.nodes.length : 0;
console.log(`Church History: ${CH_NODES} denomination nodes`);

if (problems.length) {
  console.log(`\n${problems.length} problems:`);
  problems.slice(0, 20).forEach(p => console.log("  - " + p));
  if (problems.length > 20) console.log(`  … and ${problems.length - 20} more`);
}

// Two escapes, two contexts — using the wrong one is the bug, not forgetting one.
// enc()     — a JSON literal that lands INSIDE a <script> body: never break out.
// escHtml() — a value that lands in HTML text or in a quoted attribute.
// Everything derived from a translation folder name goes through one of them.
// Kept in lock-step with buildSearchIndex() in the plugin's main.js.
const enc = s => s.replace(/</g, "\\u003c");
const escHtml = s => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

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
/* Optional content layers. A layer's payload is emitted ONLY when it has content;
   an absent <script> is the single signal the page uses to hide that layer's tab
   (see the tab-hiding pass in the template). So an empty layer costs nothing and
   shows nothing — and the same omission is what a disabled layer will produce once
   the wizard can turn layers off. The footer/lede prose is built from the same set,
   so the page never advertises a layer it didn't ship. */
const LAYERS = [
  { id: "ad", data: ARTICLES,  n: ARTICLES.length, foot: n => `${n} teaching articles`,             noun: "teaching articles" },
  { id: "td", data: TOPICS,    n: TOPICS.length,   foot: n => `${n} topics`,                         noun: "topics" },
  { id: "fd", data: FAQ,       n: FAQ.length,      foot: n => `${n} FAQ answers`,                    noun: "FAQ answers" },
  { id: "hd", data: HISTORY,   n: HISTORY.length,  foot: n => `${n} Bible-history notes`,            noun: "Bible history" },
  // cd before od to match the template's tab order (Church History, then On This Day).
  { id: "cd", data: CHURCHHISTORY, n: CH_NODES,    foot: n => `a Church History family tree (${n} branches)`, noun: "a Church History family tree" },
  { id: "od", data: ONTHISDAY, n: OTD_DAYS,        foot: n => `an On This Day calendar (${n} days)`, noun: "an On This Day calendar" },
];
const presentLayers = LAYERS.filter(l => l.n > 0);
const andJoin = arr => arr.length <= 1 ? (arr[0] || "")
  : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
const contentSummary = presentLayers.length ? ", plus " + andJoin(presentLayers.map(l => l.foot(l.n))) : "";
const ledeLayers = presentLayers.length ? " — plus " + andJoin(presentLayers.map(l => l.noun)) + "." : ".";

/* Verse-text emission. Split (default): one Bible/search-data/bd-<t>.json per
   translation, written only when its content changed — the text is static, so
   routine rebuilds stop pushing ~17 MB through iCloud sync — and sidecars for
   translations that left the vault are removed. Inline (--inline): embedded as
   bd-* script tags, the fully self-contained page. The template prefers an
   inline tag when present and asks the host for the sidecar otherwise. */
const DATA_DIR = path.join(VAULT, "Bible", "search-data");
if (!INLINE) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let wrote = 0, kept = 0;
  for (const t of TRANS) {
    const p = path.join(DATA_DIR, `bd-${t}.json`);
    const json = JSON.stringify(data[t]);
    if (fs.existsSync(p) && fs.readFileSync(p, "utf8") === json) { kept++; continue; }
    fs.writeFileSync(p, json);
    wrote++;
  }
  for (const f of fs.readdirSync(DATA_DIR)) {
    const m = f.match(/^bd-([A-Za-z0-9]+)\.json$/);
    if (m && !TRANS.includes(m[1])) { fs.unlinkSync(path.join(DATA_DIR, f)); console.log(`removed stale ${f}`); }
  }
  console.log(`search-data: ${wrote} sidecar${wrote === 1 ? "" : "s"} written, ${kept} unchanged`);
}

const dataScripts = [
  ...(INLINE ? TRANS.map(t => `<script type="application/json" id="bd-${t}">${enc(JSON.stringify(data[t]))}<\/script>`) : []),
  ...presentLayers.map(l => `<script type="application/json" id="${l.id}">${enc(JSON.stringify(l.data))}<\/script>`),
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
  .map(t => `        <button role="menuitemradio" data-t="${escHtml(t)}" aria-checked="${t === DEFAULT_TRANS}">${escHtml(t)}</button>`)
  .concat(TRANS.length > 1
    ? [`        <button role="menuitemradio" data-t="ALL" aria-checked="false">All ${TRANS.length}</button>`]
    : [])
  .join("\n");
const transList = TRANS.length === 1
  ? `the ${escHtml(TRANS[0])} text in your vault`
  : `all ${TRANS.length} Bible translations in your vault`;

let html = fs.readFileSync(TEMPLATE, "utf8");
html = html.replace("__DATA_SCRIPTS__", () => dataScripts)
           .replace("__BOOKS__", () => enc(books))
           .replace("__TRANS__", () => enc(JSON.stringify(TRANS)))
           .replace("__DEFAULT_TRANS__", () => enc(JSON.stringify(DEFAULT_TRANS)))
           .replace("__DEFAULT_TRANS_LABEL__", () => escHtml(DEFAULT_TRANS))
           .replace("__TRANS_MENU__", () => transMenu)
           .replace(/__TRANS_LIST__/g, () => transList)
           .replace(/__TRANS_DOT__/g, () => escHtml(TRANS.join(" · ")))
           .replace("__TRANS_HIDDEN__", () => (TRANS.length > 1 ? "" : " hidden"))
           .replace("__STRUCT__", () => enc(JSON.stringify(STRUCT)))
           .replace("__LEDE_LAYERS__", () => ledeLayers)
           .replace("__CONTENT_SUMMARY__", () => contentSummary)
           .replace("__SELF_CONTAINED__", () => (INLINE
             ? "Self-contained — works offline, no network."
             : "Works offline inside Obsidian — verse text loads from the vault, so this file needs the Bible Search plugin."))
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
  console.log(INLINE
    ? `\nWrote ${OUT} (${mb.toFixed(1)} MB self-contained — ${shellMb.toFixed(2)} MB parsed at boot, verse text on demand)`
    : `\nWrote ${OUT} (${mb.toFixed(1)} MB shell — verse text in Bible/search-data/, loaded on demand)`);
}
