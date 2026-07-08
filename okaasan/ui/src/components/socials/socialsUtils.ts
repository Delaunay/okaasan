import type { ReactNode } from 'react';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export type SocialItemType = 'chat' | 'post' | 'media' | 'record';

export interface SocialDumpItem {
  id: string;
  file: string;
  file_path: string;
  preview: string;
  date: string | null;
  category: string;
  index?: number;
  item_type?: SocialItemType;
  thumbnail_uri?: string | null;
  media_count?: number;
  data?: unknown;
}

export interface SocialMessage {
  sender_name?: string;
  timestamp_ms?: number;
  content?: string;
  photos?: { uri: string }[];
  videos?: { uri: string }[];
  gifs?: { uri: string }[];
  audio_files?: { uri: string }[];
  files?: { uri: string }[];
  share?: { link?: string; share_text?: string };
  reactions?: { reaction?: string; actor?: string }[];
}

export interface SocialMessageThread {
  participants?: { name: string }[];
  messages?: SocialMessage[];
  title?: string;
  thread_path?: string;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|avi|mkv)$/i;

export function socialsMediaUrl(platform: string, uri: string): string {
  return `${API_BASE_URL}/socials/${platform}/media?path=${encodeURIComponent(uri)}`;
}

export function isImageUri(uri: string): boolean {
  return IMAGE_EXT.test(uri);
}

export function isVideoUri(uri: string): boolean {
  return VIDEO_EXT.test(uri);
}

export function classifySocialData(data: unknown): SocialItemType {
  if (!data || typeof data !== 'object') return 'record';
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.participants) && Array.isArray(d.messages)) return 'chat';
  if (d.title || d.attachments) return 'post';
  if (Array.isArray(d.media) && d.media.length > 0) return 'media';
  if (Array.isArray(d.label_values)) return 'record';
  return 'record';
}

export function extractMediaUris(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const uris: string[] = [];
  const add = (uri: unknown) => {
    if (typeof uri === 'string' && uri && !uris.includes(uri)) uris.push(uri);
  };

  for (const m of (d.media as { uri?: string }[]) || []) add(m?.uri);

  for (const lv of (d.label_values as { media?: { uri?: string }[] }[]) || []) {
    for (const m of lv.media || []) add(m?.uri);
  }

  for (const att of (d.attachments as { data?: Record<string, unknown>[] }[]) || []) {
    for (const block of att.data || []) {
      const media = block.media as { uri?: string } | undefined;
      add(media?.uri);
      const ext = block.external_context as { url?: string } | undefined;
      // external links are not local media
      void ext;
    }
  }

  for (const msg of (d.messages as SocialMessage[]) || []) {
    for (const key of ['photos', 'videos', 'gifs', 'audio_files', 'files'] as const) {
      for (const m of msg[key] || []) add(m?.uri);
    }
  }

  return uris;
}

export function extractExternalLinks(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const links: string[] = [];
  const add = (url: unknown) => {
    if (typeof url === 'string' && url.startsWith('http') && !links.includes(url)) links.push(url);
  };

  for (const att of (d.attachments as { data?: Record<string, unknown>[] }[]) || []) {
    for (const block of att.data || []) {
      const ext = block.external_context as { url?: string } | undefined;
      add(ext?.url);
      const place = block.place as { name?: string; url?: string } | undefined;
      add(place?.url);
    }
  }

  for (const msg of (d.messages as SocialMessage[]) || []) {
    add(msg.share?.link);
  }

  return links;
}

export function formatSocialDate(value: string | number | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toLocaleString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function itemTypeIcon(type: SocialItemType): ReactNode {
  switch (type) {
    case 'chat': return '💬';
    case 'post': return '📝';
    case 'media': return '📷';
    default: return '📄';
  }
}

export function itemTypeLabel(type: SocialItemType): string {
  switch (type) {
    case 'chat': return 'Conversation';
    case 'post': return 'Post';
    case 'media': return 'Media';
    default: return 'Record';
  }
}
