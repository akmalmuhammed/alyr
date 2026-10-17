"use client";

// Photos going up, one tile each: shrunk in the browser, sent with progress, and retried one
// by one when the connection drops. Nothing is half-saved: a photo is either stored (the API
// answered) or it is a failed tile with a button to try it again, and the rest carry on.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, PhotoProblem, sayError, sendPhoto, shrink, type Photo } from "./catalogApi";
import type { Copy, Lang } from "./catalogCopy";

export type Upload = {
  key: string;
  name: string;
  preview: string;
  status: "queued" | "shrinking" | "uploading" | "saving" | "done" | "failed";
  progress: number;
  error: string;
  photo: Photo | null;
  duplicate: boolean;
  note: string;
};

const AT_ONCE = 2;

type Options = {
  lang: Lang;
  t: Copy;
  /** Called once a photo is stored. Returns a short note for the tile, or throws to fail it. */
  after: (photo: Photo, duplicate: boolean) => Promise<string | void>;
  /** The most photos this queue may take; the rest are left out. */
  room?: () => number;
};

export function usePhotoQueue({ lang, t, after, room }: Options) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const blobs = useRef(new Map<string, Blob>());
  const files = useRef(new Map<string, File>());
  const running = useRef(new Set<string>());
  const afterRef = useRef(after);
  const langRef = useRef({ lang, t });
  useEffect(() => { afterRef.current = after; langRef.current = { lang, t }; });

  const patch = useCallback((key: string, change: Partial<Upload>) => {
    setUploads((all) => all.map((u) => (u.key === key ? { ...u, ...change } : u)));
  }, []);

  const run = useCallback(async (upload: Upload) => {
    const { key } = upload;
    running.current.add(key);
    const { lang: language, t: copy } = langRef.current;
    try {
      let photo = upload.photo;
      let duplicate = upload.duplicate;
      if (!photo) {
        let blob = blobs.current.get(key);
        if (!blob) {
          patch(key, { status: "shrinking", error: "", progress: 0 });
          const file = files.current.get(key);
          if (!file) throw new PhotoProblem("unreadable");
          blob = await shrink(file);
          blobs.current.set(key, blob);
        }
        patch(key, { status: "uploading", error: "", progress: 0 });
        const sent = await sendPhoto(blob, (p) => patch(key, { progress: p }));
        photo = sent.photo;
        duplicate = sent.duplicate;
        patch(key, { photo, duplicate, progress: 100 });
      }
      patch(key, { status: "saving" });
      const note = (await afterRef.current(photo, duplicate)) ?? "";
      blobs.current.delete(key);
      patch(key, { status: "done", note, error: "" });
    } catch (error) {
      let message: string;
      if (error instanceof PhotoProblem) message = error.kind === "too_big" ? copy.tooBig : copy.unreadable;
      else if (error instanceof ApiError && error.code === "offline") message = copy.noConnection;
      else message = sayError(error, language, copy);
      patch(key, { status: "failed", error: message });
    } finally {
      running.current.delete(key);
    }
  }, [patch]);

  // Start queued uploads, two at a time.
  useEffect(() => {
    if (running.current.size >= AT_ONCE) return;
    const waiting = uploads.filter((u) => u.status === "queued" && !running.current.has(u.key));
    for (const upload of waiting.slice(0, AT_ONCE - running.current.size)) void run(upload);
  }, [uploads, run]);

  const add = useCallback((chosen: FileList | File[]) => {
    const list = Array.from(chosen).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    const take = room ? Math.max(0, room()) : list.length;
    const fresh: Upload[] = list.slice(0, take).map((file) => {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      files.current.set(key, file);
      return {
        key, name: file.name, preview: URL.createObjectURL(file), status: "queued", progress: 0,
        error: "", photo: null, duplicate: false, note: "",
      };
    });
    if (fresh.length) setUploads((all) => [...all, ...fresh]);
    return { added: fresh.length, left: list.length - fresh.length };
  }, [room]);

  const retry = useCallback((key: string) => {
    setUploads((all) => all.map((u) => (u.key === key ? { ...u, status: "queued", error: "" } : u)));
  }, []);

  const drop = useCallback((key: string) => {
    setUploads((all) => {
      const gone = all.find((u) => u.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return all.filter((u) => u.key !== key);
    });
    blobs.current.delete(key);
    files.current.delete(key);
  }, []);

  const clearDone = useCallback(() => {
    setUploads((all) => {
      all.filter((u) => u.status === "done").forEach((u) => { URL.revokeObjectURL(u.preview); files.current.delete(u.key); });
      return all.filter((u) => u.status !== "done");
    });
  }, []);

  // Previews are freed when the queue goes away.
  useEffect(() => {
    const kept = files.current;
    const held = blobs.current;
    return () => { kept.clear(); held.clear(); };
  }, []);

  const busy = uploads.some((u) => u.status === "queued" || u.status === "shrinking" || u.status === "uploading" || u.status === "saving");
  return { uploads, add, retry, drop, clearDone, busy };
}
