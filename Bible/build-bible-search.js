// Builds "Bible Search.html" from the vault's full-text chapter notes.
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
// directly under Teaching/ ("Four12 Global", "Desiring God", …), so a new ministry becomes
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
      .filter(t => !t.includes("/") && !/^(article|hub|four12|devotional|teaching|topics|concept)$/i.test(t));
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
// ("Four12 Global", "Desiring God", …), so a new ministry becomes searchable by
// dropping its folder in — no code change here.
const ARTICLES = layerOn("articles") ? collectNotes(path.join(VAULT, "Teaching"), "Articles",
  rel => rel.split("/")[1] || "Teaching") : [];
// Topics/ → Topics tab. Flat folder of concept-topic notes; one constant badge.
const TOPICS = layerOn("topics") ? collectNotes(path.join(VAULT, "Topics"), "Topics", () => "Topic") : [];
// FAQ/ → FAQ tab. Flat folder of question-and-answer notes; one constant badge.
const FAQ = layerOn("faq") ? collectNotes(path.join(VAULT, "FAQ"), "FAQ", () => "FAQ") : [];
// Prayers/ → Prayers tab. Badge is the sub-folder (Church Fathers, Monastic, Celtic,
// Reformers, Modern); a prayer sitting at the folder root reads "Prayer".
const PRAYERS = layerOn("prayers") ? collectNotes(path.join(VAULT, "Prayers"), "Prayers",
  rel => { const p = rel.split("/"); return p.length > 2 ? p[1] : "Prayer"; }) : [];
// Bible History/ → History tab. Badge is the sub-folder (People, Concepts, Sources,
// Events, Canons, …); notes sitting at the folder root read "History".
const HISTORY = layerOn("history") ? collectNotes(path.join(VAULT, "Bible History"), "History",
  rel => { const p = rel.split("/"); return p.length > 2 ? p[1] : "History"; }) : [];
/* Bible/Word Studies/ → the written half of the Words tab. Filenames lead with
   the Strong's number ("G26 agape.md"), which is both the badge's source and how
   the page pairs a study back to its dictionary entry. */
const WORDS = layerOn("words") ? collectNotes(path.join(VAULT, "Bible", "Word Studies"), "Word studies",
  rel => (/\/G\d/.test(rel) ? "Greek" : "Hebrew")) : [];

/* ── the Strong's dictionary (Words tab) ───────────────────────────
   The dictionary itself is Bible/search-data/lex.json — ~3 MB of static public-
   domain lexicon, generated once by tools/gen-lexicon.js and NOT rebuilt here.
   It is far too big to inline: the page pulls it as a sidecar on first search,
   exactly like verse text. What ships in the page is this counts object, whose
   presence tells the page the sidecar is there and the tab should show.
   Both halves must be present — meta without the sidecar would advertise a
   dictionary the page then fails to load. */
function buildLexiconMeta() {
  const dir = path.join(VAULT, "Bible", "search-data");
  const metaPath = path.join(dir, "lex-meta.json");
  if (!fs.existsSync(metaPath)) return null;   // never generated — Words tab stays off, silently
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); }
  catch { problems.push("lex-meta.json is not valid JSON — Words layer empty"); return null; }
  if (!meta || !meta.n) { problems.push("lex-meta.json has an unexpected shape — Words layer empty"); return null; }
  if (!fs.existsSync(path.join(dir, "lex.json"))) {
    problems.push("lex.json missing from Bible/search-data/ — run tools/gen-lexicon.js; Words layer empty");
    return null;
  }
  return { n: meta.n, hebrew: meta.hebrew, greek: meta.greek };
}
const LEXICON = layerOn("words") ? buildLexiconMeta() : null;
const LEX_N = LEXICON ? LEXICON.n : 0;
console.log(`Words: ${LEX_N.toLocaleString()} dictionary entries, ${WORDS.length} written studies`);

/* ── On This Day (Christian-year calendar) ─────────────────────────
   Assembles the payload the On This Day tab renders from tools/data/on-this-day.js —
   the hand-curated, all-original set of fixed-date events (Scripture / Christian
   calendar / Church history). Read at BUILD time only; the page never touches the
   network. The same file drives the Bible History/On This Day/ day-notes via
   tools/gen-history-calendar.js. Emits { "MM-DD": { label, entries[] } }. */
const MONTHS = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];
function buildOnThisDay() {
  const out = {};
  let byDay = {};
  // require() needs an absolute path — a relative one is read as a module name, not a file.
  try { byDay = require(path.resolve(VAULT, "tools", "data", "on-this-day.js")); }
  catch { problems.push("on-this-day.js not found — On This Day layer empty"); return out; }
  // Blurbs may carry [[wikilinks]] meant for the day-notes; the calendar shows them
  // as plain text, so reduce [[Target|Alias]] → Alias, [[Target]] → Target.
  const deWiki = s => (s || "").replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2");
  const entry = e => ({
    category: e.category || "Church history",
    title: e.title,
    year: e.year ?? null,
    ref: e.ref || "",
    blurb: deWiki(e.blurb),
    link: safeUrl(e.link),
  });
  for (const mmdd of Object.keys(byDay).sort()) {
    const m = Number(mmdd.slice(0, 2)), d = Number(mmdd.slice(3, 5));
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) continue;
    const entries = (byDay[mmdd] || []).filter(e => e && e.title).map(entry);
    if (entries.length) out[mmdd] = { label: `${MONTHS[m - 1]} ${d}`, entries };
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
  // require() needs an absolute path — a relative one is read as a module name.
  let tree = null;
  try { tree = require(path.resolve(VAULT, "tools", "data", "denominations.js")); }
  catch { problems.push("denominations.js not found — Church History layer empty"); return null; }
  // A malformed source must degrade the layer, not crash the whole build (the
  // plugin twin does the same) — so CH_NODES's .nodes.length read stays safe.
  if (!chShapeOk(tree)) { problems.push("denominations.js has an unexpected shape — Church History layer empty"); return null; }
  return tree;
}
const CHURCHHISTORY = layerOn("churchhistory") ? buildChurchHistory() : null;
const CH_NODES = CHURCHHISTORY ? CHURCHHISTORY.nodes.length : 0;
console.log(`Church History: ${CH_NODES} denomination nodes`);

/* ── Study layers (the reader's per-verse panel) ───────────────────
   Four layers hang off a verse in the reader rather than off a search tab:
   cross-references, the Hebrew/Greek word breakdown, book context and chapter
   commentary. All four are PRE-GENERATED sidecars in Bible/search-data/, written by
   tools/gen-search-{xrefs,interlinear,bookcontext,commentary}.js and served to the
   page on demand by the same host hook that serves verse text.

   They are pre-generated rather than assembled here because the interlinear's
   source — the STEP tagged text — is vendored OUTSIDE the vault (~95 MB), so
   neither this script on a fresh machine nor the Obsidian plugin can derive it.
   What this build DOES do is emit a manifest of which sidecars are actually
   present, so the page offers a study tab only when it can be filled: no Original
   tab in a vault without the STEP data, and Commentary only for the books that
   have notes. Mirrored by studyManifest() in the plugin's main.js. */
// Where both the verse sidecars and the study sidecars live. Declared here rather
// than beside the verse-emission block below because the study manifest reads the
// directory before that point.
const DATA_DIR = path.join(VAULT, "Bible", "search-data");

/* Book context is a sidecar (bx.json, written by tools/gen-search-bookcontext.js)
   rather than an inline payload, even though 35 KB would inline comfortably. The
   plugin can rebuild this page in-app and cannot require() a Node module out of
   tools/, so an inline build would silently lose Context on every in-app rebuild.
   Keeping all four study layers in one sidecar shape means both build paths agree
   on what exists by listing one folder — the same reason the Words tab keeps its
   dictionary in lex.json and ships only counts in the page. */
function studyManifest() {
  const m = { xr: false, bx: false, il: [], cm: [] };
  if (!fs.existsSync(DATA_DIR)) return m;
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (f === "xr.json") { m.xr = layerOn("xrefs"); continue; }
    if (f === "bx.json") { m.bx = layerOn("bookcontext"); continue; }
    const il = f.match(/^il-(\d+)\.json$/);
    if (il && layerOn("interlinear")) { m.il.push(+il[1]); continue; }
    const cm = f.match(/^cm-(\d+)\.json$/);
    if (cm && layerOn("commentary")) m.cm.push(+cm[1]);
  }
  m.il.sort((a, b) => a - b);
  m.cm.sort((a, b) => a - b);
  return m;
}
const STUDY = studyManifest();
console.log(`Study panel: cross-refs ${STUDY.xr ? "yes" : "no"} · context ${STUDY.bx ? "yes" : "no"} · ` +
  `interlinear ${STUDY.il.length} books · commentary ${STUDY.cm.length} books`);

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
  /* Words ships as two payloads. "lx" is the dictionary's counts — tiny, and its
     presence is what shows the tab, since the dictionary itself is the lex.json
     sidecar. "wd" is the written studies, which are ordinary notes and optional:
     a vault with no Word Studies folder still gets the full dictionary. Only "lx"
     carries the footer prose, so the page never claims studies it didn't ship. */
  { id: "lx", data: LEXICON,   n: LEX_N,           foot: n => `a Hebrew and Greek dictionary (${n.toLocaleString()} words)`, noun: "a Hebrew and Greek dictionary" },
  { id: "wd", data: WORDS,     n: WORDS.length,    foot: () => "",                                   noun: "" },
  { id: "ad", data: ARTICLES,  n: ARTICLES.length, foot: n => `${n} teaching articles`,             noun: "teaching articles" },
  { id: "td", data: TOPICS,    n: TOPICS.length,   foot: n => `${n} topics`,                         noun: "topics" },
  { id: "fd", data: FAQ,       n: FAQ.length,      foot: n => `${n} FAQ answers`,                    noun: "FAQ answers" },
  { id: "hd", data: HISTORY,   n: HISTORY.length,  foot: n => `${n} Bible-history notes`,            noun: "Bible history" },
  // Ordered to match the template's tab strip: Church History, then On This Day, then Prayers.
  { id: "cd", data: CHURCHHISTORY, n: CH_NODES,    foot: n => `a Church History family tree (${n} branches)`, noun: "a Church History family tree" },
  { id: "od", data: ONTHISDAY, n: OTD_DAYS,        foot: n => `an On This Day calendar (${n} days)`, noun: "an On This Day calendar" },
  { id: "pd", data: PRAYERS,   n: PRAYERS.length,  foot: n => `${n} prayers`,                        noun: "prayers" },
];
const presentLayers = LAYERS.filter(l => l.n > 0);
const andJoin = arr => arr.length <= 1 ? (arr[0] || "")
  : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
/* A layer may ship a payload and still say nothing in the prose — the written
   word studies are part of the Words tab the dictionary already announced, so
   they'd otherwise read as a second, separate feature. Blank noun = emitted but
   not advertised; without this filter the empty string lands in the list as a
   stray ", ,". */
const spokenLayers = presentLayers.filter(l => l.noun);
const contentSummary = spokenLayers.length ? ", plus " + andJoin(spokenLayers.map(l => l.foot(l.n))) : "";
const ledeLayers = spokenLayers.length ? " — plus " + andJoin(spokenLayers.map(l => l.noun)) + "." : ".";

/* Verse-text emission. Split (default): one Bible/search-data/bd-<t>.json per
   translation, written only when its content changed — the text is static, so
   routine rebuilds stop pushing ~17 MB through iCloud sync — and sidecars for
   translations that left the vault are removed. Inline (--inline): embedded as
   bd-* script tags, the fully self-contained page. The template prefers an
   inline tag when present and asks the host for the sidecar otherwise. */
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

/* No study-layer payloads here: all four are sidecars in Bible/search-data/, which
   the page pulls on demand through the host hook. Only the STUDY manifest travels
   inside the page — see studyManifest() above. */
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
           .replace("__STUDY__", () => enc(JSON.stringify(STUDY)))
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
