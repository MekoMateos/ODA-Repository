# Guest pieces ("Shkruaj artikullin tënd")

The home page opens with an invitation to write. It opens to two paths:

- **Shkruaj një herë** (write once): anyone can send one piece without an account. It goes to **Redaksia > Shkrime**. Nothing is published from there.
- **Hyr në llogarinë tënde** (sign in): ODA authors go to `/ghost/`, which redirects to the admin domain behind Cloudflare Access. Below it, a link to `/behu-autor/` for people who want to write regularly.

Links that open it from anywhere (Instagram bio, newsletter, social posts): `https://<domain>/#shkruaj` opens the two paths, `https://<domain>/#shkruaj-nje-here` goes straight to the writing sheet. The footer has "Shkruaj për ODA-n".

## What the writer sends

Title, the text (200 to 8,000 words), sources (one per line), name and surname (shown if published), email (never shown), an optional note, and a declaration that the piece is theirs and original and that the editors check and edit it. The draft is saved only in the writer's browser while they write, so a closed tab loses nothing. It is erased from the browser once sent.

Spam protection: an invisible honeypot field, 10 requests per hour per address at the door, then at most 3 pieces a day per address and 2 a day per email, duplicates refused, optional Cloudflare Turnstile (loaded only when someone opens the sheet). The address is kept only as a daily-salted hash and erased when an editor decides.

## The editors' routine

1. **Redaksia > Shkrime** (editors only). The red number in the menu is the queue. The oldest piece is at the top.
2. Read the whole piece and open the sources. Decide within **10 working days**: the page and the writer were promised that.
3. **Prano dhe krijo draftin në Ghost**: fix the title or the section first if needed. Redaksia creates a Ghost draft with the text, the sources as a "Burimet" list, the internal tag `#i-ftuar` and the guest's name at the top, and puts it in the queue as **Dorëzuar**. From there it is an ordinary article: triage, verification, legal review when needed, approval, publication. Nobody skips a step because the writer is a guest.
4. **Refuzo** with a reason. Choose "Spam ose reklamë" for junk: the text and email are erased at once.
5. **Write to the writer by email**, always, for both decisions. A rejection gets its short reason (the policy promises that). Use the email only for this piece.

### While the guest piece is in review

- The writer has no Redaksia account and does not see the notes. Requests for revision and the final decision go to them **by email**. The article page shows the address.
- After a revision, the editor makes the changes in Ghost (or pastes the writer's new version) and presses **Dorëzo për shqyrtim** on the writer's behalf. Only editors can do that for a guest piece.
- Before publication, send the writer the final edited version and get their OK by email. Their name is on it.
- Pen names: allowed when the writer risks real harm (see [Bëhu autor](../../content/pages/behu-autor.html)). The editors must know the real identity. Change the name in the HTML card at the top of the draft.

## How a guest piece looks on the site

The theme reads the tag `#i-ftuar`: the byline shows the guest's name with the label **Shkrim i ftuar**, cards say "Shkrim i ftuar" instead of a staff name, and the foot of the article says the views are the author's and the facts were checked by the editors, with a link back to the invitation. Do not remove the tag or the name card from the draft.

## Set up once

1. In Ghost, invite a staff user with the **Contributor** role named **Shkrime të ftuara**, with an address the team controls (for example `mysafir@<domain>`), and accept the invite. Put that address in `.env` as `REDAKSIA_GUEST_AUTHOR_EMAIL`, then `docker compose up -d redaksia`. Accepted pieces are filed under that user. Without it, Ghost files them under the site owner.
2. Optional: Cloudflare Turnstile. Put the site key in Ghost > Design > Theme settings and the secret in `TURNSTILE_SECRET` (the same pair the resource form uses).
3. Cloudflare: the existing rule for `POST /api/*` (10 per minute per address) covers `/api/shkrime`. Keep `/api/*` out of every cache rule.

## Privacy and retention

- The text, sources, note and email of a decided piece are erased **90 days after the decision**. The title, the name and the decision stay as the record. Pending pieces are kept until someone decides.
- An accepted piece lives on as a Ghost draft. The writer's name and email stay with the article's history in Redaksia.
- There is no public endpoint that reads submissions. `/api/shkrime` only accepts them.
- The privacy page describes all of this. If you change the period in `dashboard/src/submissions.js` (`retentionDays`), change the page too.
