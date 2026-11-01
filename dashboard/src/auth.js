// Identity comes from Cloudflare Access: every request carries a signed JWT
// (Cf-Access-Jwt-Assertion) that we verify against Cloudflare's public keys.
// Roles come from our own users table, so Cloudflare decides WHO can reach the app
// and ODA decides WHAT they may do.
import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export function authMiddleware({ db, teamDomain, audience, devEmail, isProd }) {
  if (isProd && devEmail) throw new Error('DEV_USER_EMAIL must not be set in production.');
  if (isProd && (!teamDomain || !audience)) throw new Error('CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are required in production.');

  const jwks = teamDomain ? createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`)) : null;

  return async function auth(req, res, next) {
    let email = null;
    try {
      if (jwks) {
        const token = req.get('Cf-Access-Jwt-Assertion');
        if (!token) return deny(res, 401, 'Hyrja kërkon Cloudflare Access.');
        const { payload } = await jwtVerify(token, jwks, { issuer: `https://${teamDomain}`, audience });
        email = String(payload.email || '').toLowerCase();
      } else if (!isProd && devEmail) {
        // Local development only: switch user with ?as=email (never available in production).
        email = String(req.query.as || req.get('X-Dev-User') || devEmail).toLowerCase();
      }
    } catch {
      return deny(res, 401, 'Sesioni nuk është i vlefshëm. Hyr përsëri.');
    }

    const user = email && db.getUser(email);
    if (!user || !user.active) return deny(res, 403, `Llogaria ${email || ''} nuk ka akses në Redaksi. Kërko nga administratori të të shtojë.`);
    req.user = user;
    next();
  };
}

// CSRF: a per-user token (HMAC of the email) in every form, plus a same-origin check.
export function csrf(secret) {
  const tokenFor = (email) => crypto.createHmac('sha256', secret).update(`csrf:${email}`).digest('base64url');
  return {
    tokenFor,
    verify(req, res, next) {
      if (req.method !== 'POST') return next();
      const site = req.get('Sec-Fetch-Site');
      if (site && !['same-origin', 'none'].includes(site)) return deny(res, 403, 'Kërkesa u bllokua (origjinë e huaj).');
      const sent = String(req.body?._csrf || '');
      const want = tokenFor(req.user.email);
      if (sent.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(want))) {
        return deny(res, 403, 'Formulari skadoi. Rifresko faqen dhe provo sërish.');
      }
      next();
    },
  };
}

function deny(res, code, msg) {
  res.status(code).type('html').send(`<!doctype html><meta charset="utf-8"><title>ODA Redaksia</title>
  <body style="font-family:system-ui;padding:3rem;max-width:40rem;margin:auto;background:#F1F3F0;color:#17212B">
  <h1 style="font-size:1.4rem">Nuk ke akses</h1><p>${msg.replace(/</g, '&lt;')}</p></body>`);
}
