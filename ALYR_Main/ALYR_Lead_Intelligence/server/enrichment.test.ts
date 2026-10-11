import { describe, expect, it } from 'vitest';
import { parseWebsiteHtml } from './enrichment.js';

describe('website enrichment parser', () => {
  it('extracts public contact evidence and digital-maturity signals', () => {
    const html = `
      <!doctype html>
      <html lang="en">
        <head>
          <title>ClearPath Services — Doha</title>
          <link rel="alternate" hreflang="ar-QA" href="/ar" />
          <script type="application/ld+json">
            {"@type":"Organization","name":"ClearPath Services","email":"hello@clearpath.example","telephone":"+974 4400 1122","sameAs":["https://www.linkedin.com/company/clearpath"]}
          </script>
          <script src="https://www.googletagmanager.com/gtm.js"></script>
        </head>
        <body>
          <a href="mailto:sales@clearpath.example">Email</a>
          <a href="tel:+97444001122">Call</a>
          <a href="https://wa.me/97444001122">WhatsApp</a>
          <a href="/contact-us">Contact</a>
          <a href="/privacy">Privacy</a>
          <form><input name="email" /></form>
          <p>Book an appointment online.</p>
        </body>
      </html>`;

    const result = parseWebsiteHtml(html, new URL('https://clearpath.example'));

    expect(result.businessNames).toContain('ClearPath Services');
    expect(result.emails).toEqual(expect.arrayContaining(['hello@clearpath.example', 'sales@clearpath.example']));
    expect(result.phones).toEqual(expect.arrayContaining(['+974 4400 1122', '+97444001122']));
    expect(result.socialLinks[0]).toContain('linkedin.com');
    expect(result.whatsappLinks).toContain('https://wa.me/97444001122');
    expect(result.contactCandidates).toContain('https://clearpath.example/contact-us');
    expect(result.languages).toEqual(expect.arrayContaining(['English', 'Arabic']));
    expect(result.technologies).toContain('Google Tag Manager');
    expect(result.hasForm).toBe(true);
    expect(result.hasBooking).toBe(true);
    expect(result.hasPrivacy).toBe(true);
    expect(result.hasAnalytics).toBe(true);
  });

  it('ignores malformed structured data without breaking the page', () => {
    const result = parseWebsiteHtml(
      '<html><head><title>Simple Co</title><script type="application/ld+json">{bad json</script></head><body>No form</body></html>',
      new URL('https://simple.example'),
    );
    expect(result.businessNames).toContain('Simple Co');
    expect(result.hasForm).toBe(false);
  });
});
