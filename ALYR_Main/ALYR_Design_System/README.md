# ALYR Design System

Version 1.0 · Carbon Volt + Monochrome · July 2026

This is the production source of truth for the ALYR identity, interface language, customer-facing assets, and design governance. It is built around the approved **F1 Command Fold** symbol and the approved custom **ALYR cut-Y wordmark**.

## Start here

1. Open `10_Showcase/index.html` for the visual, interactive system.
2. Read `01_Brand_Foundation/Brand_Strategy.md` before writing or designing.
3. Use only logo files from `02_Logo_System/01_Master_SVG`.
4. Use platform-ready files from the numbered export folders; never rebuild logos from screenshots.
5. Developers should start with `06_UI_UX_System/Design_Tokens/tokens.css` and `06_UI_UX_System/Developer_Handoff.md`.
6. Vendors should receive the relevant export folder plus `02_Logo_System/Logo_Usage_Rules.md`.

## System architecture

| Folder | Purpose | Primary users |
|---|---|---|
| `00_Governance` | Inventory, ownership, versioning, QA and release control | Brand owner, design lead |
| `00_Source_References` | Approved reference artwork and decision record | Brand owner, designers |
| `01_Brand_Foundation` | Strategy, positioning, voice, color, typography, imagery | Everyone |
| `02_Logo_System` | Locked SVG masters and PNG exports | Design, vendors, developers |
| `03_Icon_System` | Product UI and service icon family | Product, web, presentations |
| `04_App_and_Favicon` | App icons, adaptive assets, browser favicons | Developers |
| `05_Social_Media` | Profiles, banners, safe zones and publishing rules | Marketing |
| `06_UI_UX_System` | Tokens, components, patterns, accessibility and content | Product, engineering |
| `07_Website_Assets` | Graphic elements and backgrounds | Web, marketing |
| `08_Document_System` | Proposal, slide, letterhead and card templates | Sales, operations |
| `09_Content_and_Motion` | Voice, UX writing, motion and campaign rules | Product, marketing |
| `10_Showcase` | Working visual design-system website | Everyone |
| `11_Handoff` | Delivery checklist and vendor briefs | Operations, procurement |
| `_tools` | Repeatable build and QA scripts | Design engineering |

## Locked decisions

- **Logo:** F1 Command Fold plus custom ALYR wordmark.
- **Distinctive letter:** the sliced/cut Y must remain unchanged in all wordmark uses.
- **Primary palette:** Carbon Volt.
- **Foundation palette:** Monochrome.
- **Design direction:** precision industrial minimalism—human, operational, premium and progressive.
- **Default experience:** light-first for clarity; carbon surfaces for command, focus and premium moments.
- **Accent discipline:** Volt communicates action, progress, confirmed state and strategic emphasis. It is not decoration.

## Rebuild exports

Run from PowerShell:

```powershell
$base='C:\Users\akmal\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:NODE_PATH="$base;$base\.pnpm\node_modules"
& 'C:\Users\akmal\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\_tools\build-assets.mjs'
```

The build creates SVG masters, PNG sizes, ICO files, social assets, document previews and a checksum inventory.

## Approval model

- **Brand owner approval required:** changes to logo geometry, palette roles, typography, positioning or public-facing templates.
- **Design lead approval required:** new components, icons, patterns or campaign sub-systems.
- **Product team may extend:** layouts and patterns using existing tokens and accessibility rules.
- **Never edit:** exported PNGs. Edit the master SVG or token source and rebuild.

