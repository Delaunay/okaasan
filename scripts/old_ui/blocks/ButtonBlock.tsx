import React from 'react';
import { Box, Button as ChakraButton } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const ButtonBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const text = block.data?.text || 'Button';
    const url = block.data?.url || '';
    const variant = block.data?.variant || 'solid'; // solid, outline, ghost
    const colorScheme = block.data?.colorScheme || 'blue';
    const size = block.data?.size || 'md';
    const openInNewTab = block.data?.openInNewTab !== false;

    const handleClick = () => {
        if (readonly && url) {
            if (openInNewTab) {
                window.open(url, '_blank', 'noopener,noreferrer');
            } else {
                window.location.href = url;
            }
        }
    };

    return (
        <Box mb={4}>
            <ChakraButton
                variant={variant}
                colorScheme={colorScheme}
                size={size}
                onClick={handleClick}
                cursor={readonly && url ? 'pointer' : 'default'}
            >
                {text}
            </ChakraButton>
        </Box>
    );
};


