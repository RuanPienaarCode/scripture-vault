# Scripture Vault

A complete Bible study vault for [Obsidian](https://obsidian.md) — the whole Bible as
notes, full-text search and reading in a pane, and an enrichment layer built from open
datasets.

**Start:** clone or download this repo → open the folder as a vault in Obsidian → allow
community plugins → follow the setup wizard. No terminal needed.

---

## What's inside

| | |
| --- | --- |
| **The Bible as notes** | Every chapter a note, every verse linkable. Downloaded on first run. |
| **Search and reader** | A self-contained page hosted in an Obsidian view. Desktop and mobile. |
| **Highlights and notes** | Highlight, bookmark and annotate any verse. Stored per verse, so they survive a rebuild or a change of translation. |
| **Timeline and Translations** | Bible and church history on a single timeline, and two dozen English translations compared. |
| **Bible Search plugin** | Ships with the vault. Runs the wizard, downloads text, builds the index. |
| **Teaching layout** | Drop article folders in `Teaching/` and they join the search index. |
| **Layer packs** | Dictionary, prayers, On This Day, Church History and maps, fetched on demand. |

## Setup

The wizard asks two questions:

- **Where does the search page live?** Default: `Bible Search.html` at the vault root.
- **Which translations?** KJV and BSB by default, WEB optional. All public domain, from
  [bible.helloao.org](https://bible.helloao.org).

A few minutes per translation, then it builds and opens. Click the book icon in the
ribbon any time.

Re-run from the command palette: **Bible Search: Run setup wizard** — that's also where
you add the optional extras (dictionary, maps, church history, on this day, prayers).
After editing content: **Bible Search: Rebuild search index** (or the button in
Settings → Bible Search).

### Adding it to a vault you already have

Copy `.obsidian/plugins/bible-search/` into your vault's `.obsidian/plugins/`, enable
**Bible Search** in Settings → Community plugins, and run the wizard. It fetches the
search template from this repo if your vault doesn't have one.

## Layout

| Path | What it is |
| --- | --- |
| `.obsidian/plugins/bible-search/` | The plugin — view, wizard, downloader, index builder |
| `Bible/bible-search-template.html` | The search/reader UI template |
| `Bible/build-bible-search.js` | Node builder — same output as the in-app rebuild, for CI |
| `Bible/README.md` | The content contract: folder layout, verse-line format, anchor rules |
| `tools/import-bible.js` | Node importer for any translation on bible.helloao.org |
| `Teaching/` | Article folders — see its README |
| `docs/` | Setup guide and the enrichment layout spec |
| `data/` | Layer packs the wizard fetches on demand |

## The enrichment layer (parked)

Generators for per-chapter cross-references, study hubs, public-domain commentary
excerpts and book intros — plus a link validator and its tests — are **not in the
current tree**. They and their ~50 MB of vendored datasets are parked so this repo
stays a plugin-and-search core that needs no Node.js at all.

Everything is preserved at the `v1.1.0` tag:

```sh
git checkout v1.1.0 -- sources tools docs
```

The note shapes those generators write stay frozen in `docs/enrichment-layout.md`,
which remains in the tree.

## Licensing

**Bible text.** Public domain only — **KJV**, **BSB** (public domain since 2023), and
**WEB**. Modern copyrighted translations (ESV, NLT, AMP…) licence *passage* quotation,
not whole-Bible storage, so they aren't offered and their text isn't in this repo. Hold
the rights to one? `Bible/README.md` shows the exact file format to feed it in.

> **Note: never share a built `Bible Search.html`** from a vault containing copyrighted
> translations or articles — the page embeds the full text. Each person builds their
> own; the wizard makes that painless.

**Datasets.** The parked enrichment kit vendors open data under `sources/` at the
`v1.1.0` tag — attribution details are in `sources/README.md` there.

**Code.** [PolyForm Noncommercial 1.0.0](LICENSE) — free for personal and other
noncommercial use; commercial use needs a separate licence.

## Support

Free, and staying that way. If you would like to say thanks:
[PayPal](https://www.paypal.com/paypalme/ruanpienaar86)

## Credits

- Bible text: [bible.helloao.org](https://bible.helloao.org) (Free Use Bible API)
- Cross-references: [openbible.info](https://www.openbible.info/labs/cross-references/) (CC-BY) · Commentary: [CCEL](https://www.ccel.org/) · Lexical data: [openscriptures](https://github.com/openscriptures)
- Place coordinates: [openbible.info Bible Geocoding Data](https://github.com/openbibleinfo/Bible-Geocoding-Data) (CC-BY 4.0) · Coastlines, lakes and rivers: [Natural Earth](https://www.naturalearthdata.com/) (public domain)
