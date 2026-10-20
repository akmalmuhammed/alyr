// Written by scripts/site-report-images.mjs from the API's sample cards. Do not edit by hand.

import bakery_ar_avif from "./bakery.ar.avif";
import bakery_ar_webp from "./bakery.ar.webp";
import bakery_ar_png from "./bakery.ar.png";
import bakery_ar_paper_avif from "./bakery.ar.paper.avif";
import bakery_ar_paper_webp from "./bakery.ar.paper.webp";
import bakery_ar_paper_png from "./bakery.ar.paper.png";
import bakery_en_avif from "./bakery.en.avif";
import bakery_en_webp from "./bakery.en.webp";
import bakery_en_png from "./bakery.en.png";
import bakery_en_paper_avif from "./bakery.en.paper.avif";
import bakery_en_paper_webp from "./bakery.en.paper.webp";
import bakery_en_paper_png from "./bakery.en.paper.png";
import homeservices_ar_avif from "./homeservices.ar.avif";
import homeservices_ar_webp from "./homeservices.ar.webp";
import homeservices_ar_png from "./homeservices.ar.png";
import homeservices_ar_paper_avif from "./homeservices.ar.paper.avif";
import homeservices_ar_paper_webp from "./homeservices.ar.paper.webp";
import homeservices_ar_paper_png from "./homeservices.ar.paper.png";
import homeservices_en_avif from "./homeservices.en.avif";
import homeservices_en_webp from "./homeservices.en.webp";
import homeservices_en_png from "./homeservices.en.png";
import homeservices_en_paper_avif from "./homeservices.en.paper.avif";
import homeservices_en_paper_webp from "./homeservices.en.paper.webp";
import homeservices_en_paper_png from "./homeservices.en.paper.png";
import salon_ar_avif from "./salon.ar.avif";
import salon_ar_webp from "./salon.ar.webp";
import salon_ar_png from "./salon.ar.png";
import salon_ar_paper_avif from "./salon.ar.paper.avif";
import salon_ar_paper_webp from "./salon.ar.paper.webp";
import salon_ar_paper_png from "./salon.ar.paper.png";
import salon_en_avif from "./salon.en.avif";
import salon_en_webp from "./salon.en.webp";
import salon_en_png from "./salon.en.png";
import salon_en_paper_avif from "./salon.en.paper.avif";
import salon_en_paper_webp from "./salon.en.paper.webp";
import salon_en_paper_png from "./salon.en.paper.png";

export type CardImage = { avif: string; webp: string; png: string; width: number; height: number };

/** Each sample's card, by "{sample}.{language}": Carbon (dark) and Paper (light). */
export const REPORT_IMAGES: Record<string, { carbon: CardImage; paper: CardImage }> = {
  "bakery.ar": {
    carbon: { avif: bakery_ar_avif.src, webp: bakery_ar_webp.src, png: bakery_ar_png.src, width: bakery_ar_png.width, height: bakery_ar_png.height },
    paper: { avif: bakery_ar_paper_avif.src, webp: bakery_ar_paper_webp.src, png: bakery_ar_paper_png.src, width: bakery_ar_paper_png.width, height: bakery_ar_paper_png.height },
  },
  "bakery.en": {
    carbon: { avif: bakery_en_avif.src, webp: bakery_en_webp.src, png: bakery_en_png.src, width: bakery_en_png.width, height: bakery_en_png.height },
    paper: { avif: bakery_en_paper_avif.src, webp: bakery_en_paper_webp.src, png: bakery_en_paper_png.src, width: bakery_en_paper_png.width, height: bakery_en_paper_png.height },
  },
  "homeservices.ar": {
    carbon: { avif: homeservices_ar_avif.src, webp: homeservices_ar_webp.src, png: homeservices_ar_png.src, width: homeservices_ar_png.width, height: homeservices_ar_png.height },
    paper: { avif: homeservices_ar_paper_avif.src, webp: homeservices_ar_paper_webp.src, png: homeservices_ar_paper_png.src, width: homeservices_ar_paper_png.width, height: homeservices_ar_paper_png.height },
  },
  "homeservices.en": {
    carbon: { avif: homeservices_en_avif.src, webp: homeservices_en_webp.src, png: homeservices_en_png.src, width: homeservices_en_png.width, height: homeservices_en_png.height },
    paper: { avif: homeservices_en_paper_avif.src, webp: homeservices_en_paper_webp.src, png: homeservices_en_paper_png.src, width: homeservices_en_paper_png.width, height: homeservices_en_paper_png.height },
  },
  "salon.ar": {
    carbon: { avif: salon_ar_avif.src, webp: salon_ar_webp.src, png: salon_ar_png.src, width: salon_ar_png.width, height: salon_ar_png.height },
    paper: { avif: salon_ar_paper_avif.src, webp: salon_ar_paper_webp.src, png: salon_ar_paper_png.src, width: salon_ar_paper_png.width, height: salon_ar_paper_png.height },
  },
  "salon.en": {
    carbon: { avif: salon_en_avif.src, webp: salon_en_webp.src, png: salon_en_png.src, width: salon_en_png.width, height: salon_en_png.height },
    paper: { avif: salon_en_paper_avif.src, webp: salon_en_paper_webp.src, png: salon_en_paper_png.src, width: salon_en_paper_png.width, height: salon_en_paper_png.height },
  },
};
