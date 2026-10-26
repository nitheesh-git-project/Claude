"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Loads one picture into the browser and nowhere else: a blob URL held only
// while the picture is open, revoked when it is replaced, cleared or the tool
// closes. Nothing here reads the pixels back out, uploads or stores them.

export type LoadedImage = { el: HTMLImageElement; width: number; height: number; name: string };

const MAX_BYTES = 30 * 1024 * 1024;

export function useAngleImage() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(() => revoke, [revoke]);

  const load = useCallback(
    (file: File | Blob) => {
      if (!file.type.startsWith("image/")) {
        setError("That is not a picture. Choose a photo or a screenshot.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("That picture is too big. Choose one under 30 MB.");
        return;
      }
      revoke();
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      const el = new Image();
      el.onload = () => {
        if (urlRef.current !== url) return;
        if (!el.naturalWidth || !el.naturalHeight) {
          setError("We couldn't open that picture. Try a JPG or PNG.");
          return;
        }
        setError(null);
        setImage({ el, width: el.naturalWidth, height: el.naturalHeight, name: "name" in file && typeof file.name === "string" ? file.name : "pasted picture" });
      };
      el.onerror = () => {
        if (urlRef.current === url) revoke();
        setError("We couldn't open that picture. Try a JPG or PNG.");
      };
      el.src = url;
    },
    [revoke]
  );

  const clear = useCallback(() => {
    setImage(null);
    revoke();
  }, [revoke]);

  return { image, error, setError, load, clear };
}
