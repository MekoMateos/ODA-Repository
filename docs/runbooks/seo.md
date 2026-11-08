# SEO and Google

What the site already does, and the steps to take once it's live.

## Built in

| Item | Where it comes from |
| --- | --- |
| Page titles, meta descriptions, canonical URLs, Open Graph and X cards | Ghost (`{{ghost_head}}`), filled from each post's/page's meta fields, falling back to the excerpt |
| Article, WebSite and Series structured data (JSON-LD) | Ghost |
| Breadcrumbs (BreadcrumbList microdata) | Theme: `partials/breadcrumbs.hbs`, `author.hbs` |
| FAQ structured data (FAQPage) | Theme: `page-pyetje.hbs` + `oda.js` builds it from the H3 questions |
| `sitemap.xml` | Ghost, automatic |
| `robots.txt` | Theme: `theme/oda/robots.txt`. |
| `noindex` on the thank-you page and 404 page | Theme |
| One `<h1>` per page, `lang="sq"`, image `alt` text, responsive images, preloaded fonts | Theme |
| Fast pages | Cloudflare caching, self-hosted fonts, no third-party trackers |

## After launch (once)

1. **Google Search Console**: add the domain as a *Domain property*, verify with the DNS TXT record in Cloudflare, then submit `https://<domain>/sitemap.xml`.
2. **Bing Webmaster Tools**: import from Search Console (1 click).
3. **Google News**: create the publication in Google Publisher Center (name, logo, sections matching the tags). Make sure About, Editorial policy, Corrections and Contact pages are public; Google looks for them.
4. **Ghost Admin > Settings > General > Meta data**: paste title and description from `content/site.json`.
5. **Ghost Admin > Settings > Portal > Signup**: set the free-signup redirect to `/faleminderit/`.

## For every article (editors)

- **Title**: what happened, with the key name or number, under 70 characters.
- **Meta description** (Ghost post settings > Meta data): 120–155 characters, says what the reader learns. If empty, Ghost uses the excerpt.
- **Excerpt**: one sentence, it shows on cards and in social shares.
- **URL slug**: short and in plain Albanian without diacritics, e.g. `buxheti-bashkise-2027`.
- **Feature image**: at least 1200px wide, with alt text describing the image.
- **Primary tag** = the section (Politikë, Ekonomi…). It drives breadcrumbs and the article header colour.
- **Links**: link to the primary documents in "Burimet", and to 1–3 earlier ODA articles on the same topic.

## Checks (monthly)

- Search Console > Pages: fix any "Not indexed" errors on real articles.
- Search Console > Core Web Vitals: all URLs "Good".
- Test one article and the FAQ page in Google's Rich Results Test.
