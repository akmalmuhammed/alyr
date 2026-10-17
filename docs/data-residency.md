# Data residency register

Hard rule 2 (CLAUDE.md): production runs in Qatar, and no service outside Qatar receives merchant or end-customer personal data unless it is listed here with its legal basis. Add a row in the same pull request that adds the service. If a service is not here, it must not receive personal data.

**About the legal basis.** No lawyer has reviewed this yet (ALY-51). Our reading of Qatar's personal data law (Law No. 13 of 2016) is in D-013: it does not generally forbid a private company from processing data outside Qatar, and localisation duties fall on government bodies and some regulated sectors. Until a written opinion exists, each row keeps the data to the minimum shown and no salary or QID data leaves Qatar.

Last updated 17 Oct 2026.

| Service | What it receives | Where | Why we need it | Legal basis (our reading, pending ALY-51) | Limits we keep |
|---|---|---|---|---|---|
| Meta, WhatsApp Cloud API | Every WhatsApp message to and from a shop, customers' WhatsApp numbers or user IDs and names | Meta's data centres, outside Qatar | The product is WhatsApp; hard rule 4 requires the official API | The customer starts the conversation on WhatsApp and agrees to Meta's terms; the shop uses WhatsApp Business under Meta's business terms | Only what a conversation needs; templates only with consent (D-020) |
| Cloudflare: DNS, tunnel, public site | Web requests to alyr.qa and app.alyr.online, including customer pages (order, booking, payment, tracking) passing through the tunnel | Cloudflare's global network | Domain, TLS, and reaching the laptop until hosting is chosen | Transit and hosting provider; encrypted in transit | No logs kept by us beyond Cloudflare's defaults; replaced by Qatar hosting (ALY-63) |
| Cloudflare Email Routing | Email sent to @alyr.qa addresses (ALYR's own mail, which may include a customer's message) | Cloudflare's global network, forwarded to the founder's inbox | Company email (D-029) | Customers choose to write to us | ALYR's mail only; no merchant data is routed through it |
| Resend | A staff member's email address and their one-time sign-in code | EU (Ireland, eu-west-1) | Sign-in by code (D-022, D-029) | Needed to give the person access they asked for; minimal data | Code only, no customer data, open and click tracking off |
| Cloudflare R2 (D-039) | Shops' product photos, which are public by design, with the item they belong to. Location and camera data is removed at upload. Never customer data, documents or ID photos | Cloudflare's network; the bucket `alyr-media` has an automatic location chosen by Cloudflare, not Qatar | Product photos for the online catalog | Product photos are not personal data. A person who appears in a photo is the owner's responsibility under the listing policy (ALY-68) | Public product photos only; one folder per shop; per-shop caps; no private files |
| Neon | The fictional demo shop; consenting alpha merchants only | Frankfurt | Hosted database until Qatar hosting (D-013) | As D-013 | No salary or QID data; leaves at the first paying customer |
| GitHub | Source code and fictional demo data only | United States | Code and CI | No personal data | Real customer data never enters the repo (CLAUDE.md rule 10) |
