import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, HStack, VStack, Text, Button, Flex, Input, Spinner } from '@chakra-ui/react';
import { X, Play, Pause, SkipForward, ToggleLeft, ToggleRight, Cast, Copy, Check, Captions, Download } from 'lucide-react';
import { absoluteApiUrl, recipeAPI } from '../../services/api';

interface LocalSubtitle {
  language: string;
  file_name: string;
}

interface SubtitleResult {
  id: number | string;
  file_id: number;
  file_name: string | null;
  release: string | null;
  language: string | null;
  download_count: number;
  ratings: number;
}

export interface EpisodeFile {
  id: number;
  season: number | null;
  episode: number | null;
  title?: string | null;
  file_path?: string | null;
}

interface VideoPlayerModalProps {
  title: string;
  files: EpisodeFile[];
  onClose: () => void;
}

const AUTO_NEXT_KEY = 'video-player-auto-next';

function epLabel(f: EpisodeFile): string {
  if (f.season != null && f.episode != null) {
    return `S${String(f.season).padStart(2, '0')}E${String(f.episode).padStart(2, '0')}`;
  }
  if (f.file_path) {
    return f.file_path.split('/').pop() || `File #${f.id}`;
  }
  return `File #${f.id}`;
}

type StreamMode = 'auto' | 'remux' | 'transcode';

const STREAM_MODE_LABELS: Record<StreamMode, string> = {
  auto: 'Auto',
  remux: 'Compatibility',
  transcode: 'Transcode',
};

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ title, files, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoNext, setAutoNext] = useState(() => localStorage.getItem(AUTO_NEXT_KEY) === 'true');
  const [streamMode, setStreamMode] = useState<StreamMode>('auto');
  const [urlCopied, setUrlCopied] = useState(false);

  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const [localSubtitles, setLocalSubtitles] = useState<LocalSubtitle[]>([]);
  const [activeSubtitleLang, setActiveSubtitleLang] = useState<string | null>(null);
  const [subtitleQuery, setSubtitleQuery] = useState('');
  const [subtitleLanguage, setSubtitleLanguage] = useState('en');
  const [subtitleResults, setSubtitleResults] = useState<SubtitleResult[]>([]);
  const [subtitleSearching, setSubtitleSearching] = useState(false);
  const [subtitleSearchError, setSubtitleSearchError] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);

  const killVlc = useCallback(() => {
    // Stop the video element first to sever the HTTP connection
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    // Synchronous XHR — blocks until the server confirms the kill
    const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBase}/shows/library/stream/stop`, false);
    try { xhr.send(); } catch (e) { /* ignore network errors */ }
  }, []);

  const currentFile = files[currentIndex] || null;
  const streamUrl = currentFile && playing
    ? `/api/shows/library/stream/${currentFile.id}${streamMode !== 'auto' ? `?mode=${streamMode}` : ''}`
    : '';

  // mode=direct: raw bytes, no server-side remux/transcode — VLC decodes
  // whatever the file actually is, so let it, rather than paying the CPU
  // cost of a remux/transcode server-side for a client that doesn't need it.
  const vlcStreamUrl = useCallback(() => {
    if (!currentFile) return null;
    return absoluteApiUrl(`/shows/library/stream/${currentFile.id}?mode=direct`);
  }, [currentFile]);

  const streamToVlc = useCallback(() => {
    const url = vlcStreamUrl();
    if (!url) return;
    // vlc:// isn't registered as a protocol handler out of the box on most
    // systems (needs a browser extension + native host + manual browser
    // config) — a downloaded .m3u playlist is a plain file, and VLC already
    // registers itself as the default handler for .m3u/.pls on install, so
    // this "just works" with no extra setup.
    const blob = new Blob([`#EXTM3U\n${url}\n`], { type: 'audio/x-mpegurl' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${title.replace(/[^\w.-]+/g, '_') || 'stream'}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }, [vlcStreamUrl, title]);

  const copyVlcUrl = useCallback(async () => {
    const url = vlcStreamUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }, [vlcStreamUrl]);

  const refreshLocalSubtitles = useCallback(async (fileId: number) => {
    try {
      const data = await recipeAPI.request<{ subtitles: LocalSubtitle[] }>(
        `/shows/library/${fileId}/subtitles`
      );
      setLocalSubtitles(data.subtitles || []);
    } catch {
      setLocalSubtitles([]);
    }
  }, []);

  // Reset per-episode subtitle state and pick up whatever's already saved
  // next to the new file whenever the selected episode changes.
  useEffect(() => {
    setActiveSubtitleLang(null);
    setSubtitleResults([]);
    setSubtitleSearchError(null);
    if (currentFile) {
      refreshLocalSubtitles(currentFile.id);
    } else {
      setLocalSubtitles([]);
    }
  }, [currentFile?.id, refreshLocalSubtitles]);

  const searchSubtitles = useCallback(async () => {
    if (!currentFile) return;
    setSubtitleSearching(true);
    setSubtitleSearchError(null);
    setSubtitleResults([]);
    try {
      const params = new URLSearchParams({ language: subtitleLanguage });
      if (subtitleQuery.trim()) params.set('query', subtitleQuery.trim());
      const data = await recipeAPI.request<{ results: SubtitleResult[] }>(
        `/shows/library/${currentFile.id}/subtitles/search?${params}`
      );
      setSubtitleResults(data.results || []);
    } catch (e) {
      setSubtitleSearchError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSubtitleSearching(false);
    }
  }, [currentFile, subtitleLanguage, subtitleQuery]);

  const downloadSubtitle = useCallback(async (result: SubtitleResult) => {
    if (!currentFile) return;
    setDownloadingFileId(result.file_id);
    try {
      await recipeAPI.request(`/shows/library/${currentFile.id}/subtitles/download`, {
        method: 'POST',
        body: JSON.stringify({ file_id: result.file_id, language: result.language || subtitleLanguage }),
      });
      await refreshLocalSubtitles(currentFile.id);
      setActiveSubtitleLang(result.language || subtitleLanguage);
    } catch (e) {
      setSubtitleSearchError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloadingFileId(null);
    }
  }, [currentFile, subtitleLanguage, refreshLocalSubtitles]);

  const toggleAutoNext = useCallback(() => {
    setAutoNext(prev => {
      const next = !prev;
      localStorage.setItem(AUTO_NEXT_KEY, String(next));
      return next;
    });
  }, []);

  const selectEpisode = useCallback((index: number) => {
    setPlaying(false);
    setCurrentIndex(index);
  }, []);

  const handlePlay = useCallback(() => {
    setPlaying(true);
  }, []);

  const handleClose = useCallback(() => {
    killVlc();
    onClose();
  }, [killVlc, onClose]);

  const handleNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setPlaying(true);
    }
  }, [currentIndex, files.length]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  // Auto-next on video end
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleEnded = () => {
      if (autoNext && currentIndex < files.length - 1) {
        handleNext();
      }
    };
    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [autoNext, currentIndex, files.length, handleNext]);

  // Prevent body scroll; kill VLC on unmount
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      killVlc();
    };
  }, [killVlc]);

  // When streamUrl changes, load it into the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (streamUrl) {
      video.src = streamUrl;
      video.load();
      video.play().catch(() => {});
    } else {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, [streamUrl]);

  // Keep the browser's native text tracks in sync with which subtitle
  // (if any) is selected — changing a <track>'s `default` attribute alone
  // doesn't retroactively update a track that's already loaded.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (const t of Array.from(video.textTracks)) {
      t.mode = activeSubtitleLang && t.language === activeSubtitleLang ? 'showing' : 'disabled';
    }
  }, [activeSubtitleLang, localSubtitles, streamUrl]);

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="rgba(0, 0, 0, 0.95)"
      zIndex={9999}
      display="flex"
      flexDirection="column"
    >
      {/* Header */}
      <Flex px={4} py={3} justify="space-between" align="center" flexShrink={0}>
        <Box>
          <Text color="white" fontWeight="bold" fontSize="md">{title}</Text>
          {currentFile && (
            <Text color="whiteAlpha.700" fontSize="sm">{epLabel(currentFile)}</Text>
          )}
        </Box>
        <HStack gap={3}>
          <HStack gap={0} borderRadius="md" overflow="hidden" border="1px solid" borderColor="whiteAlpha.300">
            {(Object.keys(STREAM_MODE_LABELS) as StreamMode[]).map(mode => (
              <Box
                key={mode}
                as="button"
                px={2}
                py={1}
                fontSize="xs"
                color={streamMode === mode ? 'black' : 'whiteAlpha.800'}
                bg={streamMode === mode ? 'white' : 'transparent'}
                cursor="pointer"
                onClick={() => setStreamMode(mode)}
                title={
                  mode === 'auto' ? 'Direct if the browser supports it, transcode otherwise'
                    : mode === 'remux' ? 'Fast container fix (no re-encode) — use if playback fails in Auto'
                    : 'Full re-encode — use if Compatibility mode also fails'
                }
              >
                {STREAM_MODE_LABELS[mode]}
              </Box>
            ))}
          </HStack>
          {currentFile && (
            <Box position="relative">
              <Button
                size="sm"
                variant="ghost"
                color="white"
                _hover={{ bg: 'whiteAlpha.200' }}
                onClick={() => setSubtitlesOpen(prev => !prev)}
                title="Subtitles"
              >
                <Captions size={16} />
                <Text ml={1} fontSize="sm">Subtitles{activeSubtitleLang ? ` (${activeSubtitleLang})` : ''}</Text>
              </Button>
              {subtitlesOpen && (
                <Box
                  position="absolute"
                  top="100%"
                  right={0}
                  mt={1}
                  w="340px"
                  maxH="400px"
                  overflowY="auto"
                  bg="gray.900"
                  border="1px solid"
                  borderColor="whiteAlpha.300"
                  borderRadius="md"
                  p={3}
                  zIndex={10}
                  boxShadow="lg"
                >
                  <Text fontSize="xs" fontWeight="semibold" color="whiteAlpha.700" mb={2}>ON THIS FILE</Text>
                  <VStack align="stretch" gap={1} mb={3}>
                    <HStack
                      px={2} py={1} borderRadius="sm" cursor="pointer"
                      bg={activeSubtitleLang === null ? 'whiteAlpha.200' : 'transparent'}
                      _hover={{ bg: 'whiteAlpha.100' }}
                      onClick={() => setActiveSubtitleLang(null)}
                    >
                      <Text fontSize="sm" color="white">Off</Text>
                    </HStack>
                    {localSubtitles.map(sub => (
                      <HStack
                        key={sub.language}
                        px={2} py={1} borderRadius="sm" cursor="pointer"
                        bg={activeSubtitleLang === sub.language ? 'whiteAlpha.200' : 'transparent'}
                        _hover={{ bg: 'whiteAlpha.100' }}
                        onClick={() => setActiveSubtitleLang(sub.language)}
                      >
                        <Text fontSize="sm" color="white">{sub.language}</Text>
                      </HStack>
                    ))}
                    {localSubtitles.length === 0 && (
                      <Text fontSize="xs" color="whiteAlpha.600">None saved yet</Text>
                    )}
                  </VStack>

                  <Text fontSize="xs" fontWeight="semibold" color="whiteAlpha.700" mb={2}>SEARCH ONLINE</Text>
                  <HStack mb={2}>
                    <Input
                      size="sm"
                      placeholder={title}
                      value={subtitleQuery}
                      onChange={e => setSubtitleQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') searchSubtitles(); }}
                      bg="whiteAlpha.100"
                      color="white"
                    />
                    <Input
                      size="sm"
                      w="60px"
                      value={subtitleLanguage}
                      onChange={e => setSubtitleLanguage(e.target.value)}
                      bg="whiteAlpha.100"
                      color="white"
                      title="Language code, e.g. en, fr, es"
                    />
                    <Button size="sm" onClick={searchSubtitles} disabled={subtitleSearching}>
                      {subtitleSearching ? <Spinner size="xs" /> : 'Go'}
                    </Button>
                  </HStack>

                  {subtitleSearchError && (
                    <Text fontSize="xs" color="red.300" mb={2}>{subtitleSearchError}</Text>
                  )}

                  <VStack align="stretch" gap={1}>
                    {subtitleResults.map(r => (
                      <HStack key={r.id} justify="space-between" px={2} py={1} borderRadius="sm" _hover={{ bg: 'whiteAlpha.100' }}>
                        <Box flex={1} minW={0}>
                          <Text fontSize="xs" color="white" lineClamp={1}>{r.release || r.file_name || 'Unknown release'}</Text>
                          <Text fontSize="2xs" color="whiteAlpha.600">{r.language} · {r.download_count} downloads</Text>
                        </Box>
                        <Button
                          size="xs"
                          variant="ghost"
                          color="white"
                          onClick={() => downloadSubtitle(r)}
                          disabled={downloadingFileId === r.file_id}
                        >
                          {downloadingFileId === r.file_id ? <Spinner size="xs" /> : <Download size={14} />}
                        </Button>
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              )}
            </Box>
          )}
          {currentFile && (
            <HStack gap={0}>
              <Button
                size="sm"
                variant="ghost"
                color="white"
                _hover={{ bg: 'whiteAlpha.200' }}
                onClick={streamToVlc}
                title="Download a .m3u playlist for this stream — opens in VLC automatically on most systems"
              >
                <Cast size={16} />
                <Text ml={1} fontSize="sm">Open in VLC</Text>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                color="white"
                _hover={{ bg: 'whiteAlpha.200' }}
                onClick={copyVlcUrl}
                title="Copy stream URL — paste into VLC's Open Network Stream dialog if the playlist download doesn't auto-open"
                px={2}
              >
                {urlCopied ? <Check size={16} color="lightgreen" /> : <Copy size={16} />}
              </Button>
            </HStack>
          )}
          <HStack gap={1} cursor="pointer" onClick={toggleAutoNext} opacity={0.8} _hover={{ opacity: 1 }}>
            {autoNext ? <ToggleRight size={20} color="white" /> : <ToggleLeft size={20} color="gray" />}
            <Text fontSize="xs" color={autoNext ? 'white' : 'gray'}>Auto-Next</Text>
          </HStack>
          {currentIndex < files.length - 1 && (
            <Button size="sm" variant="ghost" color="white" _hover={{ bg: 'whiteAlpha.200' }} onClick={handleNext}>
              <SkipForward size={16} />
              <Text ml={1} fontSize="sm">Next</Text>
            </Button>
          )}
          <Button size="sm" variant="ghost" color="white" _hover={{ bg: 'whiteAlpha.200' }} onClick={handleClose}>
            <X size={20} />
          </Button>
        </HStack>
      </Flex>

      {/* Body: Video + Episode list */}
      <Flex flex={1} overflow="hidden" px={4} pb={4} gap={4}>
        {/* Video area */}
        <Box flex={1} display="flex" alignItems="center" justifyContent="center" position="relative">
          <video
            ref={videoRef}
            controls
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }}
          >
            {currentFile && localSubtitles.map(sub => (
              <track
                key={sub.language}
                kind="subtitles"
                src={`/api/shows/library/${currentFile.id}/subtitles/${sub.language}.vtt`}
                srcLang={sub.language}
                label={sub.language}
              />
            ))}
          </video>
          {!playing && (
            <Box
              position="absolute"
              inset={0}
              display="flex"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              onClick={handlePlay}
              borderRadius="8px"
              bg="rgba(0,0,0,0.4)"
              _hover={{ bg: 'rgba(0,0,0,0.2)' }}
              transition="background 0.2s"
            >
              <Box bg="blue.500" borderRadius="full" p={4}>
                <Play size={48} color="white" fill="white" />
              </Box>
            </Box>
          )}
        </Box>

        {/* Episode sidebar */}
        {files.length > 1 && (
          <Box
            w="280px"
            flexShrink={0}
            overflowY="auto"
            borderRadius="md"
            bg="rgba(255,255,255,0.05)"
            p={2}
          >
            <Text color="whiteAlpha.600" fontSize="xs" fontWeight="semibold" mb={2} px={2}>
              {files.length} Episodes
            </Text>
            <VStack gap={1} align="stretch">
              {files.map((f, i) => (
                <HStack
                  key={f.id}
                  px={3}
                  py={2}
                  borderRadius="md"
                  bg={i === currentIndex ? 'whiteAlpha.200' : 'transparent'}
                  _hover={{ bg: 'whiteAlpha.100' }}
                  cursor="pointer"
                  onClick={() => selectEpisode(i)}
                  gap={2}
                >
                  {i === currentIndex && playing ? (
                    <Pause size={14} color="white" />
                  ) : (
                    <Play size={14} color={i === currentIndex ? 'white' : 'gray'} />
                  )}
                  <Text
                    fontSize="sm"
                    color={i === currentIndex ? 'white' : 'whiteAlpha.700'}
                    lineClamp={1}
                  >
                    {epLabel(f)}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Box>
        )}
      </Flex>
    </Box>
  );
};

export default VideoPlayerModal;
