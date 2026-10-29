# OG equipment images: search notes

Goal: find OG images for the weapons (og-weapons.csv, 124 rows) and armors (og-armors.csv, 113 rows), and download only images that clearly match a named item.

Result: 0 images found, 0 downloaded, 0 image_url values filled. The CSVs are unchanged.

## Sources tried

1. **Wiki site-wide attach list** (`https://wikiwiki.jp/guildra/?cmd=attach&pcmd=list`) and the equipment-scoped list (`...&refer=装備変更`). Both returned HTTP 403 from a normal browser User-Agent. This looks like a bot block. Per the rules I did not try other clients or bypasses, and I skipped this source. Nothing was saved to `raw/` because the response was an error.
2. **Saved equipment pages in `raw/`** (weapons-henkou, weapons-gousei, weapons-kaitai, armors-equipment-change and others). The only `<img>` tags are the site header banner and a 初心者向け icon. No item art, and no links to item images.
3. **Web search** (WebSearch, 3 queries): item names with ギルティドラゴン (岩砕, 波断, 守護者の大剣, 重蒼剣), and general 装備一覧 / 画像 / 攻略 queries. Results were unrelated games (Elden Ring, Monster Hunter, Dragon Quest and others) or general press articles with no item data (famitsu 2012, gamebiz). No fan site or archive snapshot with equipment images appeared.
4. **web.archive.org snapshots** of the official site: not tried. The official site is not linked from the saved pages, and the search results gave no URL for it.

## Match counts

| Type | Rows | Images found | Matched |
|---|---|---|---|
| Weapons | 124 | 0 | 0 |
| Armors | 113 | 0 | 0 |

## Per-image source URLs

None.

## Notes

- The `images/weapons/` and `images/armors/` folders were not created, since there is nothing to put in them.
- The wiki's CDN file pattern (`cdn.wikiwiki.jp/to/w/guildra/<page>/::ref/<file>`) is still the most likely place for item images. The attach list is the way to find those files, and it is blocked for this agent. Someone with a browser session could check the attach list manually, or save the list HTML into `raw/` and re-run the match.
