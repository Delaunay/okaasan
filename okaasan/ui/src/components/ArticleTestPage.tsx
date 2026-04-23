import React from 'react';
import Article from './article/article';
import comprehensiveArticle from '../mock/ArticleMockData';


const testArticle = {
    id: 1,
    root_id: 1,
    parent: 0,
    title: 'Test Article',
    namespace: 'test',
    tags: {},
    extension: {},
    blocks: [
        {
            id: 1,
            page_id: 1,
            parent: 0,
            kind: 'heading',
            data: { level: 1, text: 'Hello World' },
            extension: {},
            children: []
        },
        {
            id: 2,
            page_id: 1,
            parent: 0,
            kind: 'paragraph',
            data: { text: 'This is a test article for the new Article editor.' },
            extension: {},
            children: []
        }
    ]
};

const ArticleTestPage: React.FC = () => {
    return (
        <Article article={comprehensiveArticle.comprehensive} />
    );
};

export default ArticleTestPage;
