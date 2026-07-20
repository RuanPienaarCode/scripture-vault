# Teaching — article library

Everything under this folder is indexed into the **Articles** tab of Bible Search
by `Bible/build-bible-search.js`. Drop a folder in, rebuild, and it's searchable —
there is no list of sources to edit in code.

## Folder = source

The folder **directly under `Teaching/`** is the source label. It shows as the badge
on every result and is searchable text, so name it the way you want it to read.

```
Teaching/
├── Example Ministry/
│   └── Articles/
│       └── As I Have Loved You.md      → badge: EXAMPLE MINISTRY
├── Desiring God/
│   └── Solid Joys/
│       └── Arm yourself with the Promises.md   → badge: DESIRING GOD
└── Community/
    └── Arm yourself with Gods Promises.md      → badge: COMMUNITY
```

Nesting depth below the source folder doesn't matter — `Example Ministry/Articles/x.md`
and `Community/x.md` are both indexed, both badged by their top folder.

## Frontmatter

**Every field is optional.** A note with no frontmatter at all still indexes; the
builder infers what it can. Fields only ever *improve* a result.

| Field | Used for | Falls back to |
| --- | --- | --- |
| `title` | Result heading, highest search weight | First `# heading`, then the filename |
| `author` | Meta line | *(blank — the source badge already names the ministry)* |
| `date` | Meta line, tie-break for ranking (newest first) | *(omitted from the meta line)* |
| `topics` | Meta line, ranks above body text | `topic/*` tags, with the prefix stripped |
| `excerpt` | Shown when the search terms miss the body | First paragraph, capped at 240 chars |
| `source` | The `web ↗` / `Read on …` link | First external `http(s)` link in the body |

A full-fat example:

```yaml
---
type: ministry-article
tags: [article, topic/easter, topic/salvation]
title: "1 Triumphant"
author: "Example Ministry"
topics: ["Easter", "Resurrection", "Salvation"]
date: 2019-11-10
source: "https://example.org/articles/walking-in-love/"
excerpt: "Even when we don't feel very triumphant, Jesus always triumphs."
---

# 1 Triumphant

Part of [[Example Ministry Articles]] · By Example Ministry · 2019-11-10

> [!abstract] Excerpt
> Even when we don't feel very triumphant, Jesus always triumphs.

Article prose starts here…
```

A bare note works too — this indexes fine, badged `COMMUNITY`, title from the heading:

```markdown
# Arm yourself with Gods Promises

Preaching truth and Gods promises to yourself.
```

## What is *not* indexed

| Skipped | Why |
| --- | --- |
| `README.md` (any folder) | Documentation, not content |
| Notes with `type: *hub` or a `hub` tag | Hub/index notes list other notes; they aren't articles |
| Notes with no readable prose | Reported as a problem by the builder, then skipped |

## How the body is cleaned

The builder converts markdown to plain reading paragraphs: wikilinks and markdown
links become their text, the `Part of …` breadcrumb and `# H1` are dropped (the title
already shows), `> [!callout]` blocks are skipped, and emphasis marks are stripped.

Search ranking weights **title ≫ topics/author ≫ excerpt ≫ body**, counting every
mention. Every search term must appear somewhere for a note to match.

## Adding a new source

1. Create `Teaching/<Source Name>/` and put the notes in it.
2. Rebuild: `node "Bible/build-bible-search.js" . "Bible/bible-search-template.html" "Bible Search.html"`
3. The builder prints a per-source count — check yours appears:
   `Articles: 316 (Community 1 · Desiring God 1 · Example Ministry 314)`

The Bible Search tab reloads itself when the file is rewritten.

## Copyright

Article text here is copyrighted by its publishers. The generated `Bible Search.html`
embeds the full text — it's for personal study, don't share the file.
