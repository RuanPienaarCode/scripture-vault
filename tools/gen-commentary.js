// Generates per-chapter commentary notes from vendored HelloAO commentary JSON
// (sources/commentary/<id>/<OSIS>.<ch>.json, fetched once at build time).
// Writes ONLY to Bible/Commentary/ (PRD TD-1); idempotent.
// Usage: node tools/gen-commentary.js "<vault root>" <commentary-id> "<Display Name>" "<Book>" "<OSIS>"
//   e.g. node tools/gen-commentary.js . matthew-henry "Matthew Henry" "Genesis" "GEN"
const fs = require("fs");
const path = require("path");

const [, , VAULT, CID, CNAME, BOOK, OSIS] = process.argv;
if (!VAULT || !CID || !CNAME || !BOOK || !OSIS) {
  console.error('Usage: node tools/gen-commentary.js "<vault root>" <commentary-id> "<Display Name>" "<Book>" "<OSIS>"');
  process.exit(2);
}

const srcDir = path.join(VAULT, "sources", "commentary", CID);
const outDir = path.join(VAULT, "Bible", "Commentary");
fs.mkdirSync(outDir, { recursive: true });

const chapterFiles = fs.readdirSync(srcDir)
  .map(f => { const m = f.match(new RegExp(`^${OSIS}\\.(\\d+)\\.json$`)); return m ? { f, ch: +m[1] } : null; })
  .filter(Boolean)
  .sort((a, b) => a.ch - b.ch);

if (!chapterFiles.length) {
  console.error(`No ${OSIS}.*.json files in ${srcDir}`);
  process.exit(2);
}

let written = 0;
for (const { f, ch } of chapterFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8"));
  const chapter = data.chapter || {};
  const lines = [
    "---",
    "tags: [bible, commentary]",
    `aliases: ["${BOOK} ${ch} ${CNAME}"]`,
    `book: "${BOOK}"`,
    `chapter: ${ch}`,
    `commentator: "${CNAME}"`,
    "source: bible.helloao.org (public-domain text)",
    "---",
    "",
    `# ${BOOK} ${ch} — ${CNAME}`,
    "",
    `Part of [[${BOOK} ${ch} Hub]] · [[Bible]]`,
    "",
  ];
  if (chapter.introduction) {
    lines.push("## Chapter introduction", "", chapter.introduction.trim(), "");
  }
  for (const section of chapter.content || []) {
    if (section.type !== "verse") continue;
    const v = section.number;
    lines.push(`## ${BOOK} ${ch}:${v}`, "", `[[${BOOK} ${ch}#^${v}|→ read ${BOOK} ${ch}:${v}]]`, "");
    for (const para of section.content || []) {
      if (typeof para === "string") lines.push(para.trim(), "");
    }
  }
  lines.push("---", "", `*${CNAME}'s commentary is public domain; text via [bible.helloao.org](https://bible.helloao.org), vendored in \`sources/commentary/${CID}/\`.*`, "");
  fs.writeFileSync(path.join(outDir, `${BOOK} ${ch} — ${CNAME}.md`), lines.join("\n"));
  written++;
}
console.log(`Wrote ${written} ${CNAME} notes for ${BOOK}`);
