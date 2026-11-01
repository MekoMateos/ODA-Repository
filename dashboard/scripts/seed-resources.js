// Puts the starter list of free resources into the editors' queue. They arrive as "Në pritje":
// nothing reaches the public page until an editor opens each link and approves it.
// On the server: docker compose exec redaksia node --disable-warning=ExperimentalWarning scripts/seed-resources.js
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { communityStore, validateSuggestion, SEED_NAME } from '../src/community.js';

const file = process.argv[2] || new URL('../seed/resources.json', import.meta.url);
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
const db = openDb(process.env.DB_FILE || path.resolve('data/redaksia.db'));
const store = communityStore(db);

let added = 0, skipped = 0;
db.tx(() => {
  for (const item of list) {
    const r = validateSuggestion({ ...item, submitter_name: SEED_NAME });
    if (store.findByUrl(r.url)) { skipped++; continue; }
    store.addResource(r, null);
    added++;
  }
  db.log({ actor: 'system', action: 'resource_seed', detail: { added } });
});
console.log(`${added} burime u shtuan në pritje për redaktorët, ${skipped} ekzistonin tashmë.`);
