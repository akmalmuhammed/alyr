import dns from 'node:dns/promises';
import net from 'node:net';
import { load } from 'cheerio';
import robotsParserModule from 'robots-parser';
import { getDemoEnrichment } from './demo.js';
import type { WebsiteEnrichment, WebsiteSignal } from './types.js';

const DEFAULT_USER_AGENT = 'ALYR-Prospect-Engine/0.1';
const MAX_HTML_BYTES = 1_250_000;
const MAX_REDIRECTS = 3;
const robotsParser = robotsParserModule as unknown as typeof import('robots-parser').default;

function normalizeUrl(input: string): URL {
  const value = input.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS websites can be enriched.');
  if (url.username || url.password) throw new Error('Website URLs containing credentials are not allowed.');
  return url;
}

function isPrivateIp(address: string): boolean {
  const kind = net.isIP(address);
  if (kind === 4) {
    const octets = address.split('.').map(Number);
    return (
      octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] >= 224
    );
  }
  if (kind === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return true;
}

async function assertPublicHost(url: URL): Promise<void> {
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((item) => isPrivateIp(item.address))) {
    throw new Error('The requested website resolves to a private or restricted network address.');
  }
}

async function fetchPublicText(
  initialUrl: URL,
  userAgent: string,
  accept: string,
  maxBytes: number,
  redirectCount = 0,
): Promise<{ text: string; finalUrl: URL; contentType: string }> {
  await assertPublicHost(initialUrl);
  const response = await fetch(initialUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'User-Agent': userAgent,
      Accept: accept,
      'Accept-Language': 'en,ar;q=0.8',
    },
    signal: AbortSignal.timeout(9_000),
  });

  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error('The website redirected too many times.');
    const location = response.headers.get('location');
    if (!location) throw new Error('The website returned an invalid redirect.');
    return fetchPublicText(new URL(location, initialUrl), userAgent, accept, maxBytes, redirectCount + 1);
  }

  if (!response.ok) throw new Error(`The website returned HTTP ${response.status}.`);
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > maxBytes) throw new Error('The website response is too large to inspect safely.');

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error('The website response exceeded the safe inspection limit.');

  return {
    text: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
    finalUrl: initialUrl,
    contentType: response.headers.get('content-type') ?? '',
  };
}

async function robotsAllows(url: URL, userAgent: string): Promise<boolean> {
  const robotsUrl = new URL('/robots.txt', url);
  try {
    const result = await fetchPublicText(robotsUrl, userAgent, 'text/plain,*/*;q=0.1', 200_000);
    const rules = robotsParser(robotsUrl.toString(), result.text);
    return rules.isAllowed(url.toString(), userAgent) !== false;
  } catch {
    return true;
  }
}

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function normalizeEmail(value: string): string | undefined {
  const email = decodeURIComponent(value).replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email) ? email : undefined;
}

function normalizePhone(value: string): string | undefined {
  const decoded = decodeURIComponent(value).replace(/^tel:/i, '').split('?')[0].trim();
  const compact = decoded.replace(/[^+\d]/g, '');
  return compact.replace(/\D/g, '').length >= 7 ? decoded : undefined;
}

function walkJson(value: unknown, output: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, output));
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    output.push(record);
    Object.values(record).forEach((item) => walkJson(item, output));
  }
}

interface ParsedPage {
  businessNames: string[];
  emails: string[];
  phones: string[];
  socialLinks: string[];
  whatsappLinks: string[];
  languages: string[];
  technologies: string[];
  contactCandidates: string[];
  hasForm: boolean;
  hasBooking: boolean;
  hasPrivacy: boolean;
  hasAnalytics: boolean;
  hasCommerce: boolean;
}

export function parseWebsiteHtml(html: string, pageUrl: URL): ParsedPage {
  const $ = load(html);
  const records: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      walkJson(JSON.parse($(element).text()), records);
    } catch {
      // Invalid third-party JSON-LD is ignored.
    }
  });

  const structuredNames: string[] = [];
  const structuredEmails: string[] = [];
  const structuredPhones: string[] = [];
  const structuredSocials: string[] = [];
  for (const record of records) {
    if (typeof record.name === 'string') structuredNames.push(record.name);
    if (typeof record.email === 'string') structuredEmails.push(record.email);
    if (typeof record.telephone === 'string') structuredPhones.push(record.telephone);
    if (Array.isArray(record.sameAs)) structuredSocials.push(...record.sameAs.filter((item): item is string => typeof item === 'string'));
  }

  const mailto = $('a[href^="mailto:"]').map((_index, element) => normalizeEmail($(element).attr('href') ?? '')).get();
  const bodyEmails = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const tel = $('a[href^="tel:"]').map((_index, element) => normalizePhone($(element).attr('href') ?? '')).get();
  const allLinks = $('a[href]').map((_index, element) => $(element).attr('href')).get().filter((href): href is string => Boolean(href));

  const socialPattern = /(?:linkedin\.com|instagram\.com|facebook\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com)/i;
  const socialLinks = allLinks.filter((href) => socialPattern.test(href)).map((href) => new URL(href, pageUrl).toString());
  const whatsappLinks = allLinks.filter((href) => /(?:wa\.me|api\.whatsapp\.com|whatsapp:\/\/)/i.test(href));
  const contactCandidates = allLinks
    .filter((href) => /contact|connect|enquir|inquir|اتصل/i.test(href))
    .map((href) => new URL(href, pageUrl).toString())
    .filter((href) => new URL(href).origin === pageUrl.origin);

  const scriptsAndMarkup = html.toLowerCase();
  const technologies = [
    ['WordPress', /wp-content|wordpress/],
    ['Shopify', /cdn\.shopify|shopify\.theme/],
    ['Wix', /wixstatic|wix-code/],
    ['Webflow', /webflow\.js|data-wf-page/],
    ['HubSpot', /js\.hsforms|hubspot/],
    ['Google Tag Manager', /googletagmanager\.com/],
    ['Google Analytics', /google-analytics\.com|gtag\(/],
    ['Meta Pixel', /connect\.facebook\.net.*fbevents/],
    ['Cloudbeds booking widget', /cloudbeds/],
  ].filter(([, pattern]) => (pattern as RegExp).test(scriptsAndMarkup)).map(([name]) => name as string);

  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const siteName = $('meta[property="og:site_name"]').attr('content')?.trim();
  const appName = $('meta[name="application-name"]').attr('content')?.trim();
  const htmlLanguage = $('html').attr('lang')?.split('-')[0]?.trim();
  const hreflangs = $('link[hreflang]').map((_index, element) => $(element).attr('hreflang')?.split('-')[0]).get();

  return {
    businessNames: unique([...structuredNames, siteName, appName, title?.split(/[|–—-]/)[0]]),
    emails: unique([...structuredEmails.map(normalizeEmail), ...mailto, ...bodyEmails.map(normalizeEmail)]),
    phones: unique([...structuredPhones.map(normalizePhone), ...tel]),
    socialLinks: unique([...structuredSocials, ...socialLinks]),
    whatsappLinks: unique(whatsappLinks),
    languages: unique([htmlLanguage, ...hreflangs]).map((code) => ({ en: 'English', ar: 'Arabic' })[code] ?? code.toUpperCase()),
    technologies: unique(technologies),
    contactCandidates: unique(contactCandidates),
    hasForm: $('form').length > 0,
    hasBooking: /book now|book online|reserve|appointment|schedule|booking/i.test($.root().text()) || /booking|calendly|cloudbeds|mindbody/.test(scriptsAndMarkup),
    hasPrivacy: allLinks.some((href) => /privacy|data-protection/i.test(href)),
    hasAnalytics: /googletagmanager|google-analytics|gtag\(|clarity\.ms|matomo|plausible/.test(scriptsAndMarkup),
    hasCommerce: /shopify|woocommerce|add to cart|checkout/i.test(scriptsAndMarkup),
  };
}

function buildSignals(page: ParsedPage): WebsiteSignal[] {
  const signals: WebsiteSignal[] = [];
  if (!page.hasForm && page.whatsappLinks.length > 0) {
    signals.push({ key: 'whatsapp-led', label: 'WhatsApp-led enquiry flow', state: 'opportunity', evidence: 'WhatsApp was found, but no structured website form was observed.', weight: 14 });
  } else if (page.hasForm) {
    signals.push({ key: 'structured-capture', label: 'Structured capture present', state: 'strength', evidence: 'At least one website form was observed.', weight: -4 });
  }
  signals.push(page.hasBooking
    ? { key: 'booking', label: 'Self-service action present', state: 'strength', evidence: 'Booking, reservation or scheduling language was observed.', weight: -6 }
    : { key: 'no-booking', label: 'No self-service action found', state: 'opportunity', evidence: 'No booking, scheduling or reservation path was found on reviewed pages.', weight: 14 });
  signals.push(page.hasPrivacy
    ? { key: 'privacy', label: 'Privacy link present', state: 'strength', evidence: 'A privacy or data-protection link was observed.', weight: -4 }
    : { key: 'no-privacy', label: 'Privacy link not found', state: 'opportunity', evidence: 'No privacy or data-protection link was observed on reviewed pages.', weight: 10 });
  if (page.languages.length <= 1) {
    signals.push({ key: 'single-language', label: 'Single-language journey', state: 'opportunity', evidence: 'Only one page language was observed.', weight: 8 });
  } else {
    signals.push({ key: 'multilingual', label: 'Multilingual foundation present', state: 'strength', evidence: `${page.languages.length} languages were observed.`, weight: -4 });
  }
  if (page.hasAnalytics) signals.push({ key: 'analytics', label: 'Analytics foundation present', state: 'strength', evidence: 'Analytics or tag-management code was detected.', weight: -4 });
  if (page.hasCommerce) signals.push({ key: 'commerce', label: 'Digital commerce present', state: 'strength', evidence: 'Commerce or checkout technology was detected.', weight: -5 });
  return signals;
}

export async function enrichWebsite(input: string): Promise<WebsiteEnrichment> {
  const demo = getDemoEnrichment(input.trim());
  if (demo) return demo;

  const userAgent = process.env.WEBSITE_ENRICHMENT_USER_AGENT || DEFAULT_USER_AGENT;
  const requested = normalizeUrl(input);
  if (!(await robotsAllows(requested, userAgent))) {
    throw new Error('The website robots policy does not allow this page to be inspected.');
  }

  const home = await fetchPublicText(requested, userAgent, 'text/html,application/xhtml+xml', MAX_HTML_BYTES);
  if (!home.contentType.toLowerCase().includes('text/html')) throw new Error('The requested URL is not an HTML page.');
  const parsedHome = parseWebsiteHtml(home.text, home.finalUrl);
  const pages = [parsedHome];
  const crawledUrls = [home.finalUrl.toString()];

  const contactUrl = parsedHome.contactCandidates[0] ? new URL(parsedHome.contactCandidates[0]) : undefined;
  if (contactUrl && contactUrl.origin === home.finalUrl.origin && contactUrl.toString() !== home.finalUrl.toString()) {
    if (await robotsAllows(contactUrl, userAgent)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        const contact = await fetchPublicText(contactUrl, userAgent, 'text/html,application/xhtml+xml', MAX_HTML_BYTES);
        if (contact.contentType.toLowerCase().includes('text/html')) {
          pages.push(parseWebsiteHtml(contact.text, contact.finalUrl));
          crawledUrls.push(contact.finalUrl.toString());
        }
      } catch {
        // Homepage evidence is still useful when the contact page cannot be read.
      }
    }
  }

  const combined: ParsedPage = {
    businessNames: unique(pages.flatMap((page) => page.businessNames)),
    emails: unique(pages.flatMap((page) => page.emails)),
    phones: unique(pages.flatMap((page) => page.phones)),
    socialLinks: unique(pages.flatMap((page) => page.socialLinks)),
    whatsappLinks: unique(pages.flatMap((page) => page.whatsappLinks)),
    languages: unique(pages.flatMap((page) => page.languages)),
    technologies: unique(pages.flatMap((page) => page.technologies)),
    contactCandidates: unique(pages.flatMap((page) => page.contactCandidates)),
    hasForm: pages.some((page) => page.hasForm),
    hasBooking: pages.some((page) => page.hasBooking),
    hasPrivacy: pages.some((page) => page.hasPrivacy),
    hasAnalytics: pages.some((page) => page.hasAnalytics),
    hasCommerce: pages.some((page) => page.hasCommerce),
  };
  const signals = buildSignals(combined);
  const fitScore = Math.max(20, Math.min(96, 44 + signals.reduce((total, signal) => total + signal.weight, 0)));

  return {
    businessName: combined.businessNames[0] || home.finalUrl.hostname.replace(/^www\./, ''),
    sourceUrl: home.finalUrl.toString(),
    crawledUrls,
    emails: combined.emails,
    phones: combined.phones,
    socialLinks: combined.socialLinks,
    whatsappLinks: combined.whatsappLinks,
    contactPage: contactUrl?.toString(),
    languages: combined.languages,
    technologies: combined.technologies,
    signals,
    fitScore,
    observedAt: new Date().toISOString(),
    robotsAllowed: true,
  };
}
