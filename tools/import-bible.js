// Imports a public-domain / freely-licensed translation from bible.helloao.org and
// writes it into the vault in the exact shape the search parser and the enrichment
// layer expect (see Bible/README.md):
//
//   Bible/{TRANS}/{Book}/{Book} {n} ({TRANS}).md     — or "{Book} {n}.md" for the anchor
//   **1** verse text… ^1                             — one verse per line
//
// Usage:
//   node tools/import-bible.js "<vault root>" <TRANS> [--api <id>] [--anchor] [--book "<Book>"]
//
//   node tools/import-bible.js . BSB                 # whole Bible, "Ruth 1 (BSB).md"
//   node tools/import-bible.js . BSB --book Ruth     # one book (try this first)
//   node tools/import-bible.js . KJV --api eng_kjv --anchor
//
//   --anchor  name files "{Book} {n}.md" with no suffix. Exactly one translation in a
//             vault may be the anchor — it owns the bare "Ruth 1" stem that every
//             cross-reference and word study links to (PRD TD-2).
//
// Only import translations you may actually store. BSB is public domain (CC0, 2023);
// KJV and WEB are public domain. ESV/NLT/AMP are NOT — their APIs licence single
// passages, not whole-Bible copies. See Bible/README.md.
const fs = require("fs");
const path = require("path");
const https = require("https");

const API = "https://bible.helloao.org/api";
// The vault's canonical book names, in canonical order — the search's ORDER list.
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
  "Revelation",
];

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf("--" + name);
  return i === -1 ? fallback : args[i + 1];
};
const positional = args.filter((a, i) =>
  !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["anchor"].includes(args[i - 1].slice(2)))
);
const [VAULT, TRANS] = positional;
const API_ID = flag("api", TRANS);
const ANCHOR = args.includes("--anchor");
const ONE_BOOK = flag("book");

if (!VAULT || !TRANS) {
  console.error('Usage: node tools/import-bible.js "<vault root>" <TRANS> [--api <id>] [--anchor] [--book "<Book>"]');
  process.exit(2);
}
if (ONE_BOOK && !ORDER.includes(ONE_BOOK)) {
  console.error(`Unknown book "${ONE_BOOK}". Use the vault's canonical name, e.g. "Song of Songs", "Psalms".`);
  process.exit(2);
}

const get = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${res.statusCode} ${url}`)); }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });

/* A verse's content is a mix of plain strings, poetry parts ({text, poem}),
   in-verse line breaks and footnote markers ({noteId}). The vault format is one
   line per verse, so flatten it all to a single spaced string and drop the notes. */
function verseText(content) {
  const out = [];
  for (const part of content || []) {
    if (typeof part === "string") out.push(part);
    else if (part && typeof part.text === "string") out.push(part.text);
    // {noteId} → footnote marker, {lineBreak} → poetry break: both become whitespace
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

// USFM ids in ORDER order — matched on id, never display name: our canonical
// "Song of Songs" is "Song of Solomon" upstream. Keep in sync with the plugin.
const BOOK_IDS = [
  "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI",
  "1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER",
  "LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP",
  "HAG","ZEC","MAL","MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL",
  "EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE",
  "2PE","1JN","2JN","3JN","JUD","REV",
];

async function importBook(bookName, apiId, meta) {
  const usfm = BOOK_IDS[ORDER.indexOf(bookName)];
  const info = meta.find((b) => b.id === usfm) ||
    meta.find((b) => b.commonName === bookName || b.name === bookName);
  if (!info) return { book: bookName, chapters: 0, verses: 0, missing: true };

  const dir = path.join(VAULT, "Bible", TRANS, bookName);
  fs.mkdirSync(dir, { recursive: true });
  // Chapter files drop the suffix for the anchor translation (it owns the bare
  // "Ruth 1" stem). The book note always keeps it — matching the vault convention,
  // and keeping "Ruth" free for the canon-history note.
  const suffix = ANCHOR ? "" : ` (${TRANS})`;
  const bookSuffix = ` (${TRANS})`;
  let verses = 0;

  for (let ch = 1; ch <= info.numberOfChapters; ch++) {
    const d = await get(`${API}/${apiId}/${info.id}/${ch}.json`);
    const lines = [
      "---",
      `tags: [bible, bible/${TRANS.toLowerCase()}, bible/chapter]`,
      `aliases: ["${bookName} ${ch}${suffix}"]`,
      `translation: ${TRANS}`,
      `book: "${bookName}"`,
      `chapter: ${ch}`,
      "---",
      "",
      `# ${bookName} ${ch}`,
      "",
      `Part of [[${bookName}${bookSuffix}|${bookName}]] · [[${TRANS}]] · [[Bible]]`,
      "",
    ];
    for (const item of d.chapter.content) {
      if (item.type !== "verse") continue;          // headings/line breaks aren't verses
      const text = verseText(item.content);
      if (!text) continue;
      lines.push(`**${item.number}** ${text} ^${item.number}`, "");
      verses++;
    }
    fs.writeFileSync(path.join(dir, `${bookName} ${ch}${suffix}.md`), lines.join("\n"));
  }

  // Book-level note — the parser ignores it (no chapter number), the links use it.
  const chapterLinks = Array.from({ length: info.numberOfChapters }, (_, i) =>
    `[[${bookName} ${i + 1}${suffix}|${i + 1}]]`).join(" · ");
  fs.writeFileSync(path.join(dir, `${bookName}${bookSuffix}.md`), [
    "---",
    `tags: [bible, bible/${TRANS.toLowerCase()}, bible/book]`,
    `aliases: ["${bookName}${bookSuffix}"]`,
    `translation: ${TRANS}`,
    `book: "${bookName}"`,
    "---",
    "",
    `# ${bookName}${bookSuffix}`,
    "",
    `Part of [[${TRANS}]] · [[Bible]]`,
    "",
    "## Chapters",
    "",
    chapterLinks,
    "",
  ].join("\n"));

  return { book: bookName, chapters: info.numberOfChapters, verses };
}

(async () => {
  console.log(`Importing ${TRANS} from ${API}/${API_ID} …`);
  let meta;
  try {
    meta = (await get(`${API}/${API_ID}/books.json`)).books;
  } catch (e) {
    console.error(`Couldn't read ${API}/${API_ID}/books.json — is "${API_ID}" a valid translation id?`);
    console.error(`List them: curl -s ${API}/available_translations.json`);
    process.exit(1);
  }

  const books = ONE_BOOK ? [ONE_BOOK] : ORDER;
  let totalVerses = 0, done = 0;
  const missing = [];
  for (const b of books) {
    const r = await importBook(b, API_ID, meta);
    if (r.missing) { missing.push(b); continue; }
    totalVerses += r.verses;
    done++;
    process.stdout.write(`\r  ${done}/${books.length} books · ${totalVerses.toLocaleString()} verses`);
  }
  process.stdout.write("\n");
  if (missing.length) console.log(`  not in this translation: ${missing.join(", ")}`);
  console.log(`Wrote Bible/${TRANS}/ — ${done} books, ${totalVerses.toLocaleString()} verses${ANCHOR ? " (anchor translation)" : ""}`);
  console.log(`Next: rebuild the search — node "Bible/build-bible-search.js" . "Bible/bible-search-template.html" "Bible Search.html"`);
})();
