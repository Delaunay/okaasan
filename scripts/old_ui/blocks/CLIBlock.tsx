import React, { useState } from 'react';
import { Box, HStack, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

const CopyIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z" />
        <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z" />
    </svg>
);

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z" />
    </svg>
);

export const CLIBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const command = block.data?.command || '';
    const output = block.data?.output || '';
    const prompt = block.data?.prompt || '$';
    const language = block.data?.language || 'bash';

    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!readonly) return;
        try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <Box mb={4}>
            <Box bg="gray.900" borderRadius="md" overflow="hidden">
                {/* Command */}
                <Box
                    position="relative"
                    p={3}
                    fontFamily="monospace"
                    fontSize="sm"
                    bg="gray.800"
                >
                    <HStack gap={2} alignItems="flex-start">
                        <Text color="green.400" flexShrink={0} userSelect="none">
                            {prompt}
                        </Text>
                        <Text color="white" flex={1} whiteSpace="pre-wrap" wordBreak="break-word">
                            {command}
                        </Text>
                    </HStack>

                    {readonly && (
                        <Box
                            position="absolute"
                            top={2}
                            right={2}
                            p={1.5}
                            bg="gray.700"
                            borderRadius="md"
                            cursor="pointer"
                            _hover={{ bg: 'gray.600' }}
                            onClick={handleCopy}
                            color="gray.300"
                        >
                            {copied ? <CheckIcon /> : <CopyIcon />}
                        </Box>
                    )}
                </Box>

                {/* Output */}
                {output && (
                    <Box
                        p={3}
                        fontFamily="monospace"
                        fontSize="sm"
                        color="gray.300"
                        whiteSpace="pre-wrap"
                        wordBreak="break-word"
                    >
                        {output}
                    </Box>
                )}
            </Box>
        </Box>
    );
};


