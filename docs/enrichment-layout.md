# Enrichment layout spec (frozen — issue I3)

The enrichment system writes **only** to these folders. Translation folders
(`Bible/KJV|ESV|NLT|AMP/`) are read-only to every generator (PRD TD-1).
`tools/validate-enrichment.js` scans exactly this list — renaming a folder here
means updating the script's `ENRICH_DIRS` and all generated links.

| Folder | Contains | Note shape |
| --- | --- | --- |
| `Bible/Cross Reference/` | One note per chapter: `{Book} {n} — Cross References.md` | Per-verse sections linking `[[{Book} {n}#^v]]` targets, top-10 by rank. **Never** bare `{Book} {n}.md` — that stem belongs to the KJV chapter file and must stay unique vault-wide |
| `Bible/Study Hubs/` | One note per chapter: `{Book} {n} Hub.md` | Links all 4 translation files + every enrichment layer for the chapter |
| `Bible/Word Studies/` | One note per Strong's number: `{H\|G}{n} {translit}.md` | Frontmatter `strongs:`, gloss, lemma, occurrence links to KJV anchors |
| `Bible/Places/` | One note per place: `{Place}.md` | Frontmatter `lat:`/`lon:` from OpenBible geocoding data |
| `Bible/Catena/` | One note per chapter *where material exists*: `{Book} {n} — Fathers.md` | PD patristic quotes with attribution, links to `Bible History/People` |
| `Bible/Commentary/` | One note per chapter per commentator: `{Book} {n} — {Name}.md` | PD commentary text with attribution |
| `Bible/Reference/` | Background notes on the biblical world: `Weights & Measures.md`, `Feasts & Sacred Calendar.md` | **Hand-curated — no generator.** Validated for link integrity like everything else, but safe to edit by hand |
| `Bible/Book Intros/` | One note per book: `{Book} — Introduction.md` | Author/date/audience, theme, outline. **Never** bare `{Book}.md` — that stem belongs to the canon notes in `Bible History/Books/` |

## Tag scheme

- Cross-reference notes: `tags: [bible, bible/cross-reference]`
- Study hubs: `tags: [bible, bible/study-hub]`
- Word studies: `tags: [bible, word-study, hebrew|greek]`
- Places: `tags: [bible, place]`
- Catena: `tags: [bible, catena]`
- Commentary: `tags: [bible, commentary]`
- Book intros: `tags: [bible, book-intro]`

All notes carry a `Part of [[…]]` breadcrumb line, matching vault house style.
Generated notes also carry `generated: true` — that marker is what lets
`gen-hubs.js --force` regenerate its own output while never touching a
hand-curated note.

## Anchor rule

The **KJV chapter files are the canonical verse anchors** (PRD TD-2): generated
enrichment links point at `[[{Book} {n}#^v]]`, which resolves to
`Bible/KJV/{Book}/{Book} {n}.md`. Other translations are linked per chapter from
the Study Hub, never per verse.

### The one deliberate exception: Topics/

The 93 hand-curated notes in `Topics/` anchor to **ESV**
(`[[Matthew 28 (ESV)#^18|Matthew 28:18]]`) — that convention predates this system
and is correct for hand-written thematic notes, where readability wins. The KJV
rule above governs **generated** enrichment, where Strong's numbers key to the KJV
text natively. Both are right; don't "fix" either into the other.

## Validation

```
node tools/validate-enrichment.js "<vault root>" [--json]
```

Exit 0 = clean · 1 = broken links (listed) · 2 = usage error.
Run after every generation wave and before every commit of enrichment content.
Tests: `node --test tools/validate-enrichment.test.js`.
