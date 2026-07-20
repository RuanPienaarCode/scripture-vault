# tools — generators and validators

Every generator takes the **vault root** as its first argument (`.` when run from
the vault) and is **idempotent**: same input, byte-identical output. All of them
write only to their own folder — translation files under `Bible/{ESV,NLT,AMP,KJV}/`
are read-only to everything here (PRD TD-1).

Note shapes these produce are frozen in [[docs/enrichment-layout|docs/enrichment-layout.md]].
Vendored input datasets and their licences are in [[sources/README|sources/README.md]].

## The generators

| Command | Writes to | Reads |
| --- | --- | --- |
| `node Bible/build-bible-search.js . "Bible/bible-search-template.html" "Bible Search.html"` | `Bible Search.html` | `Bible/{TRANS}/` + all of `Teaching/` |
| `node tools/gen-crossrefs.js . "<Book>" [topN]` | `Bible/Cross Reference/` | `sources/openbible/cross_references.txt` |
| `node tools/gen-hubs.js . "<Book>"` | `Bible/Study Hubs/` | the translation + enrichment folders |
| `node tools/gen-commentary.js . <id> "<Display Name>" "<Book>" "<OSIS>"` | `Bible/Commentary/` | `sources/commentary/<id>/<OSIS>.<ch>.json` |
| `node tools/gen-book-intros.js . ["<Book>"]` | `Bible/Book Intros/` | `tools/data/book-intros.js` |
| `node tools/import-bible.js . <TRANS> [--api <id>] [--anchor] [--book "<Book>"]` | `Bible/{TRANS}/` | bible.helloao.org |

Examples:

```sh
node tools/gen-crossrefs.js . "Ruth" 10
node tools/gen-hubs.js . "Ruth"
node tools/gen-commentary.js . matthew-henry "Matthew Henry" "Genesis" "GEN"
```

`gen-hubs.js` **never overwrites an existing hub** — hand-curated hubs always win,
the generator only fills gaps. Pass `--force` to rewrite hubs the generator itself
wrote (those carrying `generated: true` in frontmatter) when the template changes;
curated hubs are still skipped. The others regenerate their notes wholesale.

`gen-book-intros.js` renders prose from `tools/data/book-intros.js` — **edit the data,
not the notes**. Authorship and dating are editorial synthesis, not a vendored dataset;
where scholarship genuinely disagrees the entry says so rather than picking a side.

## Order

Cross-references, word studies, places, catena, and commentary are independent —
run them in any order. **Hubs last**, since a hub links whatever enrichment exists
for its chapter. Rebuild the search after any content change.

```
gen-crossrefs / gen-commentary / …   →   gen-hubs   →   build-bible-search
```

## Validate

```sh
node tools/validate-enrichment.js . [--json]      # 0 = clean · 1 = findings · 2 = usage
node --test tools/validate-enrichment.test.js
```

Checks that every wikilink resolves to a real file and every `[[Target#^n]]` block
anchor exists in its target. Run after every generation wave and before committing
enrichment.

## Regeneration drill

Proves a generator didn't touch enrichment it doesn't own and didn't break links.
Commit enrichment first, or "unchanged" means nothing — the drill enforces this.

```sh
tools/regen-drill.sh node "Bible/build-bible-search.js" . "Bible/bible-search-template.html" "Bible Search.html"
```

Exit `0` = safe · `1` = generator touched enrichment or broke links · `2` = setup error.

## Translations

Which translations exist is **detected from the folders under `Bible/`** — see
`tools/lib/translations.js`, shared by the search build and the hub generator so they
can't disagree. Drop in a new one and it appears in the search and in new hubs with no
code change. Display order and the default translation come from `PREFERRED` there.

One translation is the **anchor**: it uses unsuffixed chapter files (`Ruth 1.md`) and so
owns the bare `Ruth 1` stem that every cross-reference and word study links to (PRD TD-2).
That's the KJV, and it should stay the KJV — Strong's numbers key to it natively, and
moving the anchor means regenerating every cross-reference.

```sh
node tools/import-bible.js . BSB --book Ruth        # try one book first
node tools/import-bible.js . BSB                    # whole Bible
node tools/import-bible.js . KJV --api eng_kjv --anchor
```

Only import what you may legally store: **BSB is public domain (CC0, 2023)**, KJV and WEB
are public domain. ESV/NLT/AMP are not — their APIs licence single passages, not
whole-Bible copies. To set this up on someone else's vault see
[[docs/starter-kit-setup|docs/starter-kit-setup.html]].

## The search payload

`Bible Search.html` is **one self-contained file** — ~20 MB, no companion files, works
offline by itself. That portability is a requirement, not an accident: don't split the
verse text into sidecars.

It's still cheap to open. The payloads sit in `<script type="application/json">` tags,
which the JS engine never parses — the HTML parser treats them as text. The page
`JSON.parse`s one translation on first search (~5 ms) and caches it, so ~50 KB is parsed
at boot instead of 19.7 MB. `STRUCT` (the browse dropdown's book/chapter/verse map) is
precomputed here rather than derived by scanning 124k rows at boot.

The build skips the write when the output is byte-identical, so an unrelated rebuild
costs iCloud nothing.

To test the page outside Obsidian, serve it and open it — copying it somewhere empty
first is a good portability check:

```sh
python3 -m http.server 8899   # then open http://127.0.0.1:8899/Bible%20Search.html
```

## Reading the search build output

```
ESV: 31,104 verses
NLT: 31,104 verses
AMP: 31,102 verses
KJV: 31,102 verses
Articles: 316 (Community 1 · Desiring God 1 · Example Ministry 314)
```

Verse counts that drop, a missing per-source article count, or a `problems:` list
mean a note is off-shape. [[Bible/README|Bible/README.md]] documents the chapter-note
contract; [[Teaching/README|Teaching/README.md]] documents the article one.
