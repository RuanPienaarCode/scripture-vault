# Scripture Vault

A personal Bible study system for [Obsidian](https://obsidian.md): the whole Bible as
vault notes, a fast full-text search + reader hosted in a first-class Obsidian view,
and an enrichment layer (cross-references, study hubs, commentary, book intros)
generated from open datasets.

Everything in this repository is legal to share: the code, the tooling, the vendored
open datasets, and download access to **public-domain translations only** (KJV, BSB,
WEB). Copyrighted translations (ESV, NLT, AMP…) are supported by the tooling but you
must have the rights to store them — see [Licensing](#licensing).

## Quick start (no terminal needed)

1. **Get the vault.** Either clone this repo and open the folder as an Obsidian vault,
   or download it as a ZIP and unzip it anywhere.
2. **Open it in Obsidian** → allow community plugins when prompted (the vault ships
   with one plugin: **Bible Search**).
3. **Follow the setup wizard.** On first run the plugin opens a short wizard:
   - pick where the search page lives (default `Bible Search.html`),
   - choose translations to download — **KJV** and **BSB** are pre-selected, **WEB**
     optional; all three are public domain and fetched from
     [bible.helloao.org](https://bible.helloao.org),
   - the wizard downloads the text (a few minutes per translation), builds the search
     page, and opens it.
4. **Read and search.** Click the book icon in the ribbon any time, search any phrase,
   switch translations, and click a verse to open its vault note.

Re-run the wizard any time: command palette → **Set up Bible Search**. Rebuild after
editing content: command palette → **Rebuild search index** (or the button in
Settings → Bible Search).

## Adding the plugin to an existing vault

Copy `.obsidian/plugins/bible-search/` into your vault's `.obsidian/plugins/`, enable
**Bible Search** in Settings → Community plugins, and run the setup wizard. The wizard
downloads the search template from this repository automatically if your vault doesn't
have it.

## What's in the box

| Path | What it is |
| --- | --- |
| `.obsidian/plugins/bible-search/` | The plugin: hosts the search page in an Obsidian view, first-run wizard, translation downloader, in-app index builder |
| `Bible/bible-search-template.html` | The search/reader UI template (self-contained, works on desktop and mobile) |
| `Bible/build-bible-search.js` | Node builder — same output as the in-app rebuild, for terminal/CI use |
| `Bible/README.md` | The content contract: folder layout, verse-line format, anchor translation rules |
| `tools/import-bible.js` | Node importer for any translation on bible.helloao.org |
| `tools/gen-*.js` | Enrichment generators: cross-references, study hubs, commentary, book intros (Node) |
| `sources/` | Vendored open datasets the generators read — see `sources/README.md` for licences and attribution |
| `Teaching/` | Drop article folders here and they join the search index — see its README |
| `docs/` | Setup guide and the enrichment layout spec |

## The enrichment layer (optional, needs Node.js)

With Node installed, run from the vault root:

```sh
node tools/gen-crossrefs.js .      # cross-reference notes per chapter (openbible.info data)
node tools/gen-hubs.js .           # study hub per chapter
node tools/gen-commentary.js .     # public-domain commentary excerpts (CCEL)
node tools/gen-book-intros.js .    # one intro note per book
node "Bible/build-bible-search.js" . "Bible/bible-search-template.html" "Bible Search.html"
```

`tools/README.md` documents each generator, the order, and the validation drill.

## Licensing

**Bible text.** The wizard and importer only auto-download translations that are
public domain: **KJV**, **BSB** (public domain since 2023), and **WEB**. Copyrighted
translations — ESV, NLT, AMP and most modern versions — licence *passage* quotation,
not whole-Bible storage, so they are not offered for download and their text is not in
this repository. If you have rights to a translation's full text, the importer's file
format (`Bible/README.md`) shows exactly the shape to feed it in.

**Never share a built `Bible Search.html` from a vault containing copyrighted
translations or articles** — the page embeds the full text. Each person builds their
own from their own vault; the wizard makes that painless.

**Datasets.** `sources/` vendors open data — cross-references from
[openbible.info](https://www.openbible.info/labs/cross-references/) (CC-BY),
[openscriptures](https://github.com/openscriptures) data, and public-domain commentary
from [CCEL](https://www.ccel.org/). Attribution details are in `sources/README.md`.

**Code.** MIT — see [LICENSE](LICENSE).

## Credits

- Bible text API: [bible.helloao.org](https://bible.helloao.org) (Free Use Bible API)
- Cross-reference data: openbible.info · Commentary: CCEL · Lexical data: openscriptures
