// Audio from interchangeable sound packs: folders of MP3s under the site's
// uploads, <base>/<pack>/, listed in <base>/packs.json, one clip per spoken text,
// named by the text's code points (가 -> ac00.mp3, 나무 -> b098-bb34.mp3).
// A missing clip falls back to the other packs, then to the browser's voice.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoundPack } from './types';
import { resolveMediaUrl } from '../../../../services/api';

export const BROWSER_PACK: SoundPack = { id: 'browser', label: 'Browser voice' };

export const clipName = (text: string) =>
  `${Array.from(text).map((c) => c.codePointAt(0)!.toString(16)).join('-')}.mp3`;

function useVoice(lang: string) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    const pick = () => setVoice(synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang)) || null);
    pick();
    synth.addEventListener('voiceschanged', pick);
    return () => synth.removeEventListener('voiceschanged', pick);
  }, [lang]);
  return voice;
}

export interface Speaker {
  speak: (text: string | undefined) => void;
  packs: SoundPack[];
  pack: SoundPack;
  setPack: (id: string) => void;
  canListen: boolean;
}

export function useSpeaker(audio: { base: string; lang: string }, storageKey: string): Speaker {
  const base = resolveMediaUrl(audio.base)!;
  const voice = useVoice(audio.lang);
  const [packs, setPacks] = useState<SoundPack[]>([BROWSER_PACK]);
  const [chosen, setChosen] = useState<string>(() => {
    try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
  });

  useEffect(() => {
    fetch(`${base}packs.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: SoundPack[]) => setPacks([...list, BROWSER_PACK]))
      .catch(() => { });
  }, [base]);

  const pack = packs.find((p) => p.id === chosen) || packs[0];
  const state = useRef({ pack, packs, voice, playing: null as HTMLAudioElement | null });
  state.current.pack = pack;
  state.current.packs = packs;
  state.current.voice = voice;

  const speakBrowser = useCallback((text: string) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = audio.lang;
    if (state.current.voice) u.voice = state.current.voice;
    u.rate = 0.7;
    synth.cancel();
    // Chrome sometimes drops an utterance queued in the same tick as cancel().
    setTimeout(() => synth.speak(u), 30);
  }, [audio.lang]);

  const speak = useCallback((text: string | undefined) => {
    if (!text) return;
    const s = state.current;
    s.playing?.pause();
    s.playing = null;
    if (s.pack.id === BROWSER_PACK.id) {
      speakBrowser(text);
      return;
    }
    const order = [s.pack.id, ...s.packs.filter((p) => p.id !== s.pack.id && p.id !== BROWSER_PACK.id).map((p) => p.id)];
    const attempt = (i: number) => {
      if (i >= order.length) {
        speakBrowser(text);
        return;
      }
      const a = new Audio(`${base}${order[i]}/${clipName(text)}`);
      s.playing = a;
      a.play().catch((e: DOMException) => {
        if (e.name !== 'NotAllowedError' && e.name !== 'AbortError' && s.playing === a) attempt(i + 1);
      });
    };
    attempt(0);
  }, [base, speakBrowser]);

  const setPack = (id: string) => {
    setChosen(id);
    state.current.pack = packs.find((p) => p.id === id) || BROWSER_PACK;
    try { localStorage.setItem(storageKey, id); } catch { /* empty */ }
  };

  return { speak, packs, pack, setPack, canListen: pack.id !== BROWSER_PACK.id || !!voice };
}
