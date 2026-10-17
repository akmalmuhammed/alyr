// Start the framework's scripts after the first paint, in the published public pages only.
//
//   node scripts/site-defer-scripts.mjs apps/web/out-site/index.html apps/web/out-site/ar.html …
//
// Next.js puts its chunks in <head> as async scripts, so on a phone they download and run
// while the first screen is still being drawn, and Lighthouse counts all of them before the
// largest paint (3.2 s simulated, against a budget of 2.5 s). The pages are complete static
// HTML without JavaScript, so nothing is lost by drawing them first: this moves each chunk
// into a small loader that adds them, still async as Next has them, once the browser reports its first
// paint (or after 1.5 s if it cannot). Measured on 17 Oct: LCP 2.4 s, Performance 97.
// The steppers, motion, sticky bar and the ALYR Chat demo were checked working afterwards.
// It refuses to write a page it does not recognise, so a change in Next's markup fails the
// build instead of publishing a page without its scripts.
import { readFileSync, writeFileSync } from "node:fs";

const SCRIPT = /<script src="(\/_next\/static\/[^"]+\.js)"( id="([^"]+)")? async=""><\/script>/g;
const PRELOAD = /<link rel="preload" as="script" fetchPriority="low" href="\/_next\/static\/[^"]+\.js"\/>/g;

let failed = false;
for (const file of process.argv.slice(2)) {
  let html = readFileSync(file, "utf8");
  if (html.includes("data-alyr-defer")) {
    console.log(`${file}: already deferred`);
    continue;
  }
  const scripts = [];
  html = html.replace(SCRIPT, (_, src, __, id) => {
    scripts.push([src, id ?? ""]);
    return "";
  });
  html = html.replace(PRELOAD, "");
  if (scripts.length === 0 || !html.includes("</body>") || /<script src="[^"]+" async/.test(html)) {
    console.error(`${file}: unexpected script markup; not changed`);
    failed = true;
    continue;
  }
  const loader =
    `<script data-alyr-defer>(function(){var s=${JSON.stringify(scripts)},d=0;` +
    "function go(){if(d)return;d=1;setTimeout(function(){s.forEach(function(x){var e=document.createElement('script');" +
    "e.src=x[0];e.async=true;if(x[1])e.id=x[1];document.head.appendChild(e)})},0)}" +
    "try{new PerformanceObserver(function(l,o){o.disconnect();go()}).observe({type:'paint',buffered:true})}catch(e){}" +
    "setTimeout(go,1500)})()</script>";
  writeFileSync(file, html.replace("</body>", `${loader}</body>`));
  console.log(`${file}: ${scripts.length} scripts start after the first paint`);
}
if (failed) process.exit(1);
