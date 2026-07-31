# Heldat public launch surface

This is the deliberately public part of Heldat:

- product home;
- privacy notice;
- terms;
- support;
- account deletion instructions;
- coordinated security disclosure;
- OAuth return guidance;
- mobile app-link fallback pages.

It is separate from the authenticated web prototype so a public launch never
exposes local fixtures, unfinished account behavior, or user content.

## Local verification

```powershell
npm run check --workspace=@heldat/site
npm run deploy:dry-run --workspace=@heldat/site
```

## Deployment sequence

1. Deploy `wrangler.preview.jsonc` to `heldat-site-preview.workers.dev`.
2. Verify every route, security header, responsive layout and legal link.
3. Deploy `wrangler.jsonc` to the proxied `heldat.app/*` zone route.
4. Add a proxied originless `www` record and the matching Worker route, then
   verify its permanent redirect to the apex.
5. Publish each file under `association-templates/` to `public/.well-known/`
   only after replacing its release identity values with verified values.

Android `assetlinks.json` is published for `app.heldat.mobile` and the verified
EAS signing certificate used by the current direct-install build. Add the
Google Play app-signing certificate before distributing through Play.

The Apple association remains a private template until the final Apple Team ID
and signed iOS application are available. Publishing an Apple placeholder or
empty response would slow down signed-build verification later.
