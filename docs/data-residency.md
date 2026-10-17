# Data residency register

Hard rule 2 (CLAUDE.md): production runs in Qatar, and no service outside Qatar receives merchant or end-customer personal data unless it is listed here with its legal basis. Add a row in the same pull request that adds the service. If a service is not here, it must not receive personal data.

**About the legal basis.** No lawyer has reviewed this yet (ALY-51). Our reading of Qatar's personal data law (Law No. 13 of 2016) is in D-013: it does not generally forbid a private company from processing data outside Qatar, and localisation duties fall on government bodies and some regulated sectors. Until a written opinion exists, each row keeps the data to the minimum shown and no salary or QID data leaves Qatar.

Last updated 16 Oct 2026.

| Service | What it receives | Where | Why we need it | Legal basis (our reading, pending ALY-51) | Limits we keep |
|---|---|---|---|---|---|
| Meta, WhatsApp Cloud API | Every WhatsApp message to and from a shop, customers' WhatsApp numbers or user IDs and names | Meta's data centres, outside Qatar | The product is WhatsApp; hard rule 4 requires the official API | The customer starts the conversation on WhatsApp and agrees to Meta's terms; the shop uses WhatsApp Business under Meta's business terms | Only what a conversation needs; templates only with consent (D-020) |
| Cloudflare: DNS, tunnel, public site | Web requests to alyr.qa and app.alyr.online, including customer pages (order, booking, payment, tracking) passing through the tunnel | Cloudflare's global network | Domain, TLS, and reaching the laptop until hosting is chosen | Transit and hosting provider; encrypted in transit | No logs kept by us beyond Cloudflare's defaults; replaced by Qatar hosting (ALY-63) |
| Cloudflare Email Routing | Email sent to @alyr.qa addresses (ALYR's own mail, which may include a customer's message) | Cloudflare's global network, forwarded to the founder's inbox | Company email (D-029) | Customers choose to write to us | ALYR's mail only; no merchant data is routed through it |
| Resend | A staff member's email address and their one-time sign-in code | EU (Ireland, eu-west-1) | Sign-in by code (D-022, D-029) | Needed to give the person access they asked for; minimal data | Code only, no customer data, open and click tracking off |
| Neon | The fictional demo shop; consenting alpha merchants only | Frankfurt | Hosted database until Qatar hosting (D-013) | As D-013 | No salary or QID data; leaves at the first paying customer. Replaced by Azure Qatar Central (D-036) |
| Google Cloud Storage and, in an emergency, Cloud Run and Cloud SQL (planned, D-036) | Nightly database backups, encrypted before they leave Azure with a key only the founder holds; in an emergency, the whole database | Doha, Qatar | A copy with a second company, because Azure Qatar Central has no paired region | In Qatar | Encrypted at rest with our key; deleted after 35 days |
| Cloudflare R2 (planned, D-036) | The same encrypted nightly backups | EU jurisdiction storage | Survives a Qatar-wide outage | Our reading: an encrypted copy that Cloudflare cannot read; to confirm with the lawyer (ALY-51) | Encrypted before upload; deleted after 35 days; switched off if the lawyer advises against it |
| GitHub | Source code and fictional demo data only | United States | Code and CI | No personal data | Real customer data never enters the repo (CLAUDE.md rule 10) |
