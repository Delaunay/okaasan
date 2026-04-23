import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

const InfoIcon = () => (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
        <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
    </svg>
);

const SuccessIcon = () => (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
        <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z" />
    </svg>
);

const WarningIcon = () => (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    </svg>
);

const ErrorIcon = () => (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
        <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z" />
    </svg>
);

type AlertType = 'info' | 'success' | 'warning' | 'error';

const alertStyles: Record<AlertType, { bg: string; border: string; icon: string; iconComponent: React.FC }> = {
    info: {
        bg: 'blue.50',
        border: 'blue.500',
        icon: 'blue.700',
        iconComponent: InfoIcon
    },
    success: {
        bg: 'green.50',
        border: 'green.500',
        icon: 'green.700',
        iconComponent: SuccessIcon
    },
    warning: {
        bg: 'orange.50',
        border: 'orange.500',
        icon: 'orange.700',
        iconComponent: WarningIcon
    },
    error: {
        bg: 'red.50',
        border: 'red.500',
        icon: 'red.700',
        iconComponent: ErrorIcon
    }
};

export const AlertBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const titleRef = React.useRef<HTMLParagraphElement>(null);
    const messageRef = React.useRef<HTMLParagraphElement>(null);

    const type = (block.data?.type || 'info') as AlertType;
    const title = block.data?.title;
    const message = block.data?.message || '';

    const style = alertStyles[type];
    const IconComponent = style.iconComponent;

    const handleTitleBlur = () => {
        if (titleRef.current && onUpdate) {
            const newTitle = titleRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, title: newTitle }
            });
        }
    };

    const handleMessageBlur = () => {
        if (messageRef.current && onUpdate) {
            const newMessage = messageRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, message: newMessage }
            });
        }
    };

    return (
        <Box
            mb={4}
            p={4}
            bg={style.bg}
            borderLeft="4px solid"
            borderLeftColor={style.border}
            borderRadius="md"
            display="flex"
            gap={3}
        >
            <Box color={style.icon} flexShrink={0} mt={0.5}>
                <IconComponent />
            </Box>
            <Box flex={1}>
                {title && (
                    <Text
                        ref={titleRef}
                        fontWeight="600"
                        fontSize="sm"
                        mb={1}
                        color="gray.800"
                        contentEditable={!readonly}
                        suppressContentEditableWarning
                        onBlur={handleTitleBlur}
                        css={
                            !readonly
                                ? {
                                    '&:focus': {
                                        outline: '2px solid var(--chakra-colors-blue-400)',
                                        outlineOffset: '2px',
                                        borderRadius: '4px'
                                    }
                                }
                                : undefined
                        }
                    >
                        {title}
                    </Text>
                )}
                <Text
                    ref={messageRef}
                    fontSize="sm"
                    color="gray.700"
                    whiteSpace="pre-wrap"
                    contentEditable={!readonly}
                    suppressContentEditableWarning
                    onBlur={handleMessageBlur}
                    css={
                        !readonly
                            ? {
                                '&:focus': {
                                    outline: '2px solid var(--chakra-colors-blue-400)',
                                    outlineOffset: '2px',
                                    borderRadius: '4px'
                                }
                            }
                            : undefined
                    }
                >
                    {message}
                </Text>
            </Box>
        </Box>
    );
};


