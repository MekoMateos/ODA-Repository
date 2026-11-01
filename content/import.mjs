// Imports ODA's standard pages, tag descriptions, navigation and SEO settings into a Ghost site.
// Safe to re-run: pages that already exist are left alone (your edits in Ghost are kept), unless you pass
// --update-pages, which replaces their text with the repo version but never changes their published/draft status.
// Existing articles are never touched. Pages marked "status": "draft" in site.json (e.g. the protest rights
// guide, which needs a lawyer) are created as drafts.
//
// Usage (from the repo root):
//   cd dashboard && npm ci && cd ..
//   GHOST_ADMIN_URL=https://admin.example.org GHOST_ADMIN_API_KEY=<id:secret> node content/import.mjs
//   add --with-samples to also create the two sample case studies (test sites only)
//   add --update-pages to overwrite existing pages with the repo text (asks nothing, so commit your Ghost edits first)
//
// Navigation and site settings need a staff session, not an integration key, so this script prints them
// for you to paste into Ghost Admin > Settings if the API refuses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../dashboard/package.json', import.meta.url));
const GhostAdminAPI = require('@tryghost/admin-api');

const here = path.dirname(fileURLToPath(import.meta.url));
const { GHOST_ADMIN_URL: url, GHOST_ADMIN_API_KEY: key } = process.env;
if (!url || !key) { console.error('Set GHOST_ADMIN_URL and GHOST_ADMIN_API_KEY.'); process.exit(1); }

const api = new GhostAdminAPI({ url, key, version: 'v6.0' });
const site = JSON.parse(fs.readFileSync(path.join(here, 'site.json'), 'utf8'));

async function upsertTag(t) {
  const existing = await api.tags.read({ slug: t.slug }).catch(() => null);
  const data = { name: t.name, slug: t.slug, description: t.description, meta_description: t.meta_description };
  if (existing) { await api.tags.edit({ id: existing.id, ...data }); return existing; }
  return api.tags.add(data);
}

const updatePages = process.argv.includes('--update-pages');
async function upsertPage(p) {
  const html = fs.readFileSync(path.join(here, 'pages', `${p.slug}.html`), 'utf8');
  const data = { title: p.title, slug: p.slug, custom_excerpt: p.excerpt, meta_description: p.meta_description, html };
  const existing = await api.pages.read({ slug: p.slug }).catch(() => null);
  if (existing && !updatePages) return 'kept';
  if (existing) { await api.pages.edit({ id: existing.id, updated_at: existing.updated_at, ...data }, { source: 'html' }); return 'updated'; }
  await api.pages.add({ ...data, status: p.status || 'published' }, { source: 'html' });
  return p.status === 'draft' ? 'created as draft' : 'created';
}

for (const t of site.tags) { await upsertTag(t); console.log('tag   ', t.slug); }
for (const p of site.pages) console.log('page  ', p.slug.padEnd(24), await upsertPage(p));
// The writers page has no body; it uses the page-autoret template.
if (!(await api.pages.read({ slug: 'autoret' }).catch(() => null))) {
  await api.pages.add({ title: 'Autorët', slug: 'autoret', custom_excerpt: 'Gazetarë, studiues dhe zëra të pavarur që publikojnë në ODA.', meta_description: 'Autorët e ODA-s: gazetarë, studiues dhe zëra të pavarur. Ndiqni ata që ju interesojnë me email.', status: 'published' });
  console.log('page   autoret');
}

if (process.argv.includes('--with-samples')) {
  const samples = [
    { file: 'rasti-ndricimi-shembull', title: 'Kontrata e ndriçimit rrugor u publikua pas kërkesës sonë (shembull)', excerpt: 'Bashkia publikoi kontratën dhe dy lagje u shtuan në planin e punimeve.', tags: ['rastet', 'ekonomi'] },
    { file: 'rasti-konvikti-shembull', title: 'Ngrohja në konvikt: nga matjet e studentëve te riparimi (shembull)', excerpt: 'Drejtoria njoftoi riparimin e ngrohjes dhe publikoi një afat.', tags: ['rastet', 'shoqeri'] },
  ];
  for (const s of samples) {
    const html = fs.readFileSync(path.join(here, 'posts', `${s.file}.html`), 'utf8');
    await api.posts.add({ title: s.title, custom_excerpt: s.excerpt, html, status: 'published', tags: [...s.tags.map(slug => ({ slug })), { name: '#verifikuar' }] }, { source: 'html' });
    console.log('sample', s.file);
  }
}

console.log('\nNow set these in Ghost Admin > Settings (they need a staff login):');
console.log('- Title & description, Meta data, Language: see content/site.json > settings');
console.log('- Navigation (primary and secondary): see content/site.json > settings.navigation');
console.log('- Portal > Signup: redirect free signups to /faleminderit/');
