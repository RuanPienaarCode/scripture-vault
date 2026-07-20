# Vendored source datasets (issue I2)

Downloaded once at build time; the vault never fetches anything at read time
(PRD invariant). Generators read from here only. Licences below are conditions
of use — keep attribution lines in any generated note that embeds this data.

| File | Contents | Source | Licence | Fetched |
| --- | --- | --- | --- | --- |
| `openbible/cross_references.txt` | 344,799 ranked cross-references (TSV: From, To, Votes) | openbible.info/labs/cross-references | CC-BY (attribution: openbible.info) | 2026-07-15 |
| `openbible/geocoding-ancient.jsonl` | Geocoded ancient places (lat/lon, identifications) | github.com/openbibleinfo/Bible-Geocoding-Data | CC-BY 4.0 (some derived data OSM/ODbL) | 2026-07-15 |
| `openscriptures/StrongHebrew.xml` | Strong's Hebrew dictionary (H1–H8674), OSIS XML | github.com/openscriptures/strongs | Public domain | 2026-07-15 |
| `openscriptures/StrongGreek.xml` | Strong's Greek dictionary (G1–G5624), XML | github.com/openscriptures/strongs | Public domain | 2026-07-15 |
| `openscriptures/BrownDriverBriggs.xml` | BDB Hebrew lexicon, XML | github.com/openscriptures/HebrewLexicon | PD text; CC-BY 4.0 markup | 2026-07-15 |
| `openscriptures/LexicalIndex.xml` | Bridge index: Strong's ↔ BDB ↔ TWOT | github.com/openscriptures/HebrewLexicon | CC-BY 4.0 | 2026-07-15 |

## Deferred (fetch when the consuming issue starts)

- **STEP Bible TAHOT / TAGNT / TBESG** (github.com/STEPBible/STEPBible-Data, CC BY 4.0) —
  tagged Hebrew OT / Greek NT with per-word Strong's numbers. Large files
  (~150 MB+) that only the bulk lexicon generator (issue I15) consumes; not
  vendored yet to spare iCloud sync on mobile. The Ruth PoC's occurrence lists
  (I7) are small enough to verify by hand against the KJV text.
- ~~CCEL ANF/NPNF volumes~~ — **five volumes vendored 2026-07-15** into `ccel/`
  (plain-text cache files, PD 19th-c. translations): `anf01` (Irenaeus), `anf02`
  (Theophilus), `npnf101` (Augustine *Confessions*), `npnf102` (Augustine *City of
  God*), `npnf208` (Basil, *Hexaemeron*). Further volumes fetched as catena work
  reaches Father-dense books (I17).
- **PD commentaries** (HelloAO / TheologAI SQLite) — fetched when commentary wiring (I11) starts.

## Reference verse notation

`openbible/cross_references.txt` uses OSIS-style refs (`Gen.1.1`, `Ruth.1.8`);
ranges appear as `Gen.1.1-Gen.1.3`. The cross-ref generator must map these to
vault chapter files + block anchors, and must degrade ranges explicitly
(link the first verse, keep the range text visible) per the PRD testing note.
