import React, { useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

const ChevronDownIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
    </svg>
);

const ChevronRightIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
    </svg>
);

export const ToggleBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const title = block.data?.title || 'Click to reveal';
    const content = block.data?.content || '';
    const defaultOpen = block.data?.defaultOpen || false;

    const [isOpen, setIsOpen] = useState(defaultOpen);

    const toggleOpen = () => {
        if (!readonly) return;
        setIsOpen(!isOpen);
    };

    return (
        <Box mb={4} border="1px solid" borderColor="gray.200" borderRadius="md" overflow="hidden">
            <Box
                px={4}
                py={3}
                bg={isOpen ? 'gray.50' : 'white'}
                cursor={readonly ? 'pointer' : 'default'}
                _hover={readonly ? { bg: 'gray.50' } : {}}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                onClick={toggleOpen}
                transition="background-color 0.15s"
            >
                <Text fontWeight="600" color="gray.800" fontSize="sm">
                    {title}
                </Text>
                <Box color="gray.500" transition="transform 0.2s">
                    {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </Box>
            </Box>

            {isOpen && (
                <Box
                    px={4}
                    py={3}
                    bg="bg"
                    borderTop="1px solid"
                    borderColor="gray.100"
                >
                    <Text fontSize="sm" color="gray.700" whiteSpace="pre-wrap" lineHeight="1.6">
                        {content}
                    </Text>
                </Box>
            )}
        </Box>
    );
};


