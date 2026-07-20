// Validates enrichment notes: every wikilink resolves to a real vault file and
// every [[Target#^n]] block anchor exists in its target. Scans only the frozen
// enrichment folders; never touches translation files.
// Usage: node tools/validate-enrichment.js "<vault root>" [--json]
// Exit codes: 0 = clean, 1 = findings, 2 = usage error.
const fs = require("fs");
const path = require("path");

const ENRICH_DIRS = [
  "Bible/Cross Reference",
  "Bible/Study Hubs",
  "Bible/Word Studies",
  "Bible/Places",
  "Bible/Catena",
  "Bible/Commentary",
  "Bible/Book Intros",
  "Bible/Reference",
];

const args = process.argv.slice(2);
const VAULT = args.find(a => !a.startsWith("--"));
if (!VAULT || !fs.existsSync(VAULT) || !fs.statSync(VAULT).isDirectory()) {
  console.error('Usage: node tools/validate-enrichment.js "<vault root>" [--json]');
  process.exit(2);
}

// ── vault index: filename stem → absolute path ──────────────────────────────
function walkMd(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMd(abs, out);
    else if (entry.name.endsWith(".md")) out.push(abs);
  }
  return out;
}

// Frontmatter aliases: inline arrays (aliases: ["A", B]) and block lists (- A).
function aliasesOf(abs) {
  const text = fs.readFileSync(abs, "utf8");
  if (!text.startsWith("---")) return [];
  const end = text.indexOf("\n---", 3);
  if (end === -1) return [];
  const fm = text.slice(3, end);
  const out = [];
  const inline = fm.match(/^aliases:\s*\[([^\]]*)\]/m);
  if (inline) {
    for (const part of inline[1].split(",")) {
      const a = part.trim().replace(/^["']|["']$/g, "");
      if (a) out.push(a);
    }
  } else {
    const block = fm.match(/^aliases:\s*\n((?:\s+-\s+.*\n?)+)/m);
    if (block) {
      for (const line of block[1].split("\n")) {
        const m = line.match(/^\s+-\s+(.*)/);
        if (m) {
          const a = m[1].trim().replace(/^["']|["']$/g, "");
          if (a) out.push(a);
        }
      }
    }
  }
  return out;
}

const index = new Map(); // stem or alias → absolute path
for (const abs of walkMd(VAULT)) {
  index.set(path.basename(abs, ".md"), abs);
  for (const alias of aliasesOf(abs)) {
    if (!index.has(alias)) index.set(alias, abs); // real filename stems win over aliases
  }
}

// ── scan enrichment files ────────────────────────────────────────────────────
const LINK_RE = /!?\[\[([^\]]+)\]\]/g;
const findings = [];
let filesChecked = 0;
let linksChecked = 0;
const targetCache = new Map(); // abs path → file content

function contentOf(abs) {
  if (!targetCache.has(abs)) targetCache.set(abs, fs.readFileSync(abs, "utf8"));
  return targetCache.get(abs);
}

for (const rel of ENRICH_DIRS) {
  const dir = path.join(VAULT, rel);
  if (!fs.existsSync(dir)) continue;
  for (const abs of walkMd(dir)) {
    filesChecked++;
    const relFile = path.relative(VAULT, abs);
    const text = contentOf(abs);
    for (const m of text.matchAll(LINK_RE)) {
      const raw = m[1];
      // In a table cell the alias pipe is escaped ("[[Target#^8\|label]]") — that
      // backslash is table syntax, not part of the target. Unescape before splitting.
      const link = raw.replace(/\\\|/g, "|").split("|")[0];
      const [targetPart, anchor] = link.split("#");
      const target = path.basename(targetPart.trim()); // folder-qualified links resolve by stem
      if (!target) continue; // self-referencing [[#^n]] — out of scope
      linksChecked++;
      const targetAbs = index.get(target);
      if (!targetAbs) {
        findings.push({ file: relFile, link: raw, kind: "file-target" });
        continue;
      }
      if (anchor && anchor.startsWith("^")) {
        const blockId = anchor.slice(1);
        const re = new RegExp("\\^" + blockId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)", "m");
        if (!re.test(contentOf(targetAbs))) {
          findings.push({ file: relFile, link: raw, kind: "block-anchor" });
        }
      }
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const ok = findings.length === 0;
if (args.includes("--json")) {
  console.log(JSON.stringify({ ok, filesChecked, linksChecked, findings }, null, 2));
} else if (ok) {
  console.log(`OK — ${filesChecked} files, ${linksChecked} links checked`);
} else {
  for (const f of findings) {
    console.log(`BROKEN ${f.kind} in "${f.file}": [[${f.link}]]`);
  }
  console.log(`FAIL — ${findings.length} broken of ${linksChecked} links in ${filesChecked} files`);
}
process.exit(ok ? 0 : 1);
