// Smoke test for the Bible Search plugin under plain Node.
// Run: node tools/plugin-smoke.test.js   (from the vault/repo root)
//
// Covers what the wizard's download-and-build path actually does: translation
// download against a faked API, anchor assignment, in-app index build against
// a faked vault, and the pure text helpers those two lean on.
"use strict";

const path = require("path");
const Module = require("module");

// Route require("obsidian") to the stub before the plugin loads.
const STUB = path.join(__dirname, "lib", "obsidian-stub.js");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "obsidian") return STUB;
  return origResolve.call(this, request, ...rest);
};

const stub = require("obsidian");
const pluginPath = path.join(__dirname, "..", ".obsidian", "plugins", "bible-search", "main.js");
const mod = require(pluginPath);
const T = mod.__testables;

let failures = 0;
const ok = (cond, name) => {
  console.log((cond ? "  ✓ " : "  ✗ ") + name);
  if (!cond) failures++;
};

(async () => {
  /* ── module shape ── */
  console.log("module");
  ok(typeof mod === "function", "plugin class exports");
  ok(typeof mod.OnboardingWizard === "function", "wizard exports");
  ok(T && T.BOOK_ORDER.length === 66 && T.BOOK_IDS.length === 66, "66 books, 66 USFM ids");
  ok(T.BOOK_IDS[T.BOOK_ORDER.indexOf("Song of Songs")] === "SNG", "Song of Songs → SNG");
  ok(T.DOWNLOADABLE.every((d) => ["KJV", "BSB", "WEB"].includes(d.trans)), "only public-domain downloads offered");

  /* ── pure helpers ── */
  console.log("helpers");
  ok(T.apiVerseText(["In the beginning", { text: "God created", poem: 1 }, { noteId: 1 }]) === "In the beginning God created", "apiVerseText flattens");
  ok(T.safeUrl("javascript:alert(1)") === "" && T.safeUrl("https://x.y") === "https://x.y", "safeUrl gate");
  const paras = T.toParagraphs("# Title\n\nPart of [[X]]\n\nSome **bold** prose with a [link](https://a.b).\n\n> [!abstract] Excerpt\n> hidden\n\nMore.");
  ok(paras.length === 2 && paras[0] === "Some bold prose with a link." && paras[1] === "More.", "toParagraphs cleans body");
  ok(T.fmList('tags: ["b c", a]', "tags").join("|") === "b c|a", "fmList inline");
  ok(T.isHub("type: study-hub") && !T.isHub("type: article"), "isHub");

  /* ── import against a faked API ── */
  console.log("importTranslation");
  const vault = new stub.FakeVault();
  const app = { vault };
  stub.__setRequestHandler((url) => {
    if (url.endsWith("/eng_kjv/books.json")) {
      return { json: { books: [{ id: "RUT", commonName: "Ruth", name: "Ruth", numberOfChapters: 2 }] }, text: "" };
    }
    const m = url.match(/\/eng_kjv\/RUT\/(\d+)\.json$/);
    if (m) {
      return {
        json: { chapter: { content: [
          { type: "verse", number: 1, content: [`Chapter ${m[1]} verse one`] },
          { type: "heading", content: ["not a verse"] },
          { type: "verse", number: 2, content: [{ text: "verse two", poem: 1 }, { noteId: 9 }] },
        ] } },
        text: "",
      };
    }
    throw new Error("unexpected url " + url);
  });
  const r = await T.importTranslation(app, { trans: "KJV", api: "eng_kjv", anchor: true }, () => {});
  ok(r.books === 1 && r.verses === 4, "1 book, 4 verses imported");
  ok(r.missing.length === 65, "books absent upstream are reported, not fatal");
  const ch1 = vault.docs.get("Bible/KJV/Ruth/Ruth 1.md");
  ok(!!ch1 && ch1.includes("**1** Chapter 1 verse one ^1"), "anchor chapter file, verse-line contract");
  ok(ch1.includes("**2** verse two ^2"), "poetry + footnote content flattened");
  ok(vault.docs.has("Bible/KJV/Ruth/Ruth (KJV).md"), "book note written with suffix");
  const before = vault.docs.get("Bible/KJV/Ruth/Ruth 1.md");
  await T.importTranslation(app, { trans: "KJV", api: "eng_kjv", anchor: true }, () => {});
  ok(vault.docs.get("Bible/KJV/Ruth/Ruth 1.md") === before, "re-import never overwrites");

  /* ── suffixed (non-anchor) import ── */
  stub.__setRequestHandler((url) => {
    if (url.endsWith("/BSB/books.json")) {
      return { json: { books: [{ id: "RUT", commonName: "Ruth", name: "Ruth", numberOfChapters: 1 }] }, text: "" };
    }
    if (/\/BSB\/RUT\/1\.json$/.test(url)) {
      return { json: { chapter: { content: [{ type: "verse", number: 1, content: ["BSB text"] }] } }, text: "" };
    }
    throw new Error("unexpected url " + url);
  });
  await T.importTranslation(app, { trans: "BSB", api: "BSB", anchor: false }, () => {});
  ok(vault.docs.has("Bible/BSB/Ruth/Ruth 1 (BSB).md"), "non-anchor files carry the suffix");

  /* ── survey + anchor detection ── */
  console.log("surveyTranslations");
  const s = T.surveyTranslations(app);
  ok(s.translations.join(",") === "BSB,KJV", "translations detected, preferred order");
  ok(s.anchor === "KJV", "anchor detected from bare stem");

  /* ── in-app build ── */
  console.log("buildSearchIndex");
  vault._file("Bible/bible-search-template.html",
    "<html>__DATA_SCRIPTS__|__BOOKS__|__TRANS__|__DEFAULT_TRANS__|__DEFAULT_TRANS_LABEL__|" +
    "__TRANS_MENU__|__TRANS_LIST__|__TRANS_DOT__|__TRANS_HIDDEN__|__STRUCT__|__ARTCOUNT__|__GENERATED__</html>");
  vault._file("Teaching/Example Ministry/Walking in Love.md",
    '---\ntitle: "Walking in Love"\ntopics: ["Love"]\n---\n\n# Walking in Love\n\nLove one another deeply.\n');
  vault._file("Teaching/Example Ministry/README.md", "# docs only");
  const b = await T.buildSearchIndex(app, "Bible Search.html", () => {});
  ok(b.verses === 5 && b.articles === 1, `5 verses + 1 article indexed (got ${b.verses}/${b.articles})`);
  const html = vault.docs.get("Bible Search.html");
  ok(!!html && html.includes('id="bd-KJV"') && html.includes('id="bd-BSB"'), "per-translation payloads emitted");
  ok(html.includes('"Chapter 1 verse one"'), "verse text present in payload");
  ok(html.includes("Love one another deeply."), "article body present in payload");
  ok(!html.includes("__BOOKS__") && !html.includes("__STRUCT__") && !html.includes("__GENERATED__"), "all placeholders replaced");
  ok(html.includes('data-t="ALL"'), "multi-translation menu gets an All entry");

  // Rebuild goes through modify, not create, and stays parseable.
  await T.buildSearchIndex(app, "Bible Search.html", () => {});
  ok(vault.docs.get("Bible Search.html").includes('id="bd-KJV"'), "rebuild over existing file works");

  /* ── wizard anchor assignment ── */
  console.log("wizard");
  const fakePlugin = { settings: { htmlPath: "Bible Search.html", openNotesInNewTab: true, onboarded: false }, saveSettings: async () => {} };
  const emptyVaultApp = { vault: new stub.FakeVault() };
  const wiz = new mod.OnboardingWizard(emptyVaultApp, fakePlugin);
  wiz.app = emptyVaultApp; // Modal stub doesn't set app from super in all Obsidian versions
  wiz.data.downloads = { KJV: true, BSB: true, WEB: false };
  const pending = wiz.pendingDownloads();
  ok(pending.length === 2 && pending[0].trans === "KJV" && pending[0].anchor === true, "first pick becomes anchor on a fresh vault");
  ok(pending[1].anchor === false, "second pick is suffixed");
  const wiz2 = new mod.OnboardingWizard(app, fakePlugin);
  wiz2.app = app; // vault already has a KJV anchor
  wiz2.data.downloads = { KJV: false, BSB: false, WEB: true };
  const p2 = wiz2.pendingDownloads();
  ok(p2.length === 1 && p2[0].trans === "WEB" && p2[0].anchor === false, "existing anchor is respected");

  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
