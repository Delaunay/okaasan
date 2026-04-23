import React, { useState } from 'react';
import { Box, Image as ChakraImage, Text, HStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

const ChevronLeft = () => (
    <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" />
    </svg>
);

const ChevronRight = () => (
    <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
    </svg>
);

export const SlideshowBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const slides = block.data?.slides || [];
    const autoPlay = block.data?.autoPlay || false;
    const interval = block.data?.interval || 3000;
    const showDots = block.data?.showDots !== false;

    const [currentIndex, setCurrentIndex] = useState(0);

    React.useEffect(() => {
        if (!autoPlay || !readonly || slides.length <= 1) return;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % slides.length);
        }, interval);

        return () => clearInterval(timer);
    }, [autoPlay, readonly, interval, slides.length]);

    const goToPrevious = () => {
        setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
    };

    const goToNext = () => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
    };

    const goToSlide = (index: number) => {
        setCurrentIndex(index);
    };

    if (slides.length === 0) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No slides in slideshow
                </Text>
            </Box>
        );
    }

    const currentSlide = slides[currentIndex];

    return (
        <Box mb={4}>
            <Box position="relative" borderRadius="md" overflow="hidden" bg="black">
                {/* Current Slide */}
                <Box position="relative" width="100%" paddingBottom="56.25%">
                    <ChakraImage
                        src={currentSlide.url}
                        alt={currentSlide.caption || `Slide ${currentIndex + 1}`}
                        position="absolute"
                        top={0}
                        left={0}
                        width="100%"
                        height="100%"
                        objectFit="contain"
                    />
                </Box>

                {/* Navigation Arrows */}
                {readonly && slides.length > 1 && (
                    <>
                        <Box
                            position="absolute"
                            left={2}
                            top="50%"
                            transform="translateY(-50%)"
                            cursor="pointer"
                            color="white"
                            bg="rgba(0, 0, 0, 0.5)"
                            borderRadius="50%"
                            p={1}
                            _hover={{ bg: 'rgba(0, 0, 0, 0.7)' }}
                            onClick={goToPrevious}
                        >
                            <ChevronLeft />
                        </Box>
                        <Box
                            position="absolute"
                            right={2}
                            top="50%"
                            transform="translateY(-50%)"
                            cursor="pointer"
                            color="white"
                            bg="rgba(0, 0, 0, 0.5)"
                            borderRadius="50%"
                            p={1}
                            _hover={{ bg: 'rgba(0, 0, 0, 0.7)' }}
                            onClick={goToNext}
                        >
                            <ChevronRight />
                        </Box>
                    </>
                )}

                {/* Caption */}
                {currentSlide.caption && (
                    <Box
                        position="absolute"
                        bottom={0}
                        left={0}
                        right={0}
                        bg="rgba(0, 0, 0, 0.7)"
                        p={3}
                    >
                        <Text color="white" fontSize="sm" textAlign="center">
                            {currentSlide.caption}
                        </Text>
                    </Box>
                )}

                {/* Slide Counter */}
                <Box
                    position="absolute"
                    top={2}
                    right={2}
                    bg="rgba(0, 0, 0, 0.6)"
                    px={2}
                    py={1}
                    borderRadius="md"
                >
                    <Text color="white" fontSize="xs">
                        {currentIndex + 1} / {slides.length}
                    </Text>
                </Box>
            </Box>

            {/* Dot Indicators */}
            {showDots && slides.length > 1 && (
                <HStack justifyContent="center" mt={2} gap={2}>
                    {slides.map((_: any, index: number) => (
                        <Box
                            key={index}
                            width="8px"
                            height="8px"
                            borderRadius="50%"
                            bg={index === currentIndex ? 'blue.500' : 'gray.300'}
                            cursor={readonly ? 'pointer' : 'default'}
                            onClick={() => readonly && goToSlide(index)}
                            transition="background-color 0.2s"
                            _hover={readonly ? { bg: index === currentIndex ? 'blue.600' : 'gray.400' } : {}}
                        />
                    ))}
                </HStack>
            )}
        </Box>
    );
};


