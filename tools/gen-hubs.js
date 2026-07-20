// Generates per-chapter Study Hub notes (the TD-3 entry point) for a book.
// NEVER overwrites a hand-curated hub. Writes ONLY to Bible/Study Hubs/
// (PRD TD-1); idempotent (second run: zero diff).
//
// Default: skip every hub that already exists — curated hubs always win.
// --force: regenerate hubs this generator wrote (frontmatter `generated: true`)
//   so template changes reach them, while still skipping curated ones. That
//   marker is the whole safety mechanism; don't remove it from the template.
//
// Usage: node tools/gen-hubs.js "<vault root>" "<Book>" [--force]
const fs = require("fs");
const path = require("path");
const { detectTranslations, detectAnchor, suffixFor } = require("./lib/translations.js");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const [VAULT, BOOK] = args.filter(a => !a.startsWith("--"));
if (!VAULT || !BOOK) {
  console.error('Usage: node tools/gen-hubs.js "<vault root>" "<Book>" [--force]');
  process.exit(2);
}

const TRANSLATIONS = detectTranslations(VAULT);
const ANCHOR = detectAnchor(VAULT, TRANSLATIONS);
if (!ANCHOR) {
  console.error("No anchor translation found — one translation must use unsuffixed chapter files (\"Ruth 1.md\").");
  process.exit(2);
}
// Chapter numbers come from the anchor: it owns the bare stems the hubs link to.
const anchorDir = path.join(VAULT, "Bible", ANCHOR, BOOK);
if (!fs.existsSync(anchorDir)) {
  console.error(`No ${ANCHOR} folder for ${BOOK}`);
  process.exit(2);
}
const chapters = fs.readdirSync(anchorDir)
  .map(f => { const m = f.match(new RegExp(`^${BOOK} (\\d+)\\.md$`)); return m ? +m[1] : null; })
  .filter(Boolean)
  .sort((a, b) => a - b);

const outDir = path.join(VAULT, "Bible", "Study Hubs");
fs.mkdirSync(outDir, { recursive: true });

const exists = rel => fs.existsSync(path.join(VAULT, rel));
let written = 0, skipped = 0, curated = 0;

// A hub is ours to rewrite only if we wrote it — anything without the marker is
// hand-curated and untouchable, --force or not.
function isGenerated(p) {
  const text = fs.readFileSync(p, "utf8");
  const end = text.indexOf("\n---", 3);
  return text.startsWith("---") && end !== -1 && /^generated:\s*true\s*$/m.test(text.slice(3, end));
}

for (const ch of chapters) {
  const outPath = path.join(outDir, `${BOOK} ${ch} Hub.md`);
  if (fs.existsSync(outPath)) {
    if (!FORCE) { skipped++; continue; }
    if (!isGenerated(outPath)) { curated++; continue; } // curated always wins
  }

  const prev = ch > 1 ? `[[${BOOK} ${ch - 1} Hub|← ${BOOK} ${ch - 1}]]` : `[[${BOOK} (KJV)|Book of ${BOOK}]]`;
  const next = ch < chapters[chapters.length - 1] ? `[[${BOOK} ${ch + 1} Hub|${BOOK} ${ch + 1} →]]` : `[[${BOOK} (KJV)|Book of ${BOOK}]]`;

  const fathersLine = exists(`Bible/Catena/${BOOK} ${ch} — Fathers.md`)
    ? `- [[${BOOK} ${ch} — Fathers]]` : null;
  const henryLine = exists(`Bible/Commentary/${BOOK} ${ch} — Matthew Henry.md`)
    ? `- [[${BOOK} ${ch} — Matthew Henry]] — full chapter exposition` : null;
  const commentary = [fathersLine, henryLine].filter(Boolean);

  const lines = [
    "---",
    "tags: [bible, bible/study-hub]",
    `aliases: ["${BOOK} ${ch} Study"]`,
    `book: "${BOOK}"`,
    `chapter: ${ch}`,
    "generated: true",
    "---",
    "",
    `# ${BOOK} ${ch} — Study Hub`,
    "",
    // Only link what this vault actually has — "[[Bible]]" is a hub note that exists
    // in some vaults and not others, and a dead link fails the validator.
    ["`Part of`"].length && [
      `Part of [[${BOOK} (${ANCHOR})|${BOOK}]]`,
      exists(`Bible/Book Intros/${BOOK} — Introduction.md`) ? `[[${BOOK} — Introduction|Introduction]]` : null,
      exists("Bible.md") || exists("Bible/Bible.md") ? "[[Bible]]" : null,
    ].filter(Boolean).join(" · "),
    "",
    "## Read",
    "",
    // Link whichever translations this vault actually has — a hardcoded list would
    // emit dead links (and fail the validator) on a vault with a different set.
    TRANSLATIONS.map(t => `[[${BOOK} ${ch}${suffixFor(t, ANCHOR)}|${t}]]`).join(" · "),
    "",
    "## Cross references",
    "",
    exists(`Bible/Cross Reference/${BOOK} ${ch} — Cross References.md`)
      ? `[[${BOOK} ${ch} — Cross References]]`
      : "*(not yet generated)*",
    "",
    "## Word studies",
    "",
    "*(come with the word-study wave — add links here as studies are created)*",
    "",
    "## Fathers & commentary",
    "",
    ...(commentary.length ? commentary : ["*(none yet)*"]),
    "",
    "## Next",
    "",
    `${prev} · ${next}`,
    "",
  ];
  fs.writeFileSync(outPath, lines.join("\n"));
  written++;
}
console.log(
  `${BOOK}: wrote ${written} hubs` +
  (skipped ? `, skipped ${skipped} existing` : "") +
  (curated ? `, left ${curated} curated untouched` : "")
);
