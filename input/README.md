# Webmage Input Directory

Drop raw data files here to feed them into the onsite and offsite SEO pipelines.
Each team scans its own subdirectory before running automated steps.

## Directory Structure

```
input/
  onsite/          ← Scanned by the onsite SEO pipeline
  offsite/         ← Scanned by the offsite SEO & social media pipeline
```

## How It Works

Each pipeline step checks for a matching input file **before** executing its
automated logic (LLM generation, API calls, etc.). If a matching file exists,
its contents are either used **instead of** or **merged with** the automated
output, depending on the mode.

## Mode: Replace vs. Supplement

| Mode         | Behavior                                              |
| ------------ | ----------------------------------------------------- |
| `supplement` | Merge user data with automated output **(default)**   |
| `replace`    | Skip the automated step; use only user-provided data  |

### Setting the mode

**Option A — Filename convention** (easiest):
Add `.replace.` before the extension to activate replace mode.

```
keywords.txt            → supplement (default)
keywords.replace.txt    → replace
```

**Option B — `_config.json`** (explicit):
Create a `_config.json` file in the team directory:

```json
{
  "keywords.txt": "replace",
  "content-briefs.json": "supplement"
}
```

`_config.json` overrides the filename convention when both are present.

---

## Onsite Input Files (`input/onsite/`)

### `keywords.txt`

Pre-researched keyword list for the keyword research step.
Format: one keyword per line, with **blank lines** separating clusters.
The first line of each cluster becomes the primary keyword.

```
plumber near me
emergency plumber
24 hour plumbing service

kitchen remodel cost
kitchen renovation ideas
modern kitchen design
```

### `keywords.json`

Structured keyword clusters matching the `KeywordCluster` type.

```json
[
  {
    "primaryKeyword": "plumber near me",
    "relatedKeywords": ["emergency plumber", "24 hour plumbing"],
    "searchIntent": "transactional",
    "estimatedDifficulty": "medium",
    "suggestedContentType": "pillar"
  }
]
```

### `crawl-data.json`

Cached crawl results (matches the `CrawlResult` type). When present,
the pipeline skips the live Scrapy crawl entirely.

```json
{
  "domain": "example.com",
  "crawled_at": "2026-01-15T10:30:00Z",
  "total_pages": 12,
  "pages": [ ... ],
  "errors": []
}
```

### `content-briefs.json`

Silo plans matching the `SiloPlan` type. Supplements or replaces the
LLM-generated silo architecture.

```json
[
  {
    "name": "Plumbing Services",
    "description": "Content silo for plumbing services",
    "pillar": {
      "title": "Complete Guide to Plumbing Services",
      "targetKeyword": "plumbing services",
      "outline": ["Introduction", "Types of plumbing", "..."],
      "estimatedWordCount": 3000
    },
    "supportingPosts": [ ... ],
    "categoryName": "Plumbing",
    "tags": ["plumbing", "home services"]
  }
]
```

### `content-briefs.md`

Markdown content briefs. Each `## Silo: <Name>` header starts a new silo.
The content under each header is passed to the LLM as additional context.

```markdown
## Silo: Plumbing Services

Focus on emergency and residential plumbing.
Target audience: homeowners in the Austin metro area.

Pillar topic: Complete Guide to Home Plumbing
Supporting topics:
- How to Find a Reliable Plumber
- Emergency Plumbing: What to Do Before Help Arrives
- Kitchen vs Bathroom Plumbing Differences
```

---

## Offsite Input Files (`input/offsite/`)

### `social-media-profiles.txt`

Social media profile URLs to target when generating posts.
One URL per line.

```
https://twitter.com/mybusiness
https://www.facebook.com/mybusiness
https://www.linkedin.com/company/mybusiness
https://www.instagram.com/mybusiness
```

### `outreach-targets.txt`

Specific websites to target for backlink outreach.
One URL per line.

```
https://relevantblog.com/write-for-us
https://industry-directory.com/submit
https://local-news-site.com/community
```

### `content-topics.txt`

Topics for outreach content pitches. One topic per line.
Supplements or replaces the auto-extracted topics from WordPress posts.

```
10 Signs You Need a New Water Heater
How to Winterize Your Plumbing
The Real Cost of Ignoring a Leaky Faucet
```

### `citation-overrides.json`

Pre-built citation packages matching the `CitationPackage` type.

```json
[
  {
    "directoryName": "Google Business Profile",
    "directoryUrl": "https://business.google.com",
    "category": "Plumbing",
    "fields": {
      "businessName": "Acme Plumbing",
      "address": "123 Main St, Austin, TX",
      "phone": "(512) 555-0100",
      "website": "https://acmeplumbing.com",
      "description": "Full-service residential plumbing"
    },
    "status": "pending"
  }
]
```

### `haro-emails.json`

Offline HARO/journalist query emails matching the `HaroEmail` type.
When present, the pipeline skips the IMAP fetch entirely.

```json
[
  {
    "id": "msg-001",
    "from": "query@helpareporter.com",
    "subject": "[HARO] Plumbing Tips for Homeowners",
    "body": "I'm looking for a licensed plumber to comment on...",
    "date": "2026-02-10T08:00:00Z",
    "platform": "haro"
  }
]
```

---

## Notes

- Files are read **lazily** — each step checks just before it runs.
- If a file can't be parsed (bad JSON, etc.), a warning is logged and the
  step falls through to its normal automated behavior.
- The `input/` directory contents (except `.gitkeep` and `README.md`) are
  git-ignored by default so your data files stay local.
- Both `.txt` and `.json` formats are supported where applicable. Use `.txt`
  for quick/simple input and `.json` when you need full control over the
  data structure.
