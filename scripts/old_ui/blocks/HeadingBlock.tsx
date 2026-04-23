import React, { useRef } from 'react';
import { Heading } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const HeadingBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const contentRef = useRef<HTMLHeadingElement>(null);

    const handleBlur = () => {
        if (contentRef.current && onUpdate) {
            const newText = contentRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, text: newText }
            });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            contentRef.current?.blur();
        }
    };

    const level = block.data?.level || 1;
    const text = block.data?.text || 'Heading';

    // Map level to Chakra fontSize
    const fontSizeMap: Record<number, string> = {
        1: '2xl',
        2: 'xl',
        3: 'lg',
        4: 'md',
        5: 'sm',
        6: 'xs'
    };

    return (
        <Heading
            ref={contentRef}
            fontSize={fontSizeMap[level] || 'xl'}
            mb={3}
            contentEditable={!readonly}
            suppressContentEditableWarning
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            css={
                !readonly
                    ? {
                        '&:focus': {
                            outline: '2px solid var(--chakra-colors-blue-400)',
                            outlineOffset: '2px'
                        }
                    }
                    : undefined
            }
        >
            {text}
        </Heading>
    );
};


