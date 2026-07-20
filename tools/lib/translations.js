// Shared knowledge of "what translations does this vault have?", so the search
// build and the hub generator can't drift apart and start disagreeing.
//
// A translation is any folder under Bible/ that holds canonical book folders.
// Nothing is hardcoded: drop in Bible/BSB/ (see tools/import-bible.js) and both
// the search and new hubs pick it up.
const fs = require("fs");
const path = require("path");

// Canonical book names, in canonical order.
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

// Display order. Anything unlisted sorts after these, alphabetically. The first
// one that exists becomes the search's default translation.
const PREFERRED = ["ESV", "NLT", "BSB", "AMP", "KJV", "WEB"];

// Folders under Bible/ that are emphatically not translations.
const NON_TRANSLATION = new Set([
  "Cross Reference", "Study Hubs", "Word Studies", "Places", "Catena",
  "Commentary", "Book Intros", "Reference", "Templates", "search-data",
]);

function detectTranslations(vault) {
  const base = path.join(vault, "Bible");
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter(e => e.isDirectory() && !NON_TRANSLATION.has(e.name) && !e.name.startsWith("."))
    .map(e => e.name)
    .filter(name => ORDER.some(b => fs.existsSync(path.join(base, name, b))))
    .sort((a, b) => {
      const ia = PREFERRED.indexOf(a), ib = PREFERRED.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
}

// The anchor translation owns the bare "Ruth 1" stem — no "(TRANS)" suffix — and is
// what every cross-reference and word study links to (PRD TD-2). Detected by looking
// for a chapter file with no suffix rather than assuming it's the KJV.
function detectAnchor(vault, translations) {
  const probeBooks = ["Genesis", "Ruth", "John"];
  for (const t of translations) {
    for (const book of probeBooks) {
      const dir = path.join(vault, "Bible", t, book);
      if (fs.existsSync(dir) && fs.existsSync(path.join(dir, `${book} 1.md`))) return t;
    }
  }
  return null;
}

// How a chapter file is named in this translation: "Ruth 1.md" vs "Ruth 1 (BSB).md".
const suffixFor = (trans, anchor) => (trans === anchor ? "" : ` (${trans})`);

module.exports = { ORDER, PREFERRED, NON_TRANSLATION, detectTranslations, detectAnchor, suffixFor };
