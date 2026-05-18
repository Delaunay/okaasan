import React from 'react';
import { Image } from '@chakra-ui/react';
import { resolveMediaUrl } from '../../services/api';

const TMDBAttribution: React.FC = () => (
  <Image
    src={resolveMediaUrl('uploads/data/shows/tmdb.svg')}
    alt="TMDB"
    h="16px"
    opacity={0.7}
    ml="auto"
  />
);

export default TMDBAttribution;
