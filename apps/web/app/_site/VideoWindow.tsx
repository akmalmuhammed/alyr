import { copy, type Locale } from "./copy";
import { FunnelFigure } from "./FunnelFigure";
import { HOME_VIDEO } from "./site";
import "./videowindow.css";

// The window under the headline (D-157, the founder's brief of 8 Nov 2026: "a window like
// Notion's, where I'll play the home video"). One soft window with a title bar and a 16:9
// stage. When the film is switched on (`HOME_VIDEO`, site.ts) the stage plays it with the
// browser's own controls, its poster and captions, and never starts by itself. Until then the
// stage shows the drawn figure of one enquiry through the four stages (FunnelFigure), so the
// window is never empty and never a dead player. Every word comes from `copy.ts`.

export function VideoWindow({ locale }: { locale: Locale }) {
  const v = copy[locale].home.video;
  return (
    <figure className="vw" data-m>
      <div className="vw-bar" aria-hidden="true">
        <span className="vw-dots"><i /><i /><i /></span>
        <b>{v.title}</b>
      </div>
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
