# Typography

## Type architecture

**Primary interface and editorial family:** Instrument Sans Variable.

**Data and technical annotation:** IBM Plex Mono, used only for IDs, timestamps, code, token values and compact operational metadata.

**Arabic companion:** IBM Plex Sans Arabic or an approved equivalent with comparable density and screen clarity. Arabic must be optically balanced—not forced into Latin line-height values.

**Logo:** the ALYR wordmark is custom vector artwork. It is not a font and must never be retyped.

## Scale

| Style | Desktop | Mobile | Weight | Line height |
|---|---:|---:|---:|---:|
| Display 1 | 72 | 44 | 650 | 0.98 |
| Display 2 | 56 | 38 | 620 | 1.02 |
| Heading 1 | 44 | 34 | 620 | 1.08 |
| Heading 2 | 34 | 28 | 600 | 1.14 |
| Heading 3 | 26 | 23 | 600 | 1.20 |
| Heading 4 | 21 | 20 | 600 | 1.25 |
| Body large | 19 | 18 | 450 | 1.55 |
| Body | 16 | 16 | 430 | 1.55 |
| Body small | 14 | 14 | 450 | 1.45 |
| Label | 13 | 13 | 600 | 1.20 |
| Metadata | 12 | 12 | 520 | 1.35 |

## Rules

- Use optical rather than mechanical line breaks in high-value headlines.
- Limit reading width to approximately 68 characters.
- Keep body text at 16px minimum in customer-facing digital products.
- Use all-caps labels only at 11–13px with increased tracking.
- Use tabular numerals for dashboards and tables.
- Do not fake weights that are missing from the font file.
- Do not use the custom cut-Y style in ordinary copy.

## Font licensing and delivery

Instrument Sans and IBM Plex families are open-source typefaces. Production teams must self-host approved WOFF2 files and include their license files. The showcase uses a web-font request with robust system fallbacks; see `Fonts/README.md`.

