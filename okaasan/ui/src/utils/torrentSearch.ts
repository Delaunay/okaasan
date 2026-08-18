// Builds a link to the torrent Downloads/Discover page, pre-filled with a query.
export function torrentSearchPath(title: string, extra?: string | number): string {
  const q = extra ? `${title} ${extra}` : title;
  return `/torrents/discover?q=${encodeURIComponent(q)}`;
}

export function episodeQuery(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}
