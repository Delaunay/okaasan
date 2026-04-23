import React from 'react';
import { VStack, HStack, Box, Text, Input, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const ButtonBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const text = block.data?.text || 'Button';
    const url = block.data?.url || '';
    const variant = block.data?.variant || 'solid';
    const colorScheme = block.data?.colorScheme || 'blue';
    const size = block.data?.size || 'md';
    const openInNewTab = block.data?.openInNewTab !== false;

    const variants = ['solid', 'outline', 'ghost'];
    const colorSchemes = ['blue', 'green', 'red', 'orange', 'purple', 'teal', 'gray'];
    const sizes = ['xs', 'sm', 'md', 'lg'];

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Button Text
                </Text>
                <Input
                    size="sm"
                    value={text}
                    onChange={(e) => onChange('text', e.target.value)}
                    placeholder="Button label"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    URL/Link
                </Text>
                <Input
                    size="sm"
                    value={url}
                    onChange={(e) => onChange('url', e.target.value)}
                    placeholder="https://example.com"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Variant
                </Text>
                <HStack gap={2}>
                    {variants.map((v) => (
                        <Box
                            key={v}
                            px={3}
                            py={1}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={variant === v ? 'blue.500' : 'gray.200'}
                            bg={variant === v ? 'blue.50' : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('variant', v)}
                            fontSize="xs"
                        >
                            {v}
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Color
                </Text>
                <HStack gap={2} flexWrap="wrap">
                    {colorSchemes.map((color) => (
                        <Box
                            key={color}
                            px={2}
                            py={1}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={colorScheme === color ? `${color}.500` : 'gray.200'}
                            bg={colorScheme === color ? `${color}.50` : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('colorScheme', color)}
                            fontSize="xs"
                        >
                            {color}
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Size
                </Text>
                <HStack gap={2}>
                    {sizes.map((s) => (
                        <Box
                            key={s}
                            px={3}
                            py={1}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={size === s ? 'blue.500' : 'gray.200'}
                            bg={size === s ? 'blue.50' : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('size', s)}
                            fontSize="xs"
                        >
                            {s}
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Box>
                <Button
                    size="xs"
                    onClick={() => onChange('openInNewTab', !openInNewTab)}
                    variant={openInNewTab ? 'solid' : 'outline'}
                    colorScheme="green"
                >
                    {openInNewTab ? 'Opens in' : 'Opens in same'} new tab
                </Button>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Interactive button that links to external URLs or internal pages.
            </Text>
        </VStack>
    );
};


