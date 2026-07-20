// Generates per-chapter cross-reference notes from the vendored OpenBible
// dataset (sources/openbible/cross_references.txt, CC-BY openbible.info).
// Writes ONLY to Bible/Cross Reference/ (PRD TD-1); idempotent — same input,
// byte-identical output. Top N refs per verse by vote rank.
// Usage: node tools/gen-crossrefs.js "<vault root>" "<Book>" [topN]
const fs = require("fs");
const path = require("path");

const OSIS_TO_BOOK = {
  Gen: "Genesis", Exod: "Exodus", Lev: "Leviticus", Num: "Numbers",
  Deut: "Deuteronomy", Josh: "Joshua", Judg: "Judges", Ruth: "Ruth",
  "1Sam": "1 Samuel", "2Sam": "2 Samuel", "1Kgs": "1 Kings", "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles", "2Chr": "2 Chronicles", Ezra: "Ezra", Neh: "Nehemiah",
  Esth: "Esther", Job: "Job", Ps: "Psalms", Prov: "Proverbs",
  Eccl: "Ecclesiastes", Song: "Song of Songs", Isa: "Isaiah", Jer: "Jeremiah",
  Lam: "Lamentations", Ezek: "Ezekiel", Dan: "Daniel", Hos: "Hosea",
  Joel: "Joel", Amos: "Amos", Obad: "Obadiah", Jonah: "Jonah", Mic: "Micah",
  Nah: "Nahum", Hab: "Habakkuk", Zeph: "Zephaniah", Hag: "Haggai",
  Zech: "Zechariah", Mal: "Malachi", Matt: "Matthew", Mark: "Mark",
  Luke: "Luke", John: "John", Acts: "Acts", Rom: "Romans",
  "1Cor": "1 Corinthians", "2Cor": "2 Corinthians", Gal: "Galatians",
  Eph: "Ephesians", Phil: "Philippians", Col: "Colossians",
  "1Thess": "1 Thessalonians", "2Thess": "2 Thessalonians",
  "1Tim": "1 Timothy", "2Tim": "2 Timothy", Titus: "Titus", Phlm: "Philemon",
  Heb: "Hebrews", Jas: "James", "1Pet": "1 Peter", "2Pet": "2 Peter",
  "1John": "1 John", "2John": "2 John", "3John": "3 John", Jude: "Jude",
  Rev: "Revelation",
};

const [, , VAULT, BOOK, TOPN_ARG] = process.argv;
const TOP_N = Number(TOPN_ARG) || 10;
if (!VAULT || !BOOK || !Object.values(OSIS_TO_BOOK).includes(BOOK)) {
  console.error('Usage: node tools/gen-crossrefs.js "<vault root>" "<Book>" [topN]');
  process.exit(2);
}
const BOOK_OSIS = Object.keys(OSIS_TO_BOOK).find(k => OSIS_TO_BOOK[k] === BOOK);

// "Ruth.1.8" → { book:"Ruth", ch:1, v:8 } ; verse 0 = chapter heading/title
function parseRef(osis) {
  const m = osis.match(/^([^.]+)\.(\d+)\.(\d+)$/);
  if (!m || !OSIS_TO_BOOK[m[1]]) return null;
  return { book: OSIS_TO_BOOK[m[1]], ch: +m[2], v: +m[3] };
}

// A target ("Gen.1.1" or "Gen.1.1-Gen.1.3") → { link, label }
function renderTarget(raw) {
  const [fromPart, toPart] = raw.split("-");
  const a = parseRef(fromPart);
  if (!a) return null;
  let label = `${a.book} ${a.ch}:${a.v}`;
  if (toPart) {
    const b = parseRef(toPart);
    if (b) label += b.ch === a.ch && b.book === a.book ? `–${b.v}` : `–${b.ch}:${b.v}`;
  }
  // verse 0 (e.g. Psalm titles) has no block anchor — link the chapter only
  const anchor = a.v >= 1 ? `#^${a.v}` : "";
  if (a.v === 0) label = `${a.book} ${a.ch} (title)`;
  return `[[${a.book} ${a.ch}${anchor}|${label}]]`;
}

const tsv = fs.readFileSync(path.join(VAULT, "sources/openbible/cross_references.txt"), "utf8");
const byChapterVerse = new Map(); // ch → Map(v → [{target, votes}])
for (const line of tsv.split("\n")) {
  const [from, to, votesStr] = line.split("\t");
  if (!from || !from.startsWith(BOOK_OSIS + ".")) continue;
  const src = parseRef(from.split("-")[0]);
  if (!src || src.book !== BOOK || src.v < 1) continue;
  const votes = +votesStr || 0;
  if (!byChapterVerse.has(src.ch)) byChapterVerse.set(src.ch, new Map());
  const verses = byChapterVerse.get(src.ch);
  if (!verses.has(src.v)) verses.set(src.v, []);
  verses.get(src.v).push({ to, votes });
}

const outDir = path.join(VAULT, "Bible", "Cross Reference");
fs.mkdirSync(outDir, { recursive: true });
let written = 0;

for (const ch of [...byChapterVerse.keys()].sort((x, y) => x - y)) {
  const verses = byChapterVerse.get(ch);
  const lines = [
    "---",
    "tags: [bible, bible/cross-reference]",
    `aliases: ["${BOOK} ${ch} — Cross References"]`,
    `book: "${BOOK}"`,
    `chapter: ${ch}`,
    "source: openbible.info cross-references (CC-BY)",
    "---",
    "",
    `# ${BOOK} ${ch} — Cross References`,
    "",
    `Part of [[${BOOK} ${ch} Hub|${BOOK} ${ch} Hub]] · [[Bible]]`,
    "",
    `Top ${TOP_N} cross-references per verse, ranked by openbible.info votes.`,
    "",
  ];
  for (const v of [...verses.keys()].sort((x, y) => x - y)) {
    const refs = verses.get(v)
      .sort((x, y) => y.votes - x.votes)
      .slice(0, TOP_N)
      .map(r => renderTarget(r.to))
      .filter(Boolean);
    if (!refs.length) continue;
    lines.push(`### ${BOOK} ${ch}:${v}`, "", `[[${BOOK} ${ch}#^${v}|→ read ${BOOK} ${ch}:${v}]]`, "");
    for (const link of refs) lines.push(`- ${link}`);
    lines.push("");
  }
  lines.push("---", "", "*Cross-reference data: [openbible.info](https://www.openbible.info/labs/cross-references/), CC-BY.*", "");
  fs.writeFileSync(path.join(outDir, `${BOOK} ${ch} — Cross References.md`), lines.join("\n"));
  written++;
}
console.log(`Wrote ${written} cross-reference notes for ${BOOK} (top ${TOP_N}/verse)`);
