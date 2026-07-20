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
| `tools/import-bible.js` | Node importer for any translation on bible.helloao.org (the wizard does this in-app) |
| `Teaching/` | Drop article folders here and they join the search index — see its README |
| `docs/` | Setup guide and the enrichment layout spec |

## The enrichment layer (parked for now)

An optional Node-powered enrichment layer exists — generators for per-chapter
cross-references (openbible.info data), study hubs, public-domain commentary
excerpts (CCEL), and book intros, plus a link validator and its test suite. It is
**not in the current tree**: the generators and their ~50 MB of vendored datasets
are parked to keep this repo focused on the plugin-and-search core, which needs
no Node.js at all.

Everything is preserved at the `v1.1.0` tag. To bring it back:

```sh
git checkout v1.1.0 -- sources tools docs
```

then follow `tools/README.md` (as restored) for the generator order and the
validation drill. The note shapes the generators write are frozen in
`docs/enrichment-layout.md`, which stays in the tree.

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

**Datasets.** The parked enrichment kit vendors open data under `sources/` —
cross-references from [openbible.info](https://www.openbible.info/labs/cross-references/)
(CC-BY), [openscriptures](https://github.com/openscriptures) data, and public-domain
commentary from [CCEL](https://www.ccel.org/). Attribution details are in
`sources/README.md` at the `v1.1.0` tag.

**Code.** MIT — see [LICENSE](LICENSE).

## Credits

- Bible text API: [bible.helloao.org](https://bible.helloao.org) (Free Use Bible API)
- Cross-reference data: openbible.info · Commentary: CCEL · Lexical data: openscriptures
