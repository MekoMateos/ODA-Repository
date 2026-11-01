# Arti, Kërkim, Protesta LIVE, Sondazhe, Burime

Five sections added in theme v0.5. Art, research and protest coverage are ordinary Ghost posts that go through the normal review in Redaksia. Polls and student resources live in Redaksia and reach the site through the reader API at `/api/`.

## Art (`/tag/arti/`)

- Tag the post **Arti**. The gallery and the art layout switch on by themselves.
- Feature image = the work itself, uploaded at full size. The site never crops art: the gallery and the home page wall keep each work's own proportions.
- End the post with a heading **Për veprën** followed by a bulleted list, one fact per line, written `Label: value`:
  `Artistja: …`, `Viti: …`, `Teknika: …`, `Përmasat: …`, `Ku ekspozohet: …`. The theme turns it into a museum wall label under the title.
- Rights: publish a work only with the artist's written permission, and credit the photographer of the work if there is one.

## Research (`/tag/kerkim/`)

- Tag the post **Kërkim** (plus its section tag). It gets the research layout, the teal colour and a "How to cite" box with an APA citation the reader can copy.
- **Excerpt = the abstract** (Ghost allows 300 characters). It shows in a box under the title.
- Use these H2 headings, in this order, and the theme styles each one:
  **Gjetjet kryesore** (numbered list of findings), **Metodologjia**, **Të dhënat** (attach the CSV or PDF with Ghost's File card), **Kufizimet**, **Burimet**.
- The citation box says the study was checked by ODA's editors and is not peer reviewed. Keep that true.
- The theme recognises the tag by its name: keep the names **Kërkim**, **Arti** and **Protesta**, or update `post.hbs` if you rename them.

## Live protest coverage (`/tag/protesta/`)

**We report protests. We do not organise or promote them.**

1. Create a post tagged **Protesta** and the internal tag **#live**. Title starts with `LIVE:`.
2. While `#live` is on the post, a red bar with a link to it appears at the top of every page, and the Protesta page opens with it. A reader on the page sees a "New updates" button when you add an update (no automatic jumping).
3. Each update is an **H3 heading** written `HH:MM · Status · Short title`, then the text. Put the **newest update at the top**.
   - `Konfirmuar`: confirmed by our own reporter or by two independent sources.
   - `Në verifikim`: reported but not yet confirmed. Say who reported it.
   - `Korrigjim`: corrects an earlier update. Say what was wrong. Never delete or quietly edit an earlier update.
4. Keep the **Burimet** section at the end.
5. When coverage ends, remove `#live`. The bar disappears and the post shows "Live coverage has ended" above the archive of updates.
6. Faces: do not publish identifiable faces of protesters who are not public figures without their consent, especially minors. Blur when in doubt.
7. Reporter safety comes before the story. Reporters carry press ID, work in pairs and check in with the editor every 30 minutes.
8. Cloudflare caches pages for anonymous readers. During live coverage keep the edge cache at 60 seconds or less, or purge the post's URL after each update.

### Rights guide

`/te-drejtat-ne-proteste/` is imported as a **draft**. It summarises the 2001 text of law 8773 "Për tubimet" and has gaps marked `[Juristi: …]`. A lawyer must check it against the law in force, fill the gaps and approve it. Then publish it in Ghost: it appears on the Protesta page automatically. Add it to the footer navigation once published.

## Reader polls (`/sondazhe/`)

Run from **Redaksia > Sondazhe** (editors only).

1. Write the question and 2 to 6 answers. Save as draft.
2. **Four eyes:** when the team has more than one active editor, a different editor must read and open the poll. Opening is final: question and answers cannot change.
3. Readers vote once each and must be signed in (the vote is checked with Ghost's signed member token). Results show after they vote, or to everyone once the poll closes.
4. Close it by hand or set a closing time (Tirana time). Closed results are final and public. Votes cannot be edited or deleted, not even by us.
5. In articles, always write "sondazh i hapur për lexuesit, jo përfaqësues", the number of votes and the dates.

Checklist for a neutral question: one question at a time; no loaded words; answers cover the realistic options and include "Nuk e di" where it fits; no answer is longer or more attractive than the others; nothing that identifies a private person.

Privacy: Redaksia stores a keyed hash of the reader's email, never the email. **Never change `REDAKSIA_COMMUNITY_SECRET` while a poll is open**, or readers who already voted could vote again.

## Student resources (`/burime/`)

Run from **Redaksia > Burime** (editors only). The red number in the menu is the queue.

1. Anyone can suggest a resource on `/burime/`. Nothing appears until an editor approves it.
2. For each suggestion: open the link, check it is free (or has a real free plan), trustworthy, and has no payment traps or misleading ads. Fix the title and description if needed, pick the category, then **Mirato dhe publiko** or **Refuzo** with a reason.
3. **Vendose në krye** puts it in "Zgjedhjet e redaksisë" at the top. Keep that to 4 to 8 items.
4. Remove a published resource with **Hiqe nga faqja** (it goes to the rejected tab, not deleted).
5. Starter list: 36 checked resources wait in `dashboard/seed/resources.json`. Put them in the queue once with
   `docker compose exec redaksia node --disable-warning=ExperimentalWarning scripts/seed-resources.js`
   and approve them one by one like any suggestion.

Spam protection: an invisible honeypot field, 5 suggestions per hour per address, duplicate links refused, editor approval, and optionally Cloudflare Turnstile (put the secret in `TURNSTILE_SECRET` and the site key in Ghost > Design > Theme settings). We never ask for an email; the submitter's name is optional and shown publicly. The address is kept only as a daily-salted hash and erased when an editor decides.

## Cloudflare rules for the reader API

- Rate limit `POST /api/*`: 10 requests per minute per IP, block for 10 minutes.
- Cache `/api/burime.json` and `/api/sondazhe.json` at the edge, respecting the origin's `s-maxage` (60 and 30 seconds). Everything else under `/api/` must bypass the cache.
- Keep `/api/*` out of any "cache everything" rule for HTML.
