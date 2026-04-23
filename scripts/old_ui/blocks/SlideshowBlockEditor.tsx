import React from 'react';
import { VStack, HStack, Box, Text, Input, Button, IconButton } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

const DeleteIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
    </svg>
);

export const SlideshowBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const slides = block.data?.slides || [];
    const autoPlay = block.data?.autoPlay || false;
    const interval = block.data?.interval || 3000;
    const showDots = block.data?.showDots !== false;

    const addSlide = () => {
        onChange('slides', [...slides, { url: '', caption: '' }]);
    };

    const updateSlide = (index: number, field: 'url' | 'caption', value: string) => {
        const newSlides = slides.map((slide: any, i: number) =>
            i === index ? { ...slide, [field]: value } : slide
        );
        onChange('slides', newSlides);
    };

    const deleteSlide = (index: number) => {
        onChange('slides', slides.filter((_: any, i: number) => i !== index));
    };

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <HStack justifyContent="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="600">
                        Slides
                    </Text>
                    <Button size="xs" onClick={addSlide} variant="outline" colorScheme="blue">
                        Add Slide
                    </Button>
                </HStack>

                {slides.length === 0 ? (
                    <Text fontSize="sm" color="gray.500" fontStyle="italic">
                        No slides yet. Click "Add Slide" to create one.
                    </Text>
                ) : (
                    <VStack gap={2} align="stretch">
                        {slides.map((slide: any, index: number) => (
                            <Box
                                key={index}
                                p={2}
                                border="1px solid"
                                borderColor="gray.200"
                                borderRadius="md"
                                bg="gray.50"
                            >
                                <HStack gap={2} mb={2} justifyContent="space-between">
                                    <Text fontSize="xs" fontWeight="bold" color="gray.600">
                                        Slide {index + 1}
                                    </Text>
                                    <IconButton
                                        aria-label="Delete"
                                        size="xs"
                                        variant="ghost"
                                        colorScheme="red"
                                        onClick={() => deleteSlide(index)}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </HStack>
                                <VStack gap={2} align="stretch">
                                    <Input
                                        size="sm"
                                        value={slide.url}
                                        onChange={(e) => updateSlide(index, 'url', e.target.value)}
                                        placeholder="Image URL"
                                    />
                                    <Input
                                        size="sm"
                                        value={slide.caption || ''}
                                        onChange={(e) => updateSlide(index, 'caption', e.target.value)}
                                        placeholder="Caption (optional)"
                                    />
                                </VStack>
                            </Box>
                        ))}
                    </VStack>
                )}
            </Box>

            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Interval (ms)
                    </Text>
                    <Input
                        size="sm"
                        type="number"
                        value={interval}
                        onChange={(e) => onChange('interval', parseInt(e.target.value) || 3000)}
                        placeholder="3000"
                    />
                </Box>
                <Box flex={1} display="flex" flexDirection="column" justifyContent="flex-end">
                    <HStack gap={2}>
                        <Button
                            size="xs"
                            onClick={() => onChange('autoPlay', !autoPlay)}
                            variant={autoPlay ? 'solid' : 'outline'}
                            colorScheme="green"
                        >
                            Auto-play
                        </Button>
                        <Button
                            size="xs"
                            onClick={() => onChange('showDots', !showDots)}
                            variant={showDots ? 'solid' : 'outline'}
                            colorScheme="blue"
                        >
                            Dots
                        </Button>
                    </HStack>
                </Box>
            </HStack>

            <Text fontSize="xs" color="gray.500">
                Image carousel with navigation arrows and optional auto-play.
            </Text>
        </VStack>
    );
};


