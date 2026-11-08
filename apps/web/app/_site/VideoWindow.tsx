import { copy, type Locale } from "./copy";
import { FunnelFigure } from "./FunnelFigure";
import { HOME_VIDEO } from "./site";
import "./videowindow.css";

// The window under the headline (D-157, D-158; the founder's briefs of 8 Nov 2026: "a window like
// Notion's, where I'll play the home video", then "the exact dimension and size"). It has
// Notion's size and shape (videowindow.css) and no frame of its own. When the film is switched on
// (`HOME_VIDEO`, site.ts) it plays with the browser's own controls, its poster and captions, and
// never starts by itself. Until then the stage shows the drawn figure of one enquiry through the
// four stages (FunnelFigure), so the window is never empty and never a dead player. The film
// should be made at 1920 x 1200 (16:10) so it shows sharp at 960 x 600. Every word comes from
// `copy.ts`.

export function VideoWindow({ locale }: { locale: Locale }) {
  const v = copy[locale].home.video;
  return (
    <figure className="vw" data-m>
      <div className={`vw-stage${HOME_VIDEO ? " is-video" : ""}`}>
        {HOME_VIDEO ? (
          <video className="vw-video" controls playsInline preload="metadata" poster={HOME_VIDEO.poster} aria-label={v.label}>
            <source src={HOME_VIDEO.src} type="video/mp4" />
            <track kind="captions" src={HOME_VIDEO.captions} srcLang={locale} label={v.captions} />
          </video>
        ) : (
          <FunnelFigure locale={locale} />
        )}
      </div>
    </figure>
  );
}
