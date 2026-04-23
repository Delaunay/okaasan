import React, { useRef } from 'react';
import { Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const TextBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const contentRef = useRef<HTMLParagraphElement>(null);

    const handleBlur = () => {
        if (contentRef.current && onUpdate) {
            const newText = contentRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, content: newText }
            });
        }
    };

    const content = block.data?.content || 'Text content';

    return (
        <Text
            ref={contentRef}
            mb={2}
            contentEditable={!readonly}
            suppressContentEditableWarning
            onBlur={handleBlur}
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
            {content}
        </Text>
    );
};


