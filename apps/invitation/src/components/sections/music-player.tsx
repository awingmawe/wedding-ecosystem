'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface MusicPlayerProps {
  audioUrl: string;
  autoplay?: boolean;
  title?: string;
}

/**
 * Floating music player component.
 * Renders as a fixed button in the bottom-right corner.
 * Only rendered when the music section is active.
 */
export function MusicPlayer({ audioUrl, autoplay, title }: MusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (autoplay) {
      // Attempt autoplay - browsers may block this without user interaction
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // Autoplay blocked by browser, user needs to interact
        setIsPlaying(false);
      });
    }
  }, [autoplay]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  }, [isPlaying]);

  return (
    <>
      <audio ref={audioRef} src={audioUrl} loop preload="none">
        <track kind="captions" />
      </audio>

      <button
        onClick={togglePlay}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label={isPlaying ? 'Pause musik' : 'Play musik'}
        title={title || 'Musik'}
      >
        {isPlaying ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>
    </>
  );
}
