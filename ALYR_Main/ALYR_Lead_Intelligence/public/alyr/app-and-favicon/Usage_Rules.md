# App Icon and Favicon Rules

## App icon

The app icon uses a Carbon container, White structural planes and a Volt signal plane. The outer radius is part of the icon artwork; operating systems may apply an additional mask.

- Do not add text or the full wordmark.
- Keep the symbol optically centered, not mathematically forced.
- Do not add notification dots inside the artwork; use the operating system badge.
- Use the monochrome asset only when the platform explicitly requests it.

## Android adaptive icon

Use `03_Android_Adaptive/foreground.svg` and `background.svg`. Verify circle, squircle, rounded-square and teardrop masks. Keep critical geometry inside the platform safe zone.

## Web favicon

Recommended HTML:

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/favicon-180x180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#15171A">
```

Test on light/dark browser chrome and at 16px. At very small sizes, recognizable plane separation matters more than exact negative-space width.

