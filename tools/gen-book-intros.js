// Generates book introduction notes from tools/data/book-intros.js into
// Bible/Book Intros/. Writes ONLY there (PRD TD-1); idempotent.
//
// Filenames are "{Book} — Introduction.md", never bare "{Book}.md" — that stem
// belongs to the canon-formation notes in Bible History/Books/, and stems must
// stay unique vault-wide or [[Genesis]] becomes ambiguous.
//
// Usage: node tools/gen-book-intros.js "<vault root>" ["<Book>"]
//   omit <Book> to generate every book present in the data file
const fs = require("fs");
const path = require("path");

const DATA = require("./data/book-intros.js");

const [, , VAULT, ONE_BOOK] = process.argv;
if (!VAULT) {
  console.error('Usage: node tools/gen-book-intros.js "<vault root>" ["<Book>"]');
  process.exit(2);
}
if (ONE_BOOK && !DATA[ONE_BOOK]) {
  console.error(`No intro data for "${ONE_BOOK}". Known: ${Object.keys(DATA).length} books.`);
  process.exit(2);
}

const outDir = path.join(VAULT, "Bible", "Book Intros");
fs.mkdirSync(outDir, { recursive: true });

const exists = rel => fs.existsSync(path.join(VAULT, rel));
const books = ONE_BOOK ? [ONE_BOOK] : Object.keys(DATA);
let written = 0, missingText = [];

for (const book of books) {
  const d = DATA[book];

  // Only link what actually exists — the validator holds us to it.
  const hubLink = exists(`Bible/Study Hubs/${book} 1 Hub.md`) ? `[[${book} 1 Hub|Study Hub]]` : null;
  const canonLink = exists(`Bible History/Books/${book}.md`) ? `[[${book}|Canon history]]` : null;
  const kjvBook = exists(`Bible/KJV/${book}/${book} (KJV).md`) ? `[[${book} (KJV)|Read ${book}]]` : null;
  if (!exists(`Bible/KJV/${book}`)) missingText.push(book);

  // Every link here is conditional: these hub notes exist in a mature vault and not
  // in a fresh one, and the validator (rightly) fails on a link that goes nowhere.
  const related = [
    kjvBook,
    hubLink,
    canonLink,
    exists("Bible History/Bible History Timeline.md") ? "[[Bible History Timeline|Timeline]]" : null,
    exists("Bible History/Books/Books MOC.md") ? "[[Books MOC]]" : null,
  ].filter(Boolean);

  const lines = [
    "---",
    "tags: [bible, book-intro]",
    `aliases: ["${book} Introduction", "${book} Intro"]`,
    `book: "${book}"`,
    "generated: true",
    "---",
    "",
    `# ${book} — Introduction`,
    "",
    (exists("Bible.md") || exists("Bible/Bible.md")
      ? `Part of [[Bible]] · ${related.join(" · ")}`
      : `Part of ${related.join(" · ")}`),
    "",
    `> [!abstract] Theme`,
    `> ${d.theme}`,
    "",
    "| | |",
    "| --- | --- |",
    `| **Author** | ${d.author} |`,
    `| **Date** | ${d.date} |`,
    `| **Audience** | ${d.audience} |`,
    "",
    "## Outline",
    "",
    ...d.outline.map(o => `- ${o}`),
    "",
  ];

  if (d.note) lines.push("## Worth knowing", "", d.note, "");

  lines.push(
    "---",
    "",
    "*Introductions are an editorial synthesis, not a vendored dataset — where authorship or",
    "date is genuinely disputed the note says so rather than settling it. Edit",
    "`tools/data/book-intros.js` and regenerate; edits to this file are overwritten.*",
    "",
  );

  fs.writeFileSync(path.join(outDir, `${book} — Introduction.md`), lines.join("\n"));
  written++;
}

console.log(`Wrote ${written} book introduction${written === 1 ? "" : "s"}`);
if (missingText.length) console.log(`  note: no KJV folder for ${missingText.join(", ")}`);
