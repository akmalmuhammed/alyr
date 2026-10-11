# Font Implementation

## Approved families

- Instrument Sans Variable — Latin interface and editorial text
- IBM Plex Sans Arabic — Arabic companion
- IBM Plex Mono — operational metadata, IDs and technical notes

## Repository policy

Font binaries are not present in this pack yet. Add only files sourced from the official publisher/Google Fonts repository and include the applicable SIL Open Font License text. Do not copy generated build-cache fonts from application `dist` or `.vinext` directories.

## CSS contract

```css
:root {
  --font-sans: "Instrument Sans", sans-serif;
  --font-arabic: "IBM Plex Sans Arabic", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;
}

html[dir="rtl"] body { font-family: var(--font-arabic); }
[data-metadata], code, time, .status-id { font-family: var(--font-mono); }
```

## License and QA

Keep license files beside the binaries, use `font-display: swap`, subset only after Arabic coverage is confirmed, and verify mixed English/Arabic labels, numbers and IDs before release.
