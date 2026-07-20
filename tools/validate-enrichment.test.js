// Tests for validate-enrichment.js — runs against throwaway fixture vaults in a
// temp dir, never the real vault.
// Usage: node --test tools/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPT = path.join(__dirname, "validate-enrichment.js");

function makeVault(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

function run(root, ...flags) {
  return spawnSync("node", [SCRIPT, root, ...flags], { encoding: "utf8" });
}

test("empty_scaffold_passes", () => {
  const root = makeVault({ "Bible/KJV/Ruth/Ruth 1.md": "# Ruth 1\n\n**1** Text. ^1\n" });
  const r = run(root);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stdout} ${r.stderr}`);
  assert.match(r.stdout, /OK/);
});

test("resolving_link_and_block_anchor_pass", () => {
  const root = makeVault({
    "Bible/KJV/Ruth/Ruth 1.md":
      "# Ruth 1\n\n**8** And Naomi said... ^8\n",
    "Bible/Cross Reference/Ruth 1.md":
      "# Ruth 1 — cross references\n\nSee [[Ruth 1]] and [[Ruth 1#^8|Ruth 1:8]].\n",
  });
  const r = run(root);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stdout} ${r.stderr}`);
  assert.match(r.stdout, /1 files, 2 links checked/);
});

test("broken_file_target_fails_with_named_finding", () => {
  const root = makeVault({
    "Bible/KJV/Ruth/Ruth 1.md": "# Ruth 1\n\n**8** Text. ^8\n",
    "Bible/Cross Reference/Ruth 1.md": "See [[Ruht 1]].\n", // typo'd target
  });
  const r = run(root);
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}: ${r.stdout}`);
  assert.match(r.stdout, /BROKEN file-target in "Bible\/Cross Reference\/Ruth 1\.md": \[\[Ruht 1\]\]/);
});

test("broken_block_anchor_fails_with_named_finding", () => {
  const root = makeVault({
    "Bible/KJV/Ruth/Ruth 1.md": "# Ruth 1\n\n**8** Text. ^8\n",
    "Bible/Word Studies/H2617 chesed.md": "Occurs at [[Ruth 1#^99|Ruth 1:99]].\n",
  });
  const r = run(root);
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}: ${r.stdout}`);
  assert.match(r.stdout, /BROKEN block-anchor in "Bible\/Word Studies\/H2617 chesed\.md": \[\[Ruth 1#\^99\|Ruth 1:99\]\]/);
});

test("alias_target_resolves", () => {
  const root = makeVault({
    "Bible/ESV/Ruth/Ruth 1 (ESV).md":
      '---\ntags: [bible, bible/esv]\naliases: ["Ruth 1 ESV", "Ruth One"]\n---\n# Ruth 1\n\n**8** Text. ^8\n',
    "Bible/Study Hubs/Ruth 1 Hub.md": "Read in [[Ruth One]].\n",
  });
  const r = run(root);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stdout}`);
  assert.match(r.stdout, /1 links checked/);
});

// Inside a markdown table the alias pipe must be escaped ("[[Target#^8\|label]]"),
// or the cell breaks. The escape is part of the table syntax, not the link target.
test("escaped_pipe_in_table_link_resolves", () => {
  const root = makeVault({
    "Bible/KJV/Ruth/Ruth 1.md": "# Ruth 1\n\n**8** Text. ^8\n",
    "Bible/Study Hubs/Ruth 1 Hub.md":
      "| Movement | Where |\n| --- | --- |\n| The vow | [[Ruth 1#^8\\|Ruth 1:8]] |\n",
  });
  const r = run(root);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stdout}`);
  assert.match(r.stdout, /1 links checked/);
});

test("json_output_matches_shape", () => {
  const root = makeVault({
    "Bible/KJV/Ruth/Ruth 1.md": "# Ruth 1\n\n**8** Text. ^8\n",
    "Bible/Cross Reference/Ruth 1.md": "Good: [[Ruth 1#^8]]. Bad: [[Nowhere]].\n",
  });
  const r = run(root, "--json");
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.equal(out.filesChecked, 1);
  assert.equal(out.linksChecked, 2);
  assert.deepEqual(out.findings, [
    { file: "Bible/Cross Reference/Ruth 1.md", link: "Nowhere", kind: "file-target" },
  ]);
});
