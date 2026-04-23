import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const EmbedBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const url = block.data?.url || '';
    const type = block.data?.type || 'auto'; // auto, youtube, vimeo, twitter, codepen
    const caption = block.data?.caption;
    const aspectRatio = block.data?.aspectRatio || '16/9';

    // Extract video ID from URL
    const getEmbedUrl = () => {
        if (!url) return '';

        // YouTube
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const videoId = url.includes('youtu.be')
                ? url.split('youtu.be/')[1]?.split('?')[0]
                : new URLSearchParams(new URL(url).search).get('v');
            return `https://www.youtube.com/embed/${videoId}`;
        }

        // Vimeo
        if (url.includes('vimeo.com')) {
            const videoId = url.split('vimeo.com/')[1]?.split('?')[0];
            return `https://player.vimeo.com/video/${videoId}`;
        }

        // CodePen
        if (url.includes('codepen.io')) {
            return url.replace('/pen/', '/embed/');
        }

        // Twitter
        if (url.includes('twitter.com') || url.includes('x.com')) {
            // Twitter embeds require their widget script, just link for now
            return url;
        }

        // Default: return as-is
        return url;
    };

    const embedUrl = getEmbedUrl();
    const isTwitter = url.includes('twitter.com') || url.includes('x.com');

    if (isTwitter) {
        return (
            <Box mb={4}>
                {caption && (
                    <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                        {caption}
                    </Text>
                )}
                <Box p={4} border="1px solid" borderColor="gray.200" borderRadius="md">
                    <Text fontSize="sm" color="gray.600">
                        Twitter embed:{' '}
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#3182ce', textDecoration: 'underline' }}>
                            View Tweet
                        </a>
                    </Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box mb={4}>
            {caption && (
                <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                    {caption}
                </Text>
            )}
            <Box
                position="relative"
                paddingBottom={aspectRatio === '16/9' ? '56.25%' : aspectRatio === '4/3' ? '75%' : '50%'}
                height={0}
                overflow="hidden"
                borderRadius="md"
            >
                <iframe
                    src={embedUrl}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        border: 0
                    }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </Box>
        </Box>
    );
};


