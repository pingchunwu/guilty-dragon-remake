---
title: "OG card art remake: img2img from the OG art, SR+ becomes SSR"
author: Billy
date: 2026-10-28
branch: main
cost: { minutes: 1, tokens: 65892 }
id: l-d7572b9a
scope: repo
status: active
src: agent
touches:
  - docs/og-data/build-specs.py
  - packages/engine/src/skills.ts
---

## Decided
- The new card art is made by img2img from each OG card picture (option A). It is derived from copyrighted art, so it stays in a private build and is never deployed publicly.
- The wiki's SR+ cards become a new SSR rarity. UR cards are added later. N+ and R+ stay folded into N and R.
- Frames by rarity: N plain colour, R bronze, SR silver, SSR gold, UR gold with rainbow shine.
- A pilot of one card per type × rarity is reviewed by the user before generating all 733.

## Tried and ruled out
- Scraping the wiki with 10 parallel sessions triggered 429 errors and a Cloudflare challenge. One slow sequential scraper (8 s between requests, waiting longer after each 429) succeeded.
- agent-reach (fetching through Jina Reader) was not used, because it would just route around the wiki's bot protection.

## Watch out
- Eight OG cards have no picture anywhere on the wiki: 260, 477, 486, 487, 488, 721, 731 and 733.
- The gallery images only load over http, not from file://.

In the code:
- Card table: docs/og-data/card-images/og-card-images.csv. Rebuild it and gallery.html with `python merge.py` in that folder.
- Engine card ids og-<type>-<n> match wiki rows by (name, type), 733/733.
