# tools

What remains here is the Node-optional half of the pipeline — everything a normal
user needs happens in-app through the plugin's wizard and *Rebuild search index*
command. These scripts are the terminal equivalents.

## Importing a translation (Node alternative to the wizard)

```sh
node tools/import-bible.js . BSB --book Ruth        # try one book first
node tools/import-bible.js . BSB                    # whole Bible
node tools/import-bible.js . KJV --api eng_kjv --anchor
```

Every command takes the **vault root** as its first argument (`.` when run from the
vault) and is idempotent. Only import what you may legally store: **KJV, BSB and WEB
are public domain**. ESV/NLT/AMP are not — their APIs licence single passages, not
whole-Bible copies.

One translation is the **anchor**: it uses unsuffixed chapter files (`Ruth 1.md`) and
owns the bare `Ruth 1` stem that everything links to. Keep it the KJV.

## Translations detection

Which translations exist is **detected from the folders under `Bible/`** — see
`tools/lib/translations.js`, shared by the Node search build so the two can't
disagree. Drop in a new translation folder and it appears in the search with no code
change. Display order and the default translation come from `PREFERRED` there.

## Rebuilding the search (Node alternative to the in-app rebuild)

```sh
node "Bible/build-bible-search.js" . "Bible/bible-search-template.html" "Bible Search.html"
```

`Bible Search.html` is **one self-contained file** — ~20 MB, no companion files,
works offline by itself. That portability is a requirement: don't split the verse
text into sidecars. The payloads sit in `<script type="application/json">` tags the
JS engine never parses at boot, so the page opens fast even on a phone; the build
skips the write when the output is byte-identical.

To test the page outside Obsidian:

```sh
python3 -m http.server 8899   # then open http://127.0.0.1:8899/Bible%20Search.html
```

## The enrichment generators (parked)

The cross-reference / study-hub / commentary / book-intro generators, the link
validator + its tests, the regeneration drill, and their vendored datasets
(`sources/`, ~50 MB) are parked to keep this repo light. They are preserved intact
at the **`v1.1.0` tag** — restore with:

```sh
git checkout v1.1.0 -- sources tools docs
```

The restored `tools/README.md` documents each generator, the run order (enrichment
first, hubs last, then rebuild the search), and the validation drill. The note
shapes they write are frozen in `docs/enrichment-layout.md`.

The plugin's Node smoke test (`tools/plugin-smoke.test.js` + `tools/lib/obsidian-stub.js`)
is parked at the same tag — developer tooling, not needed to use the vault.
