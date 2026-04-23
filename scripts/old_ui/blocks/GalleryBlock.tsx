import React, { useState } from 'react';
import { Box, Text, Image as ChakraImage } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

const CloseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" />
    </svg>
);

export const GalleryBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const images = block.data?.images || [];
    const columns = block.data?.columns || 3;
    const caption = block.data?.caption;

    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    const openLightbox = (index: number) => {
        if (readonly) {
            setLightboxIndex(index);
        }
    };

    const closeLightbox = () => {
        setLightboxIndex(null);
    };

    const navigateLightbox = (direction: 'prev' | 'next') => {
        if (lightboxIndex === null) return;

        if (direction === 'prev') {
            setLightboxIndex(lightboxIndex > 0 ? lightboxIndex - 1 : images.length - 1);
        } else {
            setLightboxIndex(lightboxIndex < images.length - 1 ? lightboxIndex + 1 : 0);
        }
    };

    if (images.length === 0) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No images in gallery
                </Text>
            </Box>
        );
    }

    return (
        <Box mb={4}>
            {caption && (
                <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                    {caption}
                </Text>
            )}
            <Box
                display="grid"
                gridTemplateColumns={`repeat(${columns}, 1fr)`}
                gap={2}
            >
                {images.map((img: { url: string; alt?: string }, index: number) => (
                    <Box
                        key={index}
                        position="relative"
                        paddingBottom="100%"
                        overflow="hidden"
                        borderRadius="md"
                        cursor={readonly ? 'pointer' : 'default'}
                        _hover={readonly ? { opacity: 0.8 } : {}}
                        transition="opacity 0.2s"
                        onClick={() => openLightbox(index)}
                    >
                        <ChakraImage
                            src={img.url}
                            alt={img.alt || `Gallery image ${index + 1}`}
                            position="absolute"
                            top={0}
                            left={0}
                            width="100%"
                            height="100%"
                            objectFit="cover"
                        />
                    </Box>
                ))}
            </Box>

            {/* Lightbox */}
            {lightboxIndex !== null && (
                <Box
                    position="fixed"
                    top={0}
                    left={0}
                    right={0}
                    bottom={0}
                    bg="rgba(0, 0, 0, 0.9)"
                    zIndex={9999}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    onClick={closeLightbox}
                >
                    <Box
                        position="absolute"
                        top={4}
                        right={4}
                        color="white"
                        cursor="pointer"
                        _hover={{ color: 'gray.300' }}
                    >
                        <CloseIcon />
                    </Box>
                    <ChakraImage
                        src={images[lightboxIndex].url}
                        alt={images[lightboxIndex].alt || `Gallery image ${lightboxIndex + 1}`}
                        maxH="90vh"
                        maxW="90vw"
                        objectFit="contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                    {images.length > 1 && (
                        <>
                            <Box
                                position="absolute"
                                left={4}
                                color="white"
                                fontSize="2xl"
                                cursor="pointer"
                                onClick={(e) => { e.stopPropagation(); navigateLightbox('prev'); }}
                                _hover={{ color: 'gray.300' }}
                            >
                                ‹
                            </Box>
                            <Box
                                position="absolute"
                                right={4}
                                color="white"
                                fontSize="2xl"
                                cursor="pointer"
                                onClick={(e) => { e.stopPropagation(); navigateLightbox('next'); }}
                                _hover={{ color: 'gray.300' }}
                            >
                                ›
                            </Box>
                        </>
                    )}
                </Box>
            )}
        </Box>
    );
};


