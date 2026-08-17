'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, X } from 'lucide-react';
import { MEDIA_ASPECT_CLASS, isVideoUrl, type MediaAspect } from '@/lib/media';

/**
 * MediaShowcase — Média de mise en avant (décision produit 2026-08-17),
 * partagé par le hero et le bloc vidéo : même mécanique, écrite une fois.
 *
 * Vidéo : lecture automatique SANS SON dès l'entrée dans le viewport, mise en
 * pause à la sortie — une vidéo qui tourne hors écran consomme de la batterie
 * pour rien. Le son n'arrive que sur action explicite, dans une pop-up : les
 * navigateurs refusent de toute façon l'autoplay sonore, et l'imposer serait
 * hostile.
 *
 * Le curseur devient un bouton play flottant au survol de la zone. Il est
 * purement décoratif (`pointer-events-none`) et doublé d'un vrai bouton
 * accessible : un effet de curseur n'existe pas au clavier ni au toucher.
 */

/** Lecteur en pop-up, avec le son — monté uniquement à l'ouverture. */
function VideoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    // La page derrière ne doit pas défiler pendant la lecture.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="presentation"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer la vidéo"
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={src}
        controls
        autoPlay
        playsInline
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85svh] w-auto max-w-full rounded-xl"
      />
    </div>
  );
}

export type { MediaAspect };

export function MediaShowcase({
  url,
  aspect = '4:5',
  alt = '',
  className = '',
  rounded = 'rounded-3xl',
}: {
  url: string;
  aspect?: MediaAspect;
  alt?: string;
  className?: string;
  rounded?: string;
}) {
  const isVideo = isVideoUrl(url);
  const videoRef = useRef<HTMLVideoElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  // Lecture liée à la visibilité — `IntersectionObserver` plutôt qu'un
  // écouteur de scroll : le navigateur fait le calcul hors du thread principal.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // `play()` renvoie une promesse rejetée si le navigateur refuse
          // (économie de données, par exemple) : on l'ignore volontairement,
          // l'affiche reste visible et le bouton de lecture disponible.
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [isVideo, url]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const rect = zoneRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  if (!isVideo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className={`w-full ${MEDIA_ASPECT_CLASS[aspect]} ${rounded} object-cover ${className}`}
      />
    );
  }

  return (
    <>
      <div
        ref={zoneRef}
        onMouseMove={onMove}
        onMouseLeave={() => setCursor(null)}
        className={`group relative overflow-hidden ${rounded} ${MEDIA_ASPECT_CLASS[aspect]} ${className} md:cursor-none`}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={url}
          muted
          loop
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />

        {/* Bouton flottant qui suit le curseur — décoratif, jamais la seule
            façon de lancer la lecture. Masqué sous md : il n'y a pas de
            curseur au doigt. */}
        {cursor && (
          <span
            aria-hidden="true"
            style={{ left: cursor.x, top: cursor.y }}
            className="pointer-events-none absolute hidden -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-sm font-semibold text-black shadow-lg md:flex"
          >
            <Play className="size-4 fill-black" /> Lire
          </span>
        )}

        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="Lire la vidéo avec le son"
          className="absolute inset-0 flex items-center justify-center"
        >
          {/* Pastille visible au toucher et au clavier, effacée quand le
              curseur flottant prend le relais. */}
          <span
            className={`flex size-14 items-center justify-center rounded-full bg-white/90 text-black transition-opacity md:opacity-0 ${
              cursor ? '' : 'md:group-focus-within:opacity-100'
            }`}
          >
            <Play className="size-5 fill-black" />
          </span>
        </button>
      </div>

      {lightboxOpen && <VideoLightbox src={url} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}
