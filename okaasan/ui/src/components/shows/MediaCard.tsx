import React from 'react';
import { Link } from 'react-router-dom';
import { Box, Text, Image } from '@chakra-ui/react';
import { resolveMediaUrl } from '../../services/api';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';

interface MediaCardProps {
  item: any;
  onClick?: () => void;
}

interface MediaInfo {
  title: string;
  year?: number;
  poster?: string;
  type: string;
  overview?: string;
  tmdbId?: number;
}

function resolvePoster(posterPath: string | undefined | null): string | undefined {
  return resolveMediaUrl(posterPath);
}

function getMediaInfo(item: any): MediaInfo {
  // New DB format: flat object with top-level title, year, media_type, tmdb_id, poster_path
  if (item.title && (item.media_type || item.tmdb_id)) {
    return {
      title: item.title,
      year: item.year,
      poster: resolvePoster(item.poster_path),
      type: item.media_type === 'show' ? 'tv' : (item.media_type || 'movie'),
      overview: item.overview,
      tmdbId: item.tmdb_id,
    };
  }

  // Legacy Trakt format: nested show/movie objects
  if (item.type === 'episode' || item.show) {
    const show = item.show || {};
    const posterPath = show.images?.poster?.[0];
    const poster = posterPath && !posterPath.startsWith('http')
      ? `https://${posterPath}`
      : posterPath;
    return {
      title: show.title || 'Unknown Show',
      year: show.year,
      poster,
      type: 'tv',
      overview: show.overview,
      tmdbId: show.ids?.tmdb,
    };
  }

  if (item.movie) {
    const movie = item.movie || {};
    const posterPath = movie.images?.poster?.[0];
    const poster = posterPath && !posterPath.startsWith('http')
      ? `https://${posterPath}`
      : posterPath;
    return {
      title: movie.title || 'Unknown Movie',
      year: movie.year,
      poster,
      type: 'movie',
      overview: movie.overview,
      tmdbId: movie.ids?.tmdb,
    };
  }

  const source = item.show || item.movie || {};
  const posterPath = source.images?.poster?.[0];
  const poster = posterPath && !posterPath.startsWith('http')
    ? `https://${posterPath}`
    : posterPath;

  return {
    title: source.title || item.title || 'Unknown',
    year: source.year || item.year,
    poster,
    type: item.type || item.media_type || 'show',
    overview: source.overview,
    tmdbId: source.ids?.tmdb || item.tmdb_id,
  };
}

const MediaCard: React.FC<MediaCardProps> = ({ item, onClick }) => {
  const info = getMediaInfo(item);
  const to = info.tmdbId ? `/shows/detail/${info.type}/${info.tmdbId}` : undefined;

  const cardContent = (
    <Box
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      cursor={to || onClick ? 'pointer' : 'default'}
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={to || onClick ? { transform: 'translateY(-2px)', boxShadow: 'md' } : {}}
    >
      {info.poster ? (
        <Image
          src={info.poster}
          alt={info.title}
          w="100%"
          h="220px"
          objectFit="cover"
          loading="lazy"
        />
      ) : (
        <Box
          w="100%"
          h="220px"
          bg="var(--surface-muted)"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Text color="var(--empty-text)" fontSize="sm">No Poster</Text>
        </Box>
      )}
      <Box p={3}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>
          {info.title}
        </Text>
        {info.year && (
          <Text fontSize="xs" color="var(--muted-text)">{info.year}</Text>
        )}
      </Box>
    </Box>
  );

  if (onClick) {
    return <Box onClick={onClick}>{cardContent}</Box>;
  }

  if (to) {
    return (
      <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
        {cardContent}
      </Link>
    );
  }

  return cardContent;
};

export { getMediaInfo, TMDB_IMAGE_BASE };
export default MediaCard;
