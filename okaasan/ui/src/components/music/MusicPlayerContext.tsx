import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { recipeAPI } from '../../services/api';

export interface MusicTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  album_id: number | null;
  duration: number;
  track_number: number | null;
  cover_path: string | null;
}

interface MusicPlayerState {
  currentTrack: MusicTrack | null;
  queue: MusicTrack[];
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  play: (track: MusicTrack) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  addToQueue: (track: MusicTrack) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  playAlbum: (tracks: MusicTrack[], startIndex?: number) => void;
  setVolume: (vol: number) => void;
  toggleShuffle: () => void;
  shuffleAll: () => void;
}

const MusicPlayerContext = createContext<MusicPlayerState | null>(null);

export const useMusicPlayer = (): MusicPlayerState => {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  return ctx;
};

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const MusicPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7);
  const [shuffle, setShuffle] = useState(false);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setQueue(prev => {
        if (prev.length > 0) {
          const [nextTrack, ...rest] = prev;
          setTimeout(() => playTrack(nextTrack), 0);
          return rest;
        }
        return prev;
      });
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.src = '';
    };
  }, []);

  const playTrack = useCallback((track: MusicTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = `/api/music/stream/${track.id}`;
    audio.volume = volume;
    audio.play().catch(console.error);
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
  }, [volume]);

  const play = useCallback((track: MusicTrack) => {
    playTrack(track);
  }, [playTrack]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(console.error);
    setIsPlaying(true);
  }, []);

  const next = useCallback(() => {
    setQueue(prev => {
      if (prev.length === 0) return prev;
      const [nextTrack, ...rest] = prev;
      playTrack(nextTrack);
      return rest;
    });
  }, [playTrack]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
    }
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = time;
  }, []);

  const addToQueue = useCallback((track: MusicTrack) => {
    setQueue(prev => [...prev, track]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const playAlbum = useCallback((tracks: MusicTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    playTrack(tracks[startIndex]);
    setQueue(tracks.slice(startIndex + 1));
  }, [playTrack]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle(prev => {
      const next = !prev;
      if (next && queue.length > 1) {
        setQueue(shuffleArray(queue));
      }
      return next;
    });
  }, [queue]);

  const shuffleAll = useCallback(async () => {
    try {
      const data = await recipeAPI.request<{ tracks: MusicTrack[] }>('/music/library');
      const allTracks = (data.tracks || []);
      if (allTracks.length === 0) return;
      const shuffled = shuffleArray(allTracks);
      setShuffle(true);
      playTrack(shuffled[0]);
      setQueue(shuffled.slice(1));
    } catch (e) {
      console.error('Failed to load tracks for shuffle', e);
    }
  }, [playTrack]);

  return (
    <MusicPlayerContext.Provider value={{
      currentTrack, queue, isPlaying, progress, duration, volume, shuffle,
      play, pause, resume, next, prev, seek,
      addToQueue, removeFromQueue, clearQueue, playAlbum, setVolume,
      toggleShuffle, shuffleAll,
    }}>
      {children}
    </MusicPlayerContext.Provider>
  );
};
