import React from 'react';
import { VStack, HStack, Box, Text, Input, Button, IconButton } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

const DeleteIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
    </svg>
);

export const GalleryBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const images = block.data?.images || [];
    const columns = block.data?.columns || 3;
    const caption = block.data?.caption || '';

    const addImage = () => {
        const newImages = [...images, { url: '', alt: '' }];
        onChange('images', newImages);
    };

    const updateImage = (index: number, field: 'url' | 'alt', value: string) => {
        const newImages = images.map((img: any, i: number) =>
            i === index ? { ...img, [field]: value } : img
        );
        onChange('images', newImages);
    };

    const deleteImage = (index: number) => {
        const newImages = images.filter((_: any, i: number) => i !== index);
        onChange('images', newImages);
    };

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Caption (Optional)
                </Text>
                <Input
                    size="sm"
                    value={caption}
                    onChange={(e) => onChange('caption', e.target.value)}
                    placeholder="Gallery caption"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Columns
                </Text>
                <HStack gap={2}>
                    {[2, 3, 4, 5].map((col) => (
                        <Box
                            key={col}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={columns === col ? 'blue.500' : 'gray.200'}
                            bg={columns === col ? 'blue.50' : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('columns', col)}
                            fontSize="xs"
                        >
                            {col}
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Box>
                <HStack justifyContent="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="600">
                        Images
                    </Text>
                    <Button size="xs" onClick={addImage} variant="outline" colorScheme="blue">
                        Add Image
                    </Button>
                </HStack>

                {images.length === 0 ? (
                    <Text fontSize="sm" color="gray.500" fontStyle="italic">
                        No images yet. Click "Add Image" to add one.
                    </Text>
                ) : (
                    <VStack gap={2} align="stretch">
                        {images.map((img: any, index: number) => (
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
                                        Image {index + 1}
                                    </Text>
                                    <IconButton
                                        aria-label="Delete"
                                        size="xs"
                                        variant="ghost"
                                        colorScheme="red"
                                        onClick={() => deleteImage(index)}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </HStack>
                                <VStack gap={2} align="stretch">
                                    <Input
                                        size="sm"
                                        value={img.url}
                                        onChange={(e) => updateImage(index, 'url', e.target.value)}
                                        placeholder="Image URL"
                                    />
                                    <Input
                                        size="sm"
                                        value={img.alt || ''}
                                        onChange={(e) => updateImage(index, 'alt', e.target.value)}
                                        placeholder="Alt text (optional)"
                                    />
                                </VStack>
                            </Box>
                        ))}
                    </VStack>
                )}
            </Box>

            <Text fontSize="xs" color="gray.500">
                Grid gallery with lightbox view. Click images to view full size.
            </Text>
        </VStack>
    );
};


