import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const C = {
  carbon: '#15171A',
  carbonDeep: '#0E1012',
  volt: '#B7F34A',
  voltHover: '#A5E238',
  voltPressed: '#8FC42D',
  mist: '#E9ECEF',
  concrete: '#A7ADB5',
  black: '#050505',
  white: '#FFFFFF',
  paper: '#F6F7F3',
  graphite: '#2A2E33',
};

const xml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const frame = (w, h, body, title = 'ALYR brand asset', extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title" shape-rendering="geometricPrecision" ${extra}>
  <title id="title">${xml(title)}</title>
  ${body}
</svg>`;

function symbolGroup({ x = 0, y = 0, scale = 1, primary = C.carbon, accent = C.volt, mono = false } = {}) {
  const signal = mono ? primary : accent;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <polygon fill="${primary}" points="50,0 180,0 130,62 0,62"/>
    <polygon fill="${primary}" points="0,72 126,72 39,160"/>
    <polygon fill="${signal}" points="134,72 190,72 142,160 46,160"/>
  </g>`;
}

function wordmarkGroup({ x = 0, y = 0, scale = 1, fill = C.carbon } = {}) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${fill}">
    <!-- Custom A: open, crossbar-free construction -->
    <polygon points="0,150 69,10 92,10 28,150"/>
    <polygon points="76,37 92,10 164,150 134,150"/>
    <!-- L -->
    <polygon points="190,10 216,10 216,124 326,124 326,150 190,150"/>
    <!-- Locked cut-Y: detached left arm + continuous slash -->
    <polygon points="348,10 379,10 433,80 414,107"/>
    <polygon points="478,10 511,10 421,150 389,150"/>
    <!-- Cut-R: floating crown, open left bowl, grounded leg -->
    <path d="M540 10H646C689 10 716 35 716 72C716 105 693 126 653 126H589V100H650C674 100 688 90 688 70C688 49 674 36 649 36H540Z"/>
    <rect x="540" y="100" width="29" height="50"/>
    <polygon points="638,100 673,100 720,150 683,150"/>
  </g>`;
}

function monogramGroup({ x = 0, y = 0, scale = 1, fill = C.carbon, accent = C.volt } = {}) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <g fill="${fill}">
      <polygon points="0,150 69,10 92,10 28,150"/>
      <polygon points="76,37 92,10 164,150 134,150"/>
      <polygon points="195,10 226,10 280,80 261,107"/>
    </g>
    <polygon fill="${accent}" points="325,10 358,10 268,150 236,150"/>
  </g>`;
}

function horizontalLogo({ primary = C.carbon, accent = C.volt, mono = false } = {}) {
  return frame(1120, 220,
    `${symbolGroup({ x: 20, y: 30, scale: 1, primary, accent, mono })}
     ${wordmarkGroup({ x: 300, y: 35, scale: 1, fill: primary })}`,
    'ALYR primary horizontal logo');
}

function verticalLogo({ primary = C.carbon, accent = C.volt, mono = false } = {}) {
  return frame(760, 520,
    `${symbolGroup({ x: 285, y: 35, scale: 1, primary, accent, mono })}
     ${wordmarkGroup({ x: 20, y: 315, scale: 1, fill: primary })}`,
    'ALYR secondary vertical logo');
}

function standaloneSymbol({ primary = C.carbon, accent = C.volt, mono = false, background = null } = {}) {
  return frame(240, 240,
    `${background ? `<rect width="240" height="240" rx="48" fill="${background}"/>` : ''}
     ${symbolGroup({ x: 25, y: 40, scale: 1, primary, accent, mono })}`,
    'ALYR Command Fold standalone symbol');
}

function wordmark({ fill = C.carbon } = {}) {
  return frame(760, 190, wordmarkGroup({ x: 20, y: 20, scale: 1, fill }), 'ALYR custom cut-Y wordmark');
}

function monogram({ fill = C.carbon, accent = C.volt, background = null } = {}) {
  return frame(440, 220,
    `${background ? `<rect width="440" height="220" rx="32" fill="${background}"/>` : ''}
     ${monogramGroup({ x: 40, y: 30, scale: 1, fill, accent })}`,
    'ALYR AY cut monogram');
}

async function ensureDir(rel) {
  await fs.mkdir(path.join(root, rel), { recursive: true });
}

async function writeText(rel, content) {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return target;
}

async function writeBuffer(rel, content) {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  return target;
}

async function renderSvg(svg, rel, width, height = null) {
  const image = sharp(Buffer.from(svg));
  const png = await image.resize({ width, ...(height ? { height, fit: 'contain' } : {}) }).png().toBuffer();
  await writeBuffer(rel, png);
  return png;
}

function makeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((item) => item.data)]);
}

const logoVariants = {
  'primary-horizontal-carbon-volt': horizontalLogo(),
  'primary-horizontal-monochrome-black': horizontalLogo({ primary: C.black, accent: C.black, mono: true }),
  'primary-horizontal-reversed': horizontalLogo({ primary: C.white, accent: C.volt }),
  'secondary-vertical-carbon-volt': verticalLogo(),
  'secondary-vertical-monochrome-black': verticalLogo({ primary: C.black, accent: C.black, mono: true }),
  'secondary-vertical-reversed': verticalLogo({ primary: C.white, accent: C.volt }),
  'standalone-symbol-carbon-volt': standaloneSymbol(),
  'standalone-symbol-monochrome-black': standaloneSymbol({ primary: C.black, accent: C.black, mono: true }),
  'standalone-symbol-reversed': standaloneSymbol({ primary: C.white, accent: C.volt }),
  'wordmark-carbon': wordmark(),
  'wordmark-monochrome-black': wordmark({ fill: C.black }),
  'wordmark-reversed-white': wordmark({ fill: C.white }),
  'monogram-ay-carbon-volt': monogram(),
  'monogram-ay-monochrome': monogram({ fill: C.black, accent: C.black }),
  'monogram-ay-reversed': monogram({ fill: C.white, accent: C.volt }),
};

const iconPaths = {
  'arrow-right': ['M5 12h14', 'm14 7 5 5-5 5'],
  'arrow-up-right': ['M7 17 17 7', 'M9 7h8v8'],
  'check': ['m5 12 4 4L19 6'],
  'close': ['M6 6l12 12', 'M18 6 6 18'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'search': ['m20 20-4.5-4.5', 'M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z'],
  'menu': ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  'dashboard': ['M4 4h6v6H4z', 'M14 4h6v10h-6z', 'M4 14h6v6H4z', 'M14 18h6v2h-6z'],
  'workflow': ['M5 5h5v5H5z', 'M14 14h5v5h-5z', 'M10 7.5h4a3 3 0 0 1 3 3V14', 'M7.5 10v4a3 3 0 0 0 3 3H14'],
  'document': ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6', 'M9 17h5'],
  'users': ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M3 21v-2a6 6 0 0 1 12 0v2', 'M16 4.5a3.5 3.5 0 0 1 0 6.5', 'M17 15a5 5 0 0 1 4 4.9V21'],
  'strategy': ['M12 3v18', 'M3 12h18', 'M6 6l12 12', 'M18 6 6 18', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'],
  'automation': ['M7 7h10v10H7z', 'M9 3v4', 'M15 3v4', 'M9 17v4', 'M15 17v4', 'M3 9h4', 'M17 9h4', 'M3 15h4', 'M17 15h4', 'M10 12h4'],
  'ai': ['M8 18h8', 'M9 21h6', 'M7 14a7 7 0 1 1 10 0c-1.4 1.2-2 2.2-2 4H9c0-1.8-.6-2.8-2-4Z', 'M12 2V0.8', 'M4.9 4.9 4 4', 'm19.1 4.9.9-.9'],
  'data': ['M4 19V9', 'M10 19V4', 'M16 19v-7', 'M22 19H2'],
  'cloud': ['M7 18h10a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.2 9 4.5 4.5 0 0 0 7 18Z'],
  'security': ['M12 3 4 6v5c0 5.2 3.4 8.4 8 10 4.6-1.6 8-4.8 8-10V6z', 'm8.5 12 2.2 2.2 4.8-5'],
  'growth': ['M4 18 10 12l4 4 6-8', 'M15 8h5v5'],
  'calendar': ['M5 4h14v16H5z', 'M8 2v4', 'M16 2v4', 'M5 9h14'],
  'clock': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  'notification': ['M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3z', 'M10 20h4'],
  'upload': ['M12 16V4', 'm7 9 5-5 5 5', 'M5 20h14'],
  'download': ['M12 4v12', 'm7 11 5 5 5-5', 'M5 20h14'],
  'settings': ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7L0 10.5v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7Z'],
  'filter': ['M4 5h16l-6 7v6l-4 2v-8z'],
};

function iconSvg(paths) {
  const body = paths.map((d) => `<path d="${d}"/>`).join('\n  ');
  return frame(24, 24, `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" stroke-linejoin="miter">${body}</g>`, 'ALYR interface icon');
}

function appIconSvg({ mono = false, reversed = false } = {}) {
  const bg = reversed ? C.paper : C.carbon;
  const primary = reversed ? C.carbon : C.white;
  const accent = mono ? primary : C.volt;
  return frame(512, 512,
    `<rect width="512" height="512" rx="104" fill="${bg}"/>
     ${symbolGroup({ x: 66, y: 96, scale: 2, primary, accent, mono })}`,
    'ALYR app icon');
}

function socialAvatarSvg(size = 1080) {
  const scale = size / 512;
  return frame(size, size,
    `<rect width="${size}" height="${size}" fill="${C.carbon}"/>
     <circle cx="${size * 0.84}" cy="${size * 0.16}" r="${size * 0.012}" fill="${C.volt}"/>
     ${symbolGroup({ x: 66, y: 96, scale: 2 * scale, primary: C.white, accent: C.volt })}`,
    'ALYR social profile avatar');
}

function linkedInBannerSvg() {
  return frame(1584, 396,
    `<rect width="1584" height="396" fill="${C.carbon}"/>
     <path d="M960 0 790 396M1130 0 960 396M1300 0 1130 396M1470 0 1300 396" stroke="${C.graphite}" stroke-width="2"/>
     <rect x="70" y="74" width="6" height="248" fill="${C.volt}"/>
     ${symbolGroup({ x: 120, y: 108, scale: 1.05, primary: C.white, accent: C.volt })}
     ${wordmarkGroup({ x: 370, y: 119, scale: 0.78, fill: C.white })}
     <text x="122" y="345" fill="${C.concrete}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="24" letter-spacing="5">TRANSFORM THE BUSINESS.</text>`,
    'ALYR LinkedIn company banner');
}

function socialCoverSvg(w, h, title) {
  const s = Math.min(w / 1600, h / 500);
  return frame(w, h,
    `<rect width="${w}" height="${h}" fill="${C.paper}"/>
     <path d="M${w * .64} 0 ${w * .48} ${h}M${w * .76} 0 ${w * .60} ${h}M${w * .88} 0 ${w * .72} ${h}" stroke="${C.mist}" stroke-width="2"/>
     ${symbolGroup({ x: 80 * s, y: 70 * s, scale: 0.75 * s, primary: C.carbon, accent: C.volt })}
     ${wordmarkGroup({ x: 300 * s, y: 85 * s, scale: 0.58 * s, fill: C.carbon })}
     <text x="${80 * s}" y="${h - 75 * s}" fill="${C.carbon}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="${40 * s}" font-weight="650" letter-spacing="${1.4 * s}">Strategy. Technology. Execution.</text>
     <rect x="${80 * s}" y="${h - 48 * s}" width="${210 * s}" height="${7 * s}" fill="${C.volt}"/>`,
    title);
}

function socialPostSvg(w, h, kind = 'point-of-view') {
  if (kind === 'point-of-view') {
    return frame(w, h, `<rect width="${w}" height="${h}" fill="${C.carbon}"/>
      ${symbolGroup({ x: 72, y: 72, scale: .55, primary: C.white, accent: C.volt })}
      <text x="72" y="${h * .47}" fill="${C.white}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="82" font-weight="650">Your workflow</text>
      <text x="72" y="${h * .57}" fill="${C.white}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="82" font-weight="650">is the product.</text>
      <rect x="72" y="${h * .64}" width="250" height="12" fill="${C.volt}"/>
      <text x="72" y="${h - 82}" fill="${C.concrete}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="22" letter-spacing="3">ALYR POINT OF VIEW / 01</text>`, 'ALYR square point-of-view post');
  }
  if (kind === 'operating-model') {
    return frame(w, h, `<rect width="${w}" height="${h}" fill="${C.paper}"/>
      ${symbolGroup({ x: 68, y: 65, scale: .45, primary: C.carbon, accent: C.volt })}
      <text x="68" y="270" fill="${C.carbon}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="58" font-weight="650">From manual follow-up</text>
      <text x="68" y="340" fill="${C.carbon}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="58" font-weight="650">to measurable delivery.</text>
      <g font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="24" fill="${C.carbon}">
        <rect x="70" y="500" width="250" height="100" rx="8" fill="${C.white}" stroke="${C.concrete}"/><text x="105" y="560">Lead captured</text>
        <path d="M320 550h115" stroke="${C.carbon}" stroke-width="3"/><circle cx="435" cy="550" r="8" fill="${C.volt}"/>
        <rect x="450" y="500" width="250" height="100" rx="8" fill="${C.white}" stroke="${C.concrete}"/><text x="485" y="560">Owner assigned</text>
        <path d="M700 550h115" stroke="${C.carbon}" stroke-width="3"/><circle cx="815" cy="550" r="8" fill="${C.volt}"/>
        <rect x="830" y="500" width="180" height="100" rx="8" fill="${C.carbon}"/><text x="875" y="560" fill="${C.white}">Tracked</text>
      </g>
      <text x="68" y="${h - 72}" fill="${C.graphite}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="21" letter-spacing="3">OPERATING MODEL / ALYR</text>`, 'ALYR operating-model post');
  }
  if (kind === 'proof') {
    return frame(w, h, `<rect width="${w}" height="${h}" fill="${C.paper}"/>
      <rect x="0" y="0" width="20" height="${h}" fill="${C.volt}"/>
      ${wordmarkGroup({ x: 72, y: 60, scale: .34, fill: C.carbon })}
      <text x="72" y="${h * .55}" fill="${C.carbon}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="190" font-weight="650">37%</text>
      <text x="72" y="${h * .68}" fill="${C.carbon}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="38" font-weight="600">faster quote turnaround</text>
      <text x="72" y="${h - 56}" fill="${C.graphite}" font-family="IBM Plex Mono, monospace" font-size="18">ILLUSTRATIVE PROOF FORMAT · REPLACE WITH APPROVED DATA</text>`, 'ALYR proof post template');
  }
  return frame(w, h, `<rect width="${w}" height="${h}" fill="${C.carbon}"/>
    <path d="M${w * .55} 0 ${w * .15} ${h}M${w * .8} 0 ${w * .4} ${h}" stroke="${C.graphite}" stroke-width="3"/>
    ${symbolGroup({ x: 72, y: 90, scale: .55, primary: C.white, accent: C.volt })}
    <text x="72" y="${h * .57}" fill="${C.white}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="80" font-weight="650">Make the work</text>
    <text x="72" y="${h * .63}" fill="${C.white}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="80" font-weight="650">visible.</text>
    <rect x="72" y="${h * .67}" width="240" height="12" fill="${C.volt}"/>
    <text x="72" y="${h - 130}" fill="${C.concrete}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="28">ALYR DIGITAL TRANSFORMATION</text>`, 'ALYR vertical story template');
}

function logoOverviewSvg() {
  return frame(2400, 1400, `<rect width="2400" height="1400" fill="${C.paper}"/>
    <text x="100" y="110" fill="${C.carbon}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="54" font-weight="650">ALYR / LOGO SYSTEM</text>
    <text x="100" y="160" fill="${C.graphite}" font-family="IBM Plex Mono, monospace" font-size="22" letter-spacing="3">F1 COMMAND FOLD + LOCKED CUT-Y WORDMARK</text>
    <rect x="100" y="220" width="2200" height="400" fill="${C.white}" stroke="${C.mist}"/>
    ${symbolGroup({ x: 180, y: 335, scale: 1.25, primary: C.carbon, accent: C.volt })}
    ${wordmarkGroup({ x: 600, y: 350, scale: 1.2, fill: C.carbon })}
    <rect x="100" y="660" width="1065" height="600" fill="${C.carbon}"/>
    ${symbolGroup({ x: 210, y: 835, scale: 1.05, primary: C.white, accent: C.volt })}
    ${wordmarkGroup({ x: 500, y: 850, scale: .78, fill: C.white })}
    <rect x="1205" y="660" width="1095" height="600" fill="${C.white}" stroke="${C.mist}"/>
    ${symbolGroup({ x: 1355, y: 820, scale: 1.8, primary: C.black, accent: C.black, mono: true })}
    ${monogramGroup({ x: 1825, y: 840, scale: .8, fill: C.carbon, accent: C.volt })}
    <text x="100" y="1340" fill="${C.graphite}" font-family="IBM Plex Mono, monospace" font-size="20">CARBON VOLT · MONOCHROME · REVERSED · SVG MASTER</text>`, 'ALYR logo system overview');
}

function paletteBoardSvg() {
  const swatches = [[C.carbon, 'CARBON', '#15171A', C.white], [C.volt, 'VOLT', '#B7F34A', C.carbon], [C.mist, 'MIST', '#E9ECEF', C.carbon], [C.concrete, 'CONCRETE', '#A7ADB5', C.carbon], [C.black, 'MONO BLACK', '#050505', C.white], [C.paper, 'PAPER', '#F6F7F3', C.carbon]];
  return frame(1800, 1100, `<rect width="1800" height="1100" fill="${C.white}"/>
    <text x="80" y="100" fill="${C.carbon}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="56" font-weight="650">ALYR / CARBON VOLT + MONOCHROME</text>
    ${swatches.map(([fill, name, hex, text], i) => {
      const x = 80 + (i % 3) * 555;
      const y = 170 + Math.floor(i / 3) * 420;
      return `<rect x="${x}" y="${y}" width="500" height="340" fill="${fill}" stroke="${C.mist}"/>
        <text x="${x + 30}" y="${y + 260}" fill="${text}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="32" font-weight="650">${name}</text>
        <text x="${x + 30}" y="${y + 305}" fill="${text}" opacity=".72" font-family="IBM Plex Mono, monospace" font-size="22">${hex}</text>`;
    }).join('')}
    <text x="80" y="1050" fill="${C.graphite}" font-family="IBM Plex Mono, monospace" font-size="20">VOLT = ACTION · PROGRESS · CONFIRMATION · STRATEGIC SIGNAL</text>`, 'ALYR color palette board');
}

function openGraphSvg() {
  return frame(1200, 630, `<rect width="1200" height="630" fill="${C.carbon}"/>
    <path d="M850 0 580 630M1070 0 800 630M1250 100 1020 630" stroke="${C.graphite}" stroke-width="2"/>
    ${symbolGroup({ x: 70, y: 70, scale: .5, primary: C.white, accent: C.volt })}
    ${wordmarkGroup({ x: 240, y: 78, scale: .39, fill: C.white })}
    <text x="70" y="380" fill="${C.white}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="68" font-weight="650">Transform the business.</text>
    <text x="70" y="455" fill="${C.concrete}" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="32">Not just the interface.</text>
    <rect x="70" y="510" width="220" height="10" fill="${C.volt}"/>`, 'ALYR website open graph image');
}

function graphicSvg(kind) {
  if (kind === 'command-grid') {
    return frame(1600, 900, `<rect width="1600" height="900" fill="${C.paper}"/>
      <g stroke="${C.concrete}" stroke-opacity=".26" fill="none">
        ${Array.from({ length: 19 }, (_, i) => `<path d="M${80 + i * 80} 0V900"/>`).join('')}
        ${Array.from({ length: 11 }, (_, i) => `<path d="M0 ${50 + i * 80}H1600"/>`).join('')}
      </g>
      <g fill="${C.volt}"><circle cx="1200" cy="290" r="7"/><circle cx="960" cy="610" r="7"/><circle cx="320" cy="210" r="7"/></g>`,'ALYR command grid');
  }
  if (kind === 'fold-path') {
    return frame(1600, 500, `<rect width="1600" height="500" fill="none"/><path d="M40 410 430 90h420L520 410h520l360-320h160" fill="none" stroke="${C.carbon}" stroke-width="8"/><path d="M1040 410 1400 90h160" fill="none" stroke="${C.volt}" stroke-width="8"/>`,'ALYR fold path');
  }
  if (kind === 'signal-rail') {
    return frame(1600, 240, `<rect width="1600" height="240" fill="${C.carbon}"/><path d="M80 120h500l90-72h260l90 144h500" fill="none" stroke="${C.graphite}" stroke-width="4"/><path d="M80 120h500l90-72" fill="none" stroke="${C.volt}" stroke-width="4"/><circle cx="80" cy="120" r="10" fill="${C.volt}"/><circle cx="670" cy="48" r="10" fill="${C.volt}"/>`,'ALYR signal rail');
  }
  if (kind === 'dot-field') {
    return frame(1200, 700, `<defs><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="${C.concrete}"/></pattern></defs><rect width="1200" height="700" fill="url(#p)"/><path d="M0 610C300 460 440 650 720 380s320-180 480-310" fill="none" stroke="${C.volt}" stroke-width="5"/>`,'ALYR dot field');
  }
  return frame(1600, 120, `<path d="M0 60h680l60-48h120l60 96h680" fill="none" stroke="${C.carbon}" stroke-width="3"/><path d="M920 108h680" stroke="${C.volt}" stroke-width="3"/>`,'ALYR section divider');
}

function documentCoverSvg() {
  return frame(1240, 1754,
    `<rect width="1240" height="1754" fill="${C.paper}"/>
     <rect x="0" width="34" height="1754" fill="${C.volt}"/>
     <path d="M820 0 320 1754M1040 0 540 1754M1240 80 760 1754" stroke="${C.mist}" stroke-width="3"/>
     ${symbolGroup({ x: 96, y: 100, scale: .75, primary: C.carbon, accent: C.volt })}
     ${wordmarkGroup({ x: 300, y: 108, scale: .52, fill: C.carbon })}
     <text x="96" y="710" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="88" font-weight="650" fill="${C.carbon}">Transformation</text>
     <text x="96" y="810" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="88" font-weight="650" fill="${C.carbon}">Blueprint</text>
     <text x="100" y="890" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="28" letter-spacing="4" fill="${C.graphite}">STRATEGY · SYSTEMS · EXECUTION</text>
     <rect x="96" y="1460" width="210" height="10" fill="${C.volt}"/>
     <text x="96" y="1520" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="25" fill="${C.graphite}">Prepared for Client Name</text>
     <text x="96" y="1570" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="25" fill="${C.graphite}">Version 1.0 · Confidential</text>`,
    'ALYR proposal cover template');
}

function slideCoverSvg() {
  return frame(1920, 1080,
    `<rect width="1920" height="1080" fill="${C.carbon}"/>
     <path d="M1290 0 980 1080M1540 0 1230 1080M1790 0 1480 1080" stroke="${C.graphite}" stroke-width="3"/>
     ${symbolGroup({ x: 110, y: 90, scale: .72, primary: C.white, accent: C.volt })}
     ${wordmarkGroup({ x: 330, y: 104, scale: .5, fill: C.white })}
     <text x="110" y="600" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="108" font-weight="650" fill="${C.white}">Transform the business.</text>
     <text x="114" y="680" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="34" letter-spacing="4" fill="${C.concrete}">NOT JUST THE INTERFACE.</text>
     <rect x="110" y="752" width="270" height="12" fill="${C.volt}"/>
     <text x="110" y="940" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="26" fill="${C.concrete}">Executive presentation · Client name · 2026</text>`,
    'ALYR presentation cover template');
}

function letterheadSvg() {
  return frame(1240, 1754,
    `<rect width="1240" height="1754" fill="${C.white}"/>
     ${symbolGroup({ x: 72, y: 70, scale: .45, primary: C.carbon, accent: C.volt })}
     ${wordmarkGroup({ x: 205, y: 79, scale: .32, fill: C.carbon })}
     <line x1="72" y1="210" x2="1168" y2="210" stroke="${C.mist}" stroke-width="2"/>
     <rect x="72" y="210" width="180" height="5" fill="${C.volt}"/>
     <line x1="72" y1="1600" x2="1168" y2="1600" stroke="${C.mist}" stroke-width="2"/>
     <text x="72" y="1650" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="21" fill="${C.graphite}">ALYR Digital Transformation · Doha, Qatar</text>
     <text x="72" y="1690" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="21" fill="${C.graphite}">hello@alyr.com · alyr.com</text>
     <text x="1168" y="1690" text-anchor="end" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="21" fill="${C.graphite}">CONFIDENTIAL</text>`,
    'ALYR A4 letterhead template');
}

function businessCardSvg(side = 'front') {
  if (side === 'front') {
    return frame(1050, 600, `<rect width="1050" height="600" fill="${C.carbon}"/>
      ${symbolGroup({ x: 90, y: 145, scale: 1.05, primary: C.white, accent: C.volt })}
      ${wordmarkGroup({ x: 355, y: 162, scale: .68, fill: C.white })}
      <rect x="90" y="480" width="180" height="9" fill="${C.volt}"/>`, 'ALYR business card front');
  }
  return frame(1050, 600, `<rect width="1050" height="600" fill="${C.paper}"/>
    <rect width="18" height="600" fill="${C.volt}"/>
    <text x="80" y="125" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="44" font-weight="650" fill="${C.carbon}">Name Surname</text>
    <text x="82" y="176" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="22" letter-spacing="3" fill="${C.graphite}">ROLE / DISCIPLINE</text>
    <text x="82" y="360" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="24" fill="${C.carbon}">+974 0000 0000</text>
    <text x="82" y="407" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="24" fill="${C.carbon}">name@alyr.com</text>
    <text x="82" y="454" font-family="Instrument Sans, Bahnschrift, sans-serif" font-size="24" fill="${C.carbon}">alyr.com</text>
    ${symbolGroup({ x: 800, y: 360, scale: .72, primary: C.carbon, accent: C.volt })}`,'ALYR business card back');
}

async function build() {
  const svgMaster = '02_Logo_System/01_Master_SVG';
  const pngExport = '02_Logo_System/02_PNG_Exports';
  await ensureDir(svgMaster);
  await ensureDir(pngExport);

  for (const [name, svg] of Object.entries(logoVariants)) {
    await writeText(`${svgMaster}/${name}.svg`, svg);
    const widths = name.includes('horizontal') ? [480, 960, 1920] : name.includes('wordmark') ? [360, 720, 1440] : [256, 512, 1024];
    for (const width of widths) {
      await renderSvg(svg, `${pngExport}/${name}-${width}w.png`, width);
    }
  }

  for (const [name, paths] of Object.entries(iconPaths)) {
    await writeText(`03_Icon_System/UI_Icons_SVG/${name}.svg`, iconSvg(paths));
  }

  const appColor = appIconSvg();
  const appMono = appIconSvg({ mono: true });
  const appLight = appIconSvg({ reversed: true });
  await writeText('04_App_and_Favicon/01_App_Icon/app-icon-master.svg', appColor);
  await writeText('04_App_and_Favicon/01_App_Icon/app-icon-monochrome.svg', appMono);
  await writeText('04_App_and_Favicon/01_App_Icon/app-icon-light.svg', appLight);
  for (const size of [1024, 512, 256, 192, 180, 128, 64]) {
    await renderSvg(appColor, `04_App_and_Favicon/01_App_Icon/PNG/app-icon-${size}.png`, size, size);
  }

  const favSizes = [16, 32, 48, 180, 192, 256, 512];
  const faviconPngs = [];
  for (const size of favSizes) {
    const data = await renderSvg(appColor, `04_App_and_Favicon/02_Favicon/favicon-${size}x${size}.png`, size, size);
    if ([16, 32, 48, 256].includes(size)) faviconPngs.push({ size, data });
  }
  await writeBuffer('04_App_and_Favicon/02_Favicon/favicon.ico', makeIco(faviconPngs));
  await writeText('04_App_and_Favicon/02_Favicon/favicon.svg', appColor);
  await writeText('04_App_and_Favicon/02_Favicon/site.webmanifest', JSON.stringify({
    name: 'ALYR Digital Transformation',
    short_name: 'ALYR',
    start_url: '/',
    display: 'standalone',
    background_color: C.carbon,
    theme_color: C.carbon,
    icons: [
      { src: 'favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'favicon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2));

  const avatar = socialAvatarSvg();
  await writeText('05_Social_Media/01_Profile_Pictures/social-profile-master.svg', avatar);
  for (const [name, size] of [['linkedin-profile', 800], ['instagram-profile', 1080], ['x-profile', 800], ['youtube-profile', 800], ['whatsapp-business-profile', 640]]) {
    await renderSvg(avatar, `05_Social_Media/01_Profile_Pictures/${name}-${size}x${size}.png`, size, size);
  }
  const liBanner = linkedInBannerSvg();
  await writeText('05_Social_Media/02_Covers/linkedin-company-banner.svg', liBanner);
  await renderSvg(liBanner, '05_Social_Media/02_Covers/linkedin-company-banner-1584x396.png', 1584, 396);
  const xCover = socialCoverSvg(1500, 500, 'ALYR X profile header');
  await writeText('05_Social_Media/02_Covers/x-header.svg', xCover);
  await renderSvg(xCover, '05_Social_Media/02_Covers/x-header-1500x500.png', 1500, 500);
  const youtubeCover = socialCoverSvg(2560, 1440, 'ALYR YouTube channel art');
  await writeText('05_Social_Media/02_Covers/youtube-channel-art.svg', youtubeCover);
  await renderSvg(youtubeCover, '05_Social_Media/02_Covers/youtube-channel-art-2560x1440.png', 2560, 1440);

  const postTemplates = {
    'point-of-view-square': socialPostSvg(1080, 1080, 'point-of-view'),
    'operating-model-portrait': socialPostSvg(1080, 1350, 'operating-model'),
    'proof-landscape': socialPostSvg(1200, 627, 'proof'),
    'story-cover': socialPostSvg(1080, 1920, 'story'),
  };
  for (const [name, svg] of Object.entries(postTemplates)) {
    await writeText(`05_Social_Media/03_Post_Templates/${name}.svg`, svg);
    const dimensions = name.includes('square') ? [1080, 1080] : name.includes('portrait') ? [1080, 1350] : name.includes('landscape') ? [1200, 627] : [1080, 1920];
    await renderSvg(svg, `05_Social_Media/03_Post_Templates/${name}.png`, dimensions[0], dimensions[1]);
  }

  const logoBoard = logoOverviewSvg();
  await writeText('02_Logo_System/03_Overview_Boards/alyr-logo-system-overview.svg', logoBoard);
  await renderSvg(logoBoard, '02_Logo_System/03_Overview_Boards/alyr-logo-system-overview-2400x1400.png', 2400, 1400);
  const paletteBoard = paletteBoardSvg();
  await writeText('01_Brand_Foundation/Color/alyr-carbon-volt-monochrome-palette.svg', paletteBoard);
  await renderSvg(paletteBoard, '01_Brand_Foundation/Color/alyr-carbon-volt-monochrome-palette-1800x1100.png', 1800, 1100);

  for (const kind of ['command-grid', 'fold-path', 'signal-rail', 'dot-field', 'section-divider']) {
    const asset = graphicSvg(kind);
    await writeText(`07_Website_Assets/Graphic_Elements/${kind}.svg`, asset);
  }
  await renderSvg(graphicSvg('command-grid'), '07_Website_Assets/Raster_Backgrounds/command-grid-1600x900.png', 1600, 900);
  await renderSvg(graphicSvg('signal-rail'), '07_Website_Assets/Raster_Backgrounds/signal-rail-1600x240.png', 1600, 240);
  const og = openGraphSvg();
  await writeText('07_Website_Assets/Social_Preview/og-image.svg', og);
  await renderSvg(og, '07_Website_Assets/Social_Preview/og-image-1200x630.png', 1200, 630);

  const docs = {
    'proposal-cover': documentCoverSvg(),
    'presentation-cover': slideCoverSvg(),
    'letterhead-a4': letterheadSvg(),
    'business-card-front': businessCardSvg('front'),
    'business-card-back': businessCardSvg('back'),
  };
  for (const [name, svg] of Object.entries(docs)) {
    await writeText(`08_Document_System/Editable_SVG/${name}.svg`, svg);
    const size = name.includes('presentation') ? [1920, 1080] : name.includes('business') ? [1050, 600] : [1240, 1754];
    await renderSvg(svg, `08_Document_System/Preview_PNG/${name}.png`, size[0], size[1]);
  }

  await writeText('04_App_and_Favicon/03_Android_Adaptive/foreground.svg', frame(108, 108,
    symbolGroup({ x: 20, y: 24, scale: .36, primary: C.white, accent: C.volt }),
    'ALYR Android adaptive foreground'));
  await writeText('04_App_and_Favicon/03_Android_Adaptive/background.svg', frame(108, 108,
    `<rect width="108" height="108" fill="${C.carbon}"/>`,
    'ALYR Android adaptive background'));

  const inventory = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const data = await fs.readFile(full);
        inventory.push({
          path: path.relative(root, full).replaceAll('\\', '/'),
          bytes: data.length,
          sha256: crypto.createHash('sha256').update(data).digest('hex'),
        });
      }
    }
  }
  await walk(root);
  inventory.sort((a, b) => a.path.localeCompare(b.path));
  await writeText('00_Governance/Asset_Inventory.json', JSON.stringify({ generated_at: new Date().toISOString(), asset_count: inventory.length, files: inventory }, null, 2));
  const csv = ['Path,Bytes,SHA256', ...inventory.map((row) => `"${row.path}",${row.bytes},${row.sha256}`)].join('\n');
  await writeText('00_Governance/Asset_Inventory.csv', csv);

  console.log(`Built ${inventory.length} ALYR design-system source and export files.`);
}

await build();
