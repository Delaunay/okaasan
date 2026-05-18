import React from 'react';
import { Image } from '@chakra-ui/react';

const TMDBAttribution: React.FC = () => (
  <Image
    src="/api/uploads/data/shows/tmdb.svg"
    alt="TMDB"
    h="16px"
    opacity={0.7}
    ml="auto"
  />
);

export default TMDBAttribution;
