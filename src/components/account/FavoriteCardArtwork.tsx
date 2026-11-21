"use client";

import { useEffect, useRef, useState } from "react";
import LoadingImage from "@/components/LoadingImage";
import styles from "./ProfileFavorites.module.css";

export default function FavoriteCardArtwork({ src, loadingLabel, onError }: {
  src: string; loadingLabel: string; onError: () => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [nearby, setNearby] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!image || typeof createImageBitmap !== "function") return;
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), { rootMargin: "250px" });
    observer.observe(image);
    return () => observer.disconnect();
  }, [image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!nearby || !image || !canvas) return;
    let wantedWidth = 0;
    let active = true;

    async function resize(source: HTMLImageElement, surface: HTMLCanvasElement) {
      const box = source.getBoundingClientRect();
      // Keep 1.5 source pixels per displayed device pixel before object-fit crops the artwork.
      const scale = 1.5 * window.devicePixelRatio * Math.max(box.width / source.naturalWidth, box.height / source.naturalHeight);
      const width = Math.ceil(source.naturalWidth * scale);
      if (width === wantedWidth) return;
      wantedWidth = width;
      if (!width || width >= source.naturalWidth) {
        surface.width = 0;
        delete surface.dataset.ready;
        return;
      }
      let bitmap: ImageBitmap | undefined;
      try {
        bitmap = await createImageBitmap(source, {
          resizeWidth: width, resizeHeight: Math.ceil(source.naturalHeight * scale), resizeQuality: "high",
        });
        if (!active || wantedWidth !== width) return;
        const context = surface.getContext("2d");
        if (!context) return;
        surface.width = bitmap.width;
        surface.height = bitmap.height;
        context.drawImage(bitmap, 0, 0);
        surface.dataset.ready = "";
      } catch {
        // Keep the native image visible if this browser cannot resize the source.
        if (active && wantedWidth === width) {
          surface.width = 0;
          delete surface.dataset.ready;
        }
      } finally {
        bitmap?.close();
      }
    }
    const update = () => { void resize(image, canvas); };
    const observer = new ResizeObserver(update);
    observer.observe(image);
    const resolution = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    let density = resolution();
    function changeDensity() {
      density = resolution();
      density.addEventListener("change", changeDensity, { once: true });
      update();
    }
    density.addEventListener("change", changeDensity, { once: true });
    return () => {
      active = false;
      observer.disconnect();
      density.removeEventListener("change", changeDensity);
      canvas.width = 0;
      delete canvas.dataset.ready;
    };
  }, [image, nearby]);

  return <>
    <LoadingImage className={styles.art} src={src} loadingLabel={loadingLabel} loading="lazy" decoding="async" alt=""
      onLoad={event => setImage(event.currentTarget)} onError={onError} />
    {nearby && <canvas className={styles.art} ref={canvasRef} width={0} height={0} aria-hidden="true" />}
  </>;
}
