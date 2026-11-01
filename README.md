# ODA platform

Multi-author civic publishing platform: magazine + author newsletters + review before publish.
Built on self-hosted Ghost 6, behind Cloudflare, on a Hetzner server in the EU.

## What's here

| Folder | What it is |
| --- | --- |
| `dashboard/` | **ODA Redaksia**, the editorial dashboard: submission queue, 10 review statuses, role permissions, sign-offs, checklist, notes, append-only audit log, publish/schedule through Ghost ([runbook](docs/runbooks/redaksia.md)) |
| `theme/oda/` | Custom Ghost theme: front page, articles with evidence box, author pages, tags, corrections register, Albanian + English |
| `infra/` | Production server: Docker Compose (Ghost, MySQL, Caddy), hardening, Cloudflare-only firewall, encrypted backups, restore |
| `.github/workflows/` | Theme check + deploy; infra deploy with automatic rollback. Both need approval in the `production` environment |
| `content/` | Launch pages in Albanian (About, Charter, Editorial policy, Privacy, Cookies, Transparency, Become an author, FAQ, Corrections, Thank-you), tag descriptions, navigation and SEO settings, plus `import.mjs` to load them into Ghost |
| `docs/runbooks/` | Step-by-step: first server setup, publishing workflow, restore, incidents |

## How editors use the theme

- **Workflow:** writers draft in Ghost and submit in Redaksia; editors, verifiers and legal move it through review there. Redaksia sets the Ghost tags; nobody needs to tag by hand.
- **Evidence rating** (set by the Verification Desk, internal tags): `#verifikuar` = Verified, `#pjeserisht` = Partly verified, `#korrigjuar` = Corrected. The public tag `opinion` labels opinion pieces.
- **Evidence box:** end the article with a heading **Burimet** (or *Sources*) and a numbered list of sources. The theme turns it into the evidence box and counts the sources.
- **Corrections:** add `#korrigjuar` and a callout at the top explaining what changed. The article shows a correction note and appears on `/korrigjimet/`.
- **Look:** Ghost Admin > Design > Theme settings > *Color scheme*: **Kuq e zi** (red and black, woven band, animations; default) or **Guri** (stone and walnut). Animations switch off automatically for visitors who set "reduce motion" on their device.
- **Case studies:** tag a post `rastet` (plus its section tag). Excerpt = the result in one sentence; body sections Problemi / Çfarë bëmë / Rezultati / Burimet. They show in the "Ndikimi" strip and at `/tag/rastet/`.
- **FAQ:** the page with slug `pyetje` turns every H3 into a question and adds Google FAQ data.
- **Newsletter pop-up, phone subscribe bar, cookie notice:** automatic; the cookie notice can be switched off in Theme settings. Successful signups go to `/faleminderit/`.
- **Home page rails:** set the topic slugs in Ghost Admin > Design > Theme settings (`home_topics`).
- **Language:** set Ghost's publication language to `sq`. English articles get the tag `english`.

## Local development

```bash
npm i -g ghost-cli pnpm
mkdir ghost-local && cd ghost-local && ghost install local
ln -s ../theme/oda content/themes/oda && ghost restart
npx gscan theme/oda        # must pass before every PR
```

## Security rules (non-negotiable)

- Secrets live only in the server's `infra/.env` and in GitHub Actions secrets, never in the repo.
- Every admin account uses a hardware security key. Two admins per account.
- The technical admin is not an Editor. Editors publish; admins run the system.
- Tips and complaints never go into Ghost, email or chat. They go to the separate GlobaLeaks server (phase 2).
