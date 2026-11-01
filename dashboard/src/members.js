// Verifies that a vote comes from a signed-in ODA reader.
// The browser asks Ghost for a short-lived identity token (GET /members/api/session, 10 minutes) and sends it here.
// We check Ghost's signature with its public keys. Only a keyed hash of the email is ever stored.
import { createRemoteJWKSet, jwtVerify } from 'jose';

const fail = (msg, status = 401) => Object.assign(new Error(msg), { status });

export function memberVerifier({ siteUrl, jwksUrl, keySet }) {
  const base = String(siteUrl || '').replace(/\/$/, '');
  if (!base) return async () => { throw fail('Votimi nuk është konfiguruar ende.', 503); };
  // In Docker the keys are fetched from ghost:2368 directly; Ghost is told which public site is meant.
  const url = new URL(jwksUrl || `${base}/members/.well-known/jwks.json`);
  const pub = new URL(base);
  const headers = url.host === pub.host ? {} : { 'X-Forwarded-Host': pub.host, 'X-Forwarded-Proto': pub.protocol.replace(':', '') };
  const keys = keySet || createRemoteJWKSet(url, { cacheMaxAge: 10 * 60e3, timeoutDuration: 5000, headers });
  const issuers = [`${base}/members/api`, `${base}/members/api/`];

  return async function verify(token) {
    if (!token) throw fail('Hyr si lexues për të votuar.');
    try {
      const { payload } = await jwtVerify(token, keys, { issuer: issuers, audience: issuers, algorithms: ['RS512'], maxTokenAge: '15m' });
      // Ghost signs read-only entitlement tokens with the same key; only identity tokens may act as a reader.
      if (payload.scope !== 'members:identity') throw new Error('wrong scope');
      const email = String(payload.sub || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('no subject');
      return email;
    } catch {
      throw fail('Sesioni yt ka skaduar. Rifresko faqen dhe provo sërish.');
    }
  };
}
