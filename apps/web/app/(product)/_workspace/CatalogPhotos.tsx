"use client";

// An item's photos in the edit sheet: up to eight, the first is the cover. Choose or take
// photos (they are shrunk here and sent with progress, each with its own retry), then choose
// a photo to make it the cover, move it earlier or later, or take it off. Every move is saved
// as it is made; on a new item, which has no ID yet, the photos wait until it is saved.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, MAX_PHOTOS, sayError, type Photo } from "./catalogApi";
import type { Copy, Lang } from "./catalogCopy";
import { Icon, Tile, type Toast } from "./CatalogUi";
import { usePhotoQueue } from "./usePhotoQueue";

type Push = (text: string, options?: { tone?: Toast["tone"] }) => number;
type Answer = { photos: Photo[]; cover: Photo };

export function CatalogPhotos({ lang, t, itemId, photos, onPhotos, readOnly, push }: {
  lang: Lang; t: Copy; itemId: string | null; photos: Photo[]; onPhotos: (photos: Photo[]) => void;
  readOnly: boolean; push: Push;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef(photos);
  useEffect(() => { listRef.current = photos; });
  // How many of the queue's photos are on their way (they count against the eight).
  const queueSize = useRef(0);
  const choose = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const queue = usePhotoQueue({
    lang, t,
    room: () => MAX_PHOTOS - listRef.current.length - queueSize.current,
    after: async (photo) => {
      if (!photo.id) return;
      if (itemId) {
        const answer = await api<Answer>(`/api/items/${itemId}/photos`, "POST", { asset_id: photo.id });
        onPhotos(answer.photos);
      } else if (!listRef.current.some((p) => p.id === photo.id)) {
        onPhotos([...listRef.current, photo]);
      }
      return t.uploaded;
    },
  });
  useEffect(() => {
    queueSize.current = queue.uploads.filter((u) => u.status !== "done").length;
  }, [queue.uploads]);

  // A finished tile is replaced by the real photo; drop it from the queue.
  const { clearDone, uploads } = queue;
  useEffect(() => {
    if (uploads.some((u) => u.status === "done")) {
      const wait = setTimeout(clearDone, 600);
      return () => clearTimeout(wait);
    }
  }, [uploads, clearDone]);

  // Photos still being written to the photo store appear when they are done.
  useEffect(() => {
    if (!itemId || !photos.some((p) => p.state === "pending")) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      if (tries > 40) { clearInterval(timer); return; }
      try {
        const answer = await api<Answer>(`/api/items/${itemId}/photos`);
        onPhotos(answer.photos);
      } catch {
        // the next try
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [itemId, photos, onPhotos]);

  const apply = useCallback(async (call: () => Promise<Answer | null>, local: () => Photo[]) => {
    setBusy(true);
    try {
      if (itemId) {
        const answer = await call();
        if (answer) onPhotos(answer.photos);
      } else {
        onPhotos(local());
      }
    } catch (error) {
      push(sayError(error, lang, t), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }, [itemId, onPhotos, push, lang, t]);

  function move(from: number, to: number) {
    if (to < 0 || to >= photos.length) return;
    const next = [...photos];
    const [one] = next.splice(from, 1);
    next.splice(to, 0, one);
    setChosen(to);
    void apply(
      () => api<Answer>(`/api/items/${itemId}/photos`, "PUT", { order: next.map((p) => p.id) }),
      () => next,
    );
  }

  function makeCover(index: number) {
    const photo = photos[index];
    if (index === 0) return;
    const next = [photo, ...photos.filter((_, i) => i !== index)];
    setChosen(0);
    void apply(() => api<Answer>(`/api/items/${itemId}/photos/${photo.id}/cover`, "POST"), () => next);
  }

  function remove(index: number) {
    const photo = photos[index];
    setChosen(null);
    void apply(() => api<Answer>(`/api/items/${itemId}/photos/${photo.id}`, "DELETE"), () => photos.filter((_, i) => i !== index));
  }

  const waiting = queue.uploads.filter((u) => u.status !== "done");
  const total = photos.length + waiting.length;
  const full = total >= MAX_PHOTOS;
  const labels = { pending: t.photoSaving, failed: t.photoFailed, missing: t.addPhoto };
  const picked = chosen !== null ? photos[chosen] : null;

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const result = queue.add(files);
    if (result.left > 0) push(t.photoFull, { tone: "bad" });
  }

  return (
    <div className="ct-photos-box">
      <div className="ct-photos-top">
        <span className="ct-quiet num">{t.photosOf(total, MAX_PHOTOS)}</span>
      </div>
      <ul className="ct-photos">
        {photos.map((photo, index) => (
          <li key={photo.id ?? index}>
            <button type="button" className={`ct-ptile ${chosen === index ? "on" : ""}`} aria-pressed={chosen === index}
              disabled={readOnly} onClick={() => setChosen(chosen === index ? null : index)}>
              <Tile photo={photo} sizes="(max-width: 56rem) 30vw, 140px" labels={labels} />
              {index === 0 && <span className="ct-badge"><Icon name="star" className="sh-ico" />{t.cover}</span>}
              <span className="ct-sr">{t.photoN(index + 1)}</span>
              {photo.state === "pending" && <span className="ct-note">{t.photoSaving}</span>}
              {photo.state === "failed" && <span className="ct-note bad">{t.photoFailed}</span>}
            </button>
          </li>
        ))}
        {waiting.map((u) => (
          <li key={u.key}>
            <div className={`ct-ptile up ${u.status}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a preview of the file just chosen */}
              <img src={u.preview} alt="" />
              {u.status !== "failed" && (
                <span className="ct-up-state" role="status">
                  <span className="ct-bar-track"><span style={{ width: `${u.status === "uploading" ? u.progress : u.status === "saving" ? 100 : 6}%` }} /></span>
                  <span>{u.status === "uploading" ? t.uploading(u.progress) : u.status === "saving" ? t.photoSaving : t.getting}</span>
                </span>
              )}
              {u.status === "failed" && (
                <span className="ct-up-fail" role="alert">
                  <span>{u.error}</span>
                  <span className="ct-up-btns">
                    <button type="button" className="btn small" onClick={() => queue.retry(u.key)}><Icon name="retry" />{t.retryPhoto}</button>
                    <button type="button" className="btn small ghost" onClick={() => queue.drop(u.key)}>{t.skipPhoto}</button>
                  </span>
                </span>
              )}
            </div>
          </li>
        ))}
        {!readOnly && !full && (
          <li>
            <button type="button" className="ct-ptile add" onClick={() => choose.current?.click()}>
              <Icon name="plus" className="sh-ico" />
              <span>{t.addMorePhotos}</span>
            </button>
          </li>
        )}
      </ul>

      {!readOnly && (
        <div className="ct-photo-actions">
          <button type="button" className="btn ct-btn" disabled={full} onClick={() => camera.current?.click()}><Icon name="camera" />{t.takePhoto}</button>
          <button type="button" className="btn ct-btn" disabled={full} onClick={() => choose.current?.click()}><Icon name="image" />{t.choosePhotos}</button>
        </div>
      )}
      {full && !readOnly && <p className="ct-hint">{t.photoFull}</p>}

      {picked && !readOnly && (
        <div className="ct-selbar" role="group" aria-label={t.photoN((chosen ?? 0) + 1)}>
          <button type="button" className="btn ct-btn" disabled={busy || chosen === 0} onClick={() => makeCover(chosen!)}><Icon name="star" />{t.makeCover}</button>
          <button type="button" className="btn ct-btn" disabled={busy || chosen === 0} onClick={() => move(chosen!, chosen! - 1)}><Icon name="start" className="sh-ico ct-flip" />{t.earlier}</button>
          <button type="button" className="btn ct-btn" disabled={busy || chosen === photos.length - 1} onClick={() => move(chosen!, chosen! + 1)}><Icon name="end" className="sh-ico ct-flip" />{t.later}</button>
          <button type="button" className="btn ct-btn danger" disabled={busy} onClick={() => remove(chosen!)}><Icon name="trash" />{t.removePhoto}</button>
        </div>
      )}

      <input ref={choose} className="ct-file" type="file" accept="image/*" multiple tabIndex={-1} aria-hidden="true"
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input ref={camera} className="ct-file" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
