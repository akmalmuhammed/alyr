// Generated from design/tokens.json by scripts/tokens-build.mjs. Do not edit: change the
// JSON and run `node scripts/tokens-build.mjs`. design/README.md says how to use these.
// In CSS, use the custom properties in tokens.css instead; these are for code that cannot
// read CSS (images drawn with next/og, SVG fills, theme-color).

export const color = {
  "brand": {
    "carbon": "#15171a",
    "volt": "#b7f34a",
    "volt-hover": "#a5e238",
    "volt-pressed": "#8fc42d",
    "concrete": "#a7adb5",
    "graphite": "#2a2e33"
  },
  "ink": {
    "paper": "#f6f7f3",
    "chalk": "#f3f5f0",
    "volt-ink": "#3f6a0b",
    "on-volt": "#151a0f",
    "moss": "#6a9320",
    "white": "#ffffff",
    "black": "#000000"
  },
  "grey": {
    "101": "#191c1f",
    "106": "#1a1d21",
    "111": "#1b1e22",
    "121": "#1d2024",
    "140": "#202428",
    "154": "#23272b",
    "169": "#262a2f",
    "193": "#2c2f33",
    "210": "#2f3338",
    "228": "#32373c",
    "260": "#3a3e44",
    "264": "#3a3f45",
    "391": "#555d65",
    "428": "#5f666d",
    "445": "#646a71",
    "485": "#6b7480",
    "493": "#6f767e",
    "595": "#8a918b",
    "598": "#8a9199",
    "807": "#c4c9cf",
    "817": "#c9ccc6",
    "863": "#d6d9d3",
    "865": "#d5d9dd",
    "873": "#d8dcd7",
    "885": "#dcdfda",
    "909": "#e3e6e1",
    "938": "#eceee9",
    "945": "#eef0ec",
    "957": "#f2f3ef",
    "974": "#f7f8f5",
    "067": "#131518",
    "050": "#0f1113",
    "046": "#0e1012",
    "033": "#0b0c0d",
    "030": "#0a0b0d",
    "014": "#050505"
  },
  "alpha": {
    "carbon-08": "rgb(21 23 26 / .08)",
    "carbon-10": "rgb(21 23 26 / .1)",
    "carbon-14": "rgb(21 23 26 / .14)",
    "white-07": "rgb(255 255 255 / .07)",
    "white-09": "rgb(255 255 255 / .09)",
    "white-13": "rgb(255 255 255 / .13)",
    "volt-12": "rgb(183 243 74 / .12)",
    "volt-18": "rgb(183 243 74 / .18)",
    "volt-22": "rgb(183 243 74 / .22)",
    "concrete-20": "rgb(167 173 181 / .2)",
    "concrete-07": "rgb(167 173 181 / .07)",
    "transparent": "transparent"
  },
  "status": {
    "green-700": "#2d7d46",
    "green-300": "#7fd09a",
    "green-100": "#e4f1e7",
    "green-900": "#173424",
    "amber-700": "#a96400",
    "amber-300": "#e5bb6c",
    "amber-100": "#f7ecd9",
    "amber-900": "#3a2c12",
    "red-700": "#b42318",
    "red-300": "#f09a86",
    "red-100": "#fbe5e2",
    "red-900": "#3d1f18"
  },
  "drawing": {
    "sent": "#e3e9dc",
    "sent-dark": "#222a1c",
    "link": "#1f63a3",
    "link-dark": "#8cc2f2"
  },
  "whatsapp": {
    "head-line": "#e3e0da",
    "wallpaper": "#efeae2",
    "dot": "rgb(17 27 33 / .045)",
    "dot-2": "rgb(17 27 33 / .03)",
    "sent": "#d9fdd3",
    "ink": "#111b21",
    "soft": "#667781",
    "soft-sent": "#5f6f79",
    "shadow": "rgb(11 20 26 / .13)",
    "rule": "#e9edef",
    "link": "#027eb5",
    "tick": "#53bdeb",
    "avatar": "#dfe5e7",
    "avatar-ink": "#54656f",
    "hint": "#8696a0",
    "green": "#1daa61",
    "brand-green": "#25d366",
    "panel-dark": "#202c33",
    "head-line-dark": "#222e35",
    "wallpaper-dark": "#0b141a",
    "dot-dark": "rgb(233 237 239 / .035)",
    "dot-2-dark": "rgb(233 237 239 / .025)",
    "sent-dark": "#005c4b",
    "icon-dark": "#aebac1",
    "soft-sent-dark": "#b3cdc9",
    "chip-dark": "#182229",
    "shadow-dark": "rgb(0 0 0 / .25)",
    "rule-dark": "#2c3a41",
    "avatar-dark": "#6a7175",
    "field-dark": "#1f2c34",
    "green-dark": "#21c063"
  },
  "shop": {
    "cocoa": "#6f4329",
    "terracotta": "#a5432a",
    "rose": "#a53860",
    "saffron": "#8a5a00",
    "teal": "#1d6a6a",
    "plum": "#613a7d"
  }
} as const;

export const semantic = {
  "canvas": "#f6f7f3",
  "surface": "#ffffff",
  "surface-subtle": "#eef0ec",
  "text": "#15171a",
  "text-muted": "#5f666d",
  "text-faint": "#8a918b",
  "text-inverse": "#ffffff",
  "line": "#d8dcd7",
  "line-strong": "#8a918b",
  "hair": "rgb(21 23 26 / .08)",
  "hair-strong": "rgb(21 23 26 / .14)",
  "focus": "#6a9320",
  "on-volt": "#151a0f",
  "volt-ink": "#3f6a0b",
  "volt-wash": "rgb(183 243 74 / .18)",
  "pending": "#8a918b",
  "white": "#ffffff",
  "black": "#000000",
  "ok": "#2d7d46",
  "ok-soft": "#e4f1e7",
  "warn": "#a96400",
  "warn-soft": "#f7ecd9",
  "bad": "#b42318",
  "bad-soft": "#fbe5e2"
} as const;

export const component = {
  "band": {
    "band": "#15171a",
    "band-edge": "transparent",
    "dark-canvas": "#0e1012",
    "dark-surface": "#191c1f",
    "dark-subtle": "#202428",
    "dark-line": "#32373c",
    "dark-text": "#f3f5f0",
    "on-band": "#ffffff",
    "on-band-soft": "#d5d9dd",
    "on-band-quiet": "#c4c9cf",
    "on-band-faint": "#8a9199",
    "band-mark": "#6b7480",
    "band-rule": "#555d65"
  },
  "window": {
    "window": "#ffffff",
    "window-line": "rgb(21 23 26 / .1)",
    "mark-ring": "transparent",
    "monogram-bg": "#15171a",
    "monogram-ink": "#f3f5f0",
    "phone-frame": "#050505",
    "phone-outline": "#3a3f45"
  },
  "theme-switch": {
    "night": 0,
    "when-light": "inline",
    "when-dark": "none"
  },
  "chat": {
    "head": "#ffffff",
    "head-line": "#e3e0da",
    "paper": "#efeae2",
    "dot": "rgb(17 27 33 / .045)",
    "dot-2": "rgb(17 27 33 / .03)",
    "in": "#ffffff",
    "out": "#d9fdd3",
    "ink": "#111b21",
    "icon": "#111b21",
    "soft": "#667781",
    "soft-out": "#5f6f79",
    "chip": "#ffffff",
    "shadow": "rgb(11 20 26 / .13)",
    "rule": "#e9edef",
    "link": "#027eb5",
    "tick": "#53bdeb",
    "avatar": "#dfe5e7",
    "avatar-ink": "#54656f",
    "field": "#ffffff",
    "field-ink": "#54656f",
    "hint": "#8696a0",
    "green": "#1daa61",
    "on-green": "#ffffff",
    "brand": "#25d366"
  },
  "drawing": {
    "bg": "#f2f3ef",
    "card": "#ffffff",
    "raise": "#f7f8f5",
    "hair": "rgb(21 23 26 / .08)",
    "hair-2": "rgb(21 23 26 / .14)",
    "ink": "#15171a",
    "ink-2": "#5f666d",
    "ink-3": "#646a71",
    "volt-ink": "#3f6a0b",
    "wash": "rgb(183 243 74 / .22)",
    "chat": "#eceee9",
    "out": "#e3e9dc",
    "link": "#1f63a3",
    "bezel": "#0b0c0d",
    "lift": "0 1px 0 rgb(255 255 255 / .7) inset, 0 1px 2px rgb(21 23 26 / .05), 0 0 0 1px var(--hair)",
    "float": "0 18px 50px -14px rgb(21 23 26 / .32), 0 0 0 1px var(--hair-strong)",
    "grid": "rgb(167 173 181 / .2)"
  },
  "document": {
    "paper": "#ffffff",
    "ink": "#15171a",
    "ink-2": "#5f666d",
    "rule": "#d8dcd7",
    "band": "#eef0ec"
  },
  "agent": {
    "bar-mix": "88%",
    "ghost-mix": "10%"
  },
  "card": {
    "carbon": {
      "bg": "#15171a",
      "ink": "#f3f5f0",
      "ink2": "#a7adb5",
      "rule": "#2f3338",
      "bar": "#c9ccc6",
      "ghost": "#3a3e44",
      "volt": "#b7f34a",
      "edge": "none",
      "logo": "#ffffff"
    },
    "paper": {
      "bg": "#f6f7f3",
      "ink": "#15171a",
      "ink2": "#5f666d",
      "rule": "#dcdfda",
      "bar": "#2c2f33",
      "ghost": "#d6d9d3",
      "volt": "#b7f34a",
      "edge": "#15171a",
      "logo": "#15171a"
    }
  },
  "email": {
    "bg": "#f6f7f3",
    "text": "#15171a",
    "panel": "#ffffff",
    "muted": "#5f666d",
    "rule": "#e3e6e1"
  },
  "social": {
    "bg": "#15171a",
    "ink": "#ffffff",
    "ink2": "#a7adb5",
    "sep": "#5f666d",
    "volt": "#b7f34a"
  },
  "shop": {
    "cocoa": "#6f4329",
    "terracotta": "#a5432a",
    "rose": "#a53860",
    "saffron": "#8a5a00",
    "teal": "#1d6a6a",
    "plum": "#613a7d",
    "ink": "#ffffff"
  }
} as const;

export const font = {
  "family": {
    "sans": [
      "Instrument Sans",
      "Aptos",
      "Segoe UI Variable",
      "system-ui",
      "sans-serif"
    ],
    "arabic": [
      "IBM Plex Sans Arabic",
      "Segoe UI",
      "Geeza Pro",
      "sans-serif"
    ],
    "mono": [
      "IBM Plex Mono",
      "Cascadia Mono",
      "ui-monospace",
      "monospace"
    ],
    "ui": [
      "Instrument Sans",
      "IBM Plex Sans Arabic",
      "system-ui",
      "sans-serif"
    ],
    "ui-arabic": [
      "IBM Plex Sans Arabic",
      "Instrument Sans",
      "sans-serif"
    ],
    "chat": [
      "system-ui",
      "-apple-system",
      "Segoe UI",
      "Roboto",
      "Helvetica Neue",
      "sans-serif"
    ],
    "chat-arabic": [
      "Segoe UI",
      "Geeza Pro",
      "Noto Sans Arabic",
      "system-ui",
      "sans-serif"
    ],
    "ui-mono": [
      "IBM Plex Mono",
      "ui-monospace",
      "monospace"
    ],
    "email": [
      "Arial",
      "sans-serif"
    ],
    "email-mono": [
      "Courier New",
      "monospace"
    ]
  },
  "file": {
    "sans-400": "InstrumentSans-Regular.ttf",
    "sans-600": "InstrumentSans-SemiBold.ttf",
    "arabic-400": "IBMPlexSansArabic-Regular.ttf",
    "arabic-600": "IBMPlexSansArabic-SemiBold.ttf",
    "mono-400": "IBMPlexMono-Regular.ttf"
  },
  "weight": {
    "regular": 400,
    "body": 430,
    "medium": 500,
    "strong": 560,
    "semibold": 600,
    "heading": 620,
    "display": 640
  },
  "size": {
    "site": {
      "display": "clamp(2.75rem, 1.4rem + 5vw, 5.5rem)",
      "h2": "clamp(2rem, 1.3rem + 2.6vw, 3.25rem)",
      "h3": "1.375rem",
      "body": "1.0625rem",
      "base": "1rem",
      "small": ".9375rem",
      "note": ".875rem",
      "caption": ".8125rem",
      "label": ".75rem",
      "micro": ".6875rem"
    },
    "ui": {
      "micro": "11px",
      "caption": "12px",
      "small": "13px",
      "body-sm": "14px",
      "body": "15px",
      "input": "16px",
      "title-sm": "18px",
      "title": "20px",
      "heading": "24px",
      "heading-lg": "28px",
      "display-sm": "36px",
      "display": "56px"
    },
    "stage": {
      "hero": "clamp(3.25rem, 0.5rem + 6.6vw, 8rem)",
      "title": "clamp(2.25rem, 0.6rem + 3.6vw, 4.5rem)",
      "figure": "clamp(2.75rem, 0.5rem + 5vw, 6.5rem)",
      "lead": "clamp(1.125rem, 0.75rem + 0.9vw, 1.75rem)"
    },
    "card": {
      "min": "31px"
    }
  },
  "leading": {
    "display": 1,
    "heading": 1.04,
    "body": 1.55,
    "ui": 1.45,
    "arabic-display": 1.25,
    "arabic-heading": 1.3,
    "arabic-body": 1.7
  },
  "tracking": {
    "label": ".08em",
    "label-lg": ".09em",
    "heading": "-.03em"
  }
} as const;

export const space = {
  "1": ".25rem",
  "2": ".5rem",
  "3": "1rem",
  "4": "1.5rem",
  "5": "2.5rem",
  "6": "4rem",
  "7": "6.5rem"
} as const;

export const layout = {
  "gutter": "clamp(1.25rem, 4vw, 3rem)",
  "wide": "80rem",
  "header": "4.5rem",
  "col-gap": "1.5rem",
  "sec": "clamp(3.5rem, 7vw, 6rem)",
  "rule-gap": "clamp(2rem, 4vw, 3.5rem)"
} as const;

export const radius = {
  "control": "2px",
  "sm": "4px",
  "md": ".5rem",
  "lg": ".75rem",
  "phone": "1.75rem",
  "round": "50%"
} as const;

export const border = {
  "hairline": "1px",
  "strong": "2px",
  "dashed": "1px dashed"
} as const;

export const cut = {
  "notch": "12px",
  "notch-sm": "9px",
  "plate": "6rem",
  "plate-sm": "3rem",
  "fold-gap": "6px"
} as const;

export const shadow = {
  "menu-shadow": "0 24px 70px rgb(21 23 26 / .14)",
  "window-shadow": "0 34px 80px -44px rgb(0 0 0 / .55)",
  "lift": "0 1px 0 rgb(255 255 255 / .7) inset, 0 1px 2px rgb(21 23 26 / .05), 0 0 0 1px var(--hair)",
  "float": "0 18px 50px -14px rgb(21 23 26 / .32), 0 0 0 1px var(--hair-strong)"
} as const;

export const motion = {
  "duration": {
    "dur-1": "120ms",
    "dur-2": "240ms",
    "dur-3": "480ms",
    "dur-4": "720ms",
    "stagger": "60ms",
    "fast": "160ms",
    "medium": "280ms",
    "slow": "480ms"
  },
  "pace": {
    "pace": 1.3,
    "play-1": "93.6ms",
    "play-2": "187.2ms",
    "play-3": "374.4ms",
    "play-4": "561.6ms",
    "play-stagger": "46.8ms",
    "read-word": "339.3ms",
    "dwell-beat": "520ms",
    "dwell-min": "1200ms",
    "live-beat": "5200ms",
    "live-beat-phone": "6500ms"
  },
  "ease": {
    "ease": "cubic-bezier(0.16, 1, 0.3, 1)",
    "ease-fold": "cubic-bezier(0.7, 0, 0.2, 1)",
    "spring": "linear(0, .1 2.4%, .38 6.2%, .7 11%, .9 15.6%, 1.03 20.6%, 1.07 25%, 1.06 30%, 1.02 37.5%, .995 47%, .99 55%, 1 70%, 1)",
    "ease-product": "cubic-bezier(0.2, 0.8, 0.2, 1)",
    "spring-product": "cubic-bezier(0.34, 1.4, 0.64, 1)"
  },
  "travel": {
    "travel": "12px",
    "dir": 1
  }
} as const;

export const breakpoint = {
  "phone-sm": "22.5rem",
  "phone": "24rem",
  "phone-lg": "30rem",
  "tablet": "48rem",
  "contact-bar": "53rem",
  "laptop": "62rem",
  "laptop-lg": "68rem",
  "desktop": "75rem",
  "wide": "82rem"
} as const;

export const z = {
  "below": -1,
  "base": 1,
  "raised": 2,
  "product-bar": 15,
  "header": 20,
  "contact-bar": 30,
  "skip-link": 100
} as const;

export const focus = {
  "width": "2px",
  "offset": "2px",
  "offset-control": "3px",
  "on-band": "#b7f34a"
} as const;

/** Every token that changes in dark mode, with its dark value. */
export const dark = {
  "semantic": {
    "canvas": "#0e1012",
    "surface": "#15171a",
    "surface-subtle": "#1b1e22",
    "text": "#f3f5f0",
    "text-muted": "#a7adb5",
    "text-faint": "#6f767e",
    "text-inverse": "#15171a",
    "line": "#2a2e33",
    "line-strong": "#5f666d",
    "hair": "rgb(255 255 255 / .07)",
    "hair-strong": "rgb(255 255 255 / .13)",
    "focus": "#b7f34a",
    "volt-ink": "#b7f34a",
    "volt-wash": "rgb(183 243 74 / .12)",
    "ok": "#7fd09a",
    "ok-soft": "#173424",
    "warn": "#e5bb6c",
    "warn-soft": "#3a2c12",
    "bad": "#f09a86",
    "bad-soft": "#3d1f18"
  },
  "component": {
    "band": {
      "band": "#1d2024",
      "band-edge": "#32373c",
      "dark-canvas": "#15171a",
      "dark-surface": "#23272b"
    },
    "window": {
      "window": "#262a2f",
      "window-line": "rgb(255 255 255 / .09)",
      "mark-ring": "#b7f34a"
    },
    "theme-switch": {
      "night": 1,
      "when-light": "none",
      "when-dark": "inline"
    },
    "chat": {
      "head": "#202c33",
      "head-line": "#222e35",
      "paper": "#0b141a",
      "dot": "rgb(233 237 239 / .035)",
      "dot-2": "rgb(233 237 239 / .025)",
      "in": "#202c33",
      "out": "#005c4b",
      "ink": "#e9edef",
      "icon": "#aebac1",
      "soft": "#8696a0",
      "soft-out": "#b3cdc9",
      "chip": "#182229",
      "shadow": "rgb(0 0 0 / .25)",
      "rule": "#2c3a41",
      "link": "#53bdeb",
      "avatar": "#6a7175",
      "avatar-ink": "#ffffff",
      "field": "#1f2c34",
      "field-ink": "#8696a0",
      "green": "#21c063",
      "on-green": "#0b141a"
    },
    "drawing": {
      "bg": "#0a0b0d",
      "card": "#131518",
      "raise": "#1a1d21",
      "hair": "rgb(255 255 255 / .07)",
      "hair-2": "rgb(255 255 255 / .13)",
      "ink": "#f3f5f0",
      "ink-2": "#a7adb5",
      "ink-3": "#8a9199",
      "volt-ink": "#b7f34a",
      "wash": "rgb(183 243 74 / .12)",
      "chat": "#0f1113",
      "out": "#222a1c",
      "link": "#8cc2f2",
      "bezel": "#2a2e33",
      "lift": "0 1px 0 rgb(255 255 255 / .04) inset, 0 0 0 1px var(--hair)",
      "float": "0 24px 60px -18px rgb(0 0 0 / .8), 0 0 0 1px var(--hair-strong)",
      "grid": "rgb(167 173 181 / .07)"
    },
    "document": {
      "paper": "#d8dcd7",
      "ink": "#15171a",
      "ink-2": "#3a3f45",
      "rule": "#c4c9cf",
      "band": "#c9ccc6"
    },
    "agent": {
      "bar-mix": "78%",
      "ghost-mix": "14%"
    }
  },
  "shadow": {
    "menu-shadow": "0 24px 70px rgb(0 0 0 / .5)",
    "window-shadow": "0 24px 60px -30px #000",
    "lift": "0 1px 0 rgb(255 255 255 / .04) inset, 0 0 0 1px var(--hair)",
    "float": "0 24px 60px -18px rgb(0 0 0 / .8), 0 0 0 1px var(--hair-strong)"
  }
} as const;
