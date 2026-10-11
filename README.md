# ALYR Workspace

## ALYR brand and delivery systems

The ALYR brand source of truth is organized in:

- [`ALYR_Brand_HQ/`](ALYR_Brand_HQ/) — why/what/how, strategic operating model, transformation pipeline, UX principles, governance, font policy and handoff maps.
- [`ALYR_Design_System/`](ALYR_Design_System/) — approved Carbon Volt + Monochrome identity, F1 Command Fold logo system, cut-Y wordmark, icons, tokens, UI/UX rules, website assets, social assets, document templates, motion/content rules and interactive showcase.

Start with [`ALYR_Brand_HQ/README.md`](ALYR_Brand_HQ/README.md), then open [`ALYR_Design_System/10_Showcase/index.html`](ALYR_Design_System/10_Showcase/index.html).

# Heldat

Heldat is a local-first asset passport for physical, digital, collectible, and
property assets. This repository contains the canonical web app, the Expo native
app, shared contracts, the public site, and Supabase migrations/functions.

## Repository map

| Path | Purpose |
| --- | --- |
| `asset-continuity-native/` | Canonical Expo/React Native iOS and Android app |
| `asset-continuity-web/` | Canonical browser product reference |
| `asset-continuity-mobile/` | Vite visual prototype; reference only |
| `asset-continuity-ios-preview/` | Expo Go-compatible iPhone preview |
| `heldat-site/` | Public Heldat website |
| `packages/` | Shared domain, contracts, tokens, analytics, and fixtures |
| `supabase/` | Database migrations, Edge Functions, tests, and operations |

## Clone on another computer

Install Git and **Node.js 22.22.0**. The matching npm version is **10.9.4**;
these are the same versions used by CI. On macOS/Linux with `nvm`:

```bash
git clone https://github.com/akmalmuhammed/heldat.git heldat
cd heldat
nvm install
nvm use
npm --version
npm ci
```

On Windows with nvm-windows:

```powershell
git clone https://github.com/akmalmuhammed/heldat.git heldat
Set-Location heldat
nvm install 22.22.0
nvm use 22.22.0
npm --version
npm ci
```

`npm --version` should print `10.9.4`. Run `git switch <branch>` before
`npm ci` when continuing work from a branch other than the repository default.
Use a normal development folder such as `C:\dev\heldat`; do not synchronize a
live checkout or its `.git` directory through OneDrive between computers.

## Local environment

The signed-out sample journey works without cloud credentials. To test account
and sync flows, create the ignored local environment file from the committed
template:

```bash
cp asset-continuity-native/.env.example asset-continuity-native/.env.local
```

PowerShell equivalent:

```powershell
Copy-Item asset-continuity-native/.env.example asset-continuity-native/.env.local
```

Set only the public Supabase URL and publishable key described by the template.
Never commit `.env.local`, service-role keys, signing credentials, database
passwords, device vaults, Recovery Kits, or production exports.

## Run the apps

```bash
# Expo development-client app (iOS/Android)
npm run dev:native

# Canonical web app
npm run dev:web

# Reference-only Vite mobile prototype
npm run dev:mobile-prototype

# Expo Go-compatible iPhone preview
npm run dev:ios-preview
```

The canonical native app uses native modules and therefore needs an installed
Expo development build; Expo Go is intended only for the separate iOS preview.
Keep the phone and computer on the same trusted network when using LAN mode.
Android native builds can run from Windows. iOS native builds require macOS/Xcode
or EAS Build.

## Validate before pushing

```bash
# Fast shared-contract gate
npm run check:shared

# Full native static/test gate
npm run check:native

# Entire repository gate (the longest option)
npm test
```

CI additionally starts a disposable local Supabase stack to lint and test the
database, so the equivalent full CI run requires Docker. Production migrations,
Edge Function deployment, EAS builds, and store submissions are separate
operator actions; cloning the repository does not perform them.

## What GitHub does and does not contain

The private repository is the source-of-truth for code and reviewed migrations.
Supabase stores live account data and uploaded evidence, Expo/EAS creates mobile
builds, and Cloudflare serves `heldat.app`. Local APKs, screenshots, encrypted
backup keys, restore evidence, and generated validation output stay outside Git.
