# ODA Redaksia (editorial dashboard)

Address: `https://admin.<domain>/redaksia/`. It runs next to Ghost on the same server.

## Who can do what

| Role | Can do |
| --- | --- |
| Kontribues (contributor) | Sees only their own articles. Submits Ghost drafts, reads and answers notes, resubmits after revision. |
| Redaktor (editor) | Takes articles into review, assigns verifier and deadline, decides if legal review is needed, ticks editorial checklist items, requests revision, approves, publishes or schedules, rejects, reopens on appeal. |
| Verifikues (verifier) | Confirms sources and sets the rating (Verified / Partly verified / Opinion). Can send back for revision while verifying. |
| Jurist (legal) | Signs off legal review, checks personal data and media rights. |
| Administrator teknik | Manages the team and roles, reads the audit log. **No editorial actions.** |

Hard rules the dashboard enforces:
- Nobody can review, approve or publish their own article.
- Approval needs: verification sign-off, legal sign-off (when required), a rating, and every required checklist item.
- A revision clears all previous sign-offs, so changed text is verified again.
- Reject and revision need a written reason; the author sees it.
- Every action is written to an audit log that cannot be edited or deleted.
- If Ghost refuses a change (for example someone is editing the post at that moment), nothing is recorded and the person is asked to retry.

## The flow

```
Draft (Ghost) → Dorëzuar → Në shqyrtim → Në verifikim → [Në shqyrtim ligjor] → Miratuar → Publikuar / Planifikuar
                    ↑                ↓              ↓                 ↓
                    └──── Kërkohet rishikim ←───────┴─────────────────┘        Refuzuar (any open step; can be reopened on appeal)
```

In Ghost, each status is mirrored as an internal tag (`#submitted`, `#in-review`, ...). On publish the workflow tags are removed and only the rating tag (`#verifikuar` / `#pjeserisht`) stays, which drives the label on the public site.

## Setup on the server (once)

1. Ghost Admin > Settings > Integrations > **Add custom integration** "ODA Redaksia". Copy the **Admin API key** into `REDAKSIA_GHOST_ADMIN_API_KEY` in `infra/.env`.
2. `REDAKSIA_SESSION_SECRET=$(openssl rand -base64 48)`.
3. Cloudflare Zero Trust > Access > the application for `admin.<domain>`: copy the **AUD tag** into `REDAKSIA_CF_ACCESS_AUD`, and your team domain (`<team>.cloudflareaccess.com`) into `CF_ACCESS_TEAM_DOMAIN`.
4. `REDAKSIA_BOOTSTRAP_ADMIN_EMAIL` = your own email (the one you log in to Cloudflare Access with).
   Optional: `REDAKSIA_COMMUNITY_SECRET=$(openssl rand -base64 48)` for poll votes (never change it while a poll is open) and `TURNSTILE_SECRET` for the resource form.
5. `docker compose up -d --build redaksia`, open `/redaksia/ekipi`, add the editors, verifiers, legal and contributors. Contributors must use the **same email** as their Ghost staff account so their drafts show up.

## Local development

```bash
cd dashboard && npm install && npm test
GHOST_ADMIN_URL=http://localhost:2368 GHOST_ADMIN_API_KEY=<id:secret> \
SESSION_SECRET=$(openssl rand -base64 48) DEV_USER_EMAIL=you@example.org npm run dev
# open http://localhost:3000/redaksia/?as=someone@example.org to act as another user (dev only)
```

`DEV_USER_EMAIL` is refused when `NODE_ENV=production`, and production refuses to start without Cloudflare Access settings.

## Guest pieces

Editors get **Shkrime** in the menu: pieces sent without an account from the home page ("Shkruaj një herë"), oldest first, with a red counter. Accept turns a piece into a Ghost draft in the queue as **Dorëzuar**; reject needs a reason. A guest has no account, so the editor writes to them by email and resubmits after a revision. Routine: [shkrime-te-ftuara.md](shkrime-te-ftuara.md).

## Polls and student resources

Editors also get **Burime** (reader suggestions waiting for approval, with a red counter) and **Sondazhe** (write, open and close reader polls) in the menu. The public site reads them from `/api/` on the public domain; Caddy forwards only that path to Redaksia. Rules and formats: [community.md](community.md).
