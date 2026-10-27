// Builds og-skills.csv from the cached wikiwiki pages in raw/skills/ (index.html = スキル, list.html = スキル別一覧).
// Fetches those two pages once if missing, >=1 s apart. Does NOT crawl the category sub-pages: they sit behind a Cloudflare challenge (429).
import fs from 'node:fs';
const BASE = 'https://wikiwiki.jp/guildra/', DIR = new URL('./raw/skills/', import.meta.url);
const PAGES = { 'index.html': 'スキル', 'list.html': 'スキル別一覧' };
for (const [f, name] of Object.entries(PAGES)) {
  if (fs.existsSync(new URL(f, DIR))) continue;
  const r = await fetch(BASE + encodeURIComponent(name), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status} (blocked? stop, do not bypass)`);
  fs.writeFileSync(new URL(f, DIR), await r.text());
  await new Promise(r => setTimeout(r, 1500));
}
const body = f => { const h = fs.readFileSync(new URL(f, DIR), 'utf8'); return h.slice(h.indexOf('id="content"'), h.indexOf('main-contents-bottom')); };
const txt = s => s.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').trim();

// TOC of スキル別一覧: category -> "family (alias, alias), family ..." ; every name inside is a skill family prefix.
const catOf = new Map();
for (const m of body('list.html').matchAll(/<strong>([^<]+)<\/strong>\s*(?:<br[^>]*>)?([^<]*)<\/a>/g)) {
  const cat = m[1].trim();
  for (const n of m[2].replace(/[（）()、,]/g, ' ').split(/\s+/).filter(Boolean)) catOf.set(n, cat);
}
catOf.set('同郷の友', catOf.get('同郷')); catOf.set('同国の友', catOf.get('同国'));
catOf.set('同盟', catOf.get('共闘'));
// TOC aliases that the name-splitting above misses; 不借身命 is not in the TOC, so it stays empty.
for (const [k, v] of [['強襲連撃', '連撃'], ['フレンドコール', 'フレンドメール'], ['先走り（＾ｏ＾）ノ', '不意討ち'], ['王者の風格', 'マルチチャージ'], ['呪紋支援', 'マルチチャージ'], ['鋼刃突撃', 'マルチチャージ'], ['双刃介入', 'マルチチャージ']]) catOf.set(k, catOf.get(v));
const category = n => catOf.get(n) ?? catOf.get(n.replace(/\d+$/, '')) ?? '';

const unitRe = /Lv×(\d+)(%|枚)?/g;
const rows = [], bad = [];
let section = '';
const tbl = body('index.html').match(/<table>[\s\S]*?<\/table>/)[0];
for (const tr of tbl.match(/<tr>[\s\S]*?<\/tr>/g).slice(1)) {
  const c = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => txt(m[1]));
  if (c.length === 1) { section = c[0]; continue; } // e.g. ファントムイベント限定スキル
  const [skill, eff, max, note = ''] = c;
  const timing = (note.match(/(リーダー選択時|チャージ後|ドロー終了時)/) || [])[1] ?? '';
  const terms = [...eff.matchAll(unitRe)];
  const fixed = terms.length ? null : eff.match(/(\d+)(%|％)?(?=増やす|減らす|回復|軽減|パワーアップ)/);
  const formula = terms.length ? terms.map(t => t[0]).join('; ') : fixed ? fixed[0] : '';
  let atMax = '';
  if (/^\d+$/.test(max)) {
    if (terms.length === 1) atMax = terms[0][1] * max + (terms[0][2] ?? '');
    else if (fixed) atMax = fixed[0];
  }
  if (!formula) bad.push(skill);
  rows.push([skill, section ? section : category(skill), timing, eff, formula, max, atMax, 'https://wikiwiki.jp/guildra/%E3%82%B9%E3%82%AD%E3%83%AB']);
}
const q = v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
const head = ['skill', 'category', 'timing', 'effect_text', 'value_formula', 'max_level', 'value_at_max_level', 'source_url'];
fs.writeFileSync(new URL('./og-skills.csv', import.meta.url), '﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n') + '\r\n');
const n = {}; for (const r of rows) n[r[1] || '(none)'] = (n[r[1] || '(none)'] || 0) + 1;
console.log(rows.length, 'skills', n, '\nno formula:', bad.join(' / '));
