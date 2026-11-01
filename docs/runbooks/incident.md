# Incident response

**Site under attack (slow or down):** Cloudflare > Security > turn on "Under Attack" mode. Check `docker compose ps` and `docker compose logs --tail 200 ghost`. If the server is gone, point DNS to the static mirror and start a restore.

**Suspected account takeover:** suspend the user in Ghost (Staff), revoke their Cloudflare Access session, rotate the integration API key, check Ghost's history log for changes, restore edited posts from revisions.

**Data breach or leak:** isolate (take the affected service offline), write down what happened with times, tell the Security lead and Legal. GDPR: the supervisory authority must be told within 72 hours if personal data is at risk.

After every incident: short written review within a week, what changes so it doesn't happen again.
