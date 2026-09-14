import React from 'react';
import { Box } from '@chakra-ui/react';
import Article from '../article/article';
import { independenceArticles, IndependenceTopic } from './data';

interface IndependencePageProps {
    topic: IndependenceTopic;
}

const IndependencePage: React.FC<IndependencePageProps> = ({ topic }) => {
    return (
        <Box maxW="900px">
            <Article article={independenceArticles[topic]} options={{ editTrigger: 'click', readonly: true }} />
        </Box>
    );
};

export default IndependencePage;
