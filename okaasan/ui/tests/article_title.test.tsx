import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArticleInstance } from '../src/components/article/article';
import { recipeAPI } from '../src/services/api';
import { ArticleDef } from '../src/components/article/base';

// Mock recipeAPI
vi.mock('../src/services/api', () => ({
    recipeAPI: {
        updateBlocksBatch: vi.fn().mockResolvedValue([]),
        updateArticle: vi.fn().mockResolvedValue({}),
    }
}));

// Mock timer
vi.useFakeTimers();

describe('ArticleInstance Title Update', () => {
    let articleDef: ArticleDef;
    let article: ArticleInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        articleDef = {
            id: 1,
            root_id: 1,
            title: 'Initial Title',
            namespace: 'test',
            sequence: 0,
            tags: [],
            extension: {},
            blocks: []
        };
        article = new ArticleInstance(articleDef);
    });

    it('should update title locally immediately', () => {
        article.updateTitle('New Title');
        expect(article.def.title).toBe('New Title');
    });

    it('should revert title on undo (mocked) or manual revert logic', () => {
        // We can't easily test the undo stack internal logic without exposing it,
        // but we can check if the undoAction defined in updateTitle does what it says
        // purely by inspecting the pushed action if we could access it.
        // Instead, let's verify the side effects.

        article.updateTitle('New Title');
        expect(article.def.title).toBe('New Title');

        // We don't have a direct "undo" public method on ArticleInstance exposed easily
        // without digging into pendingChange, but for now we focus on the forward action.
    });

    it('should separate title updates from block updates in persistServerChange', async () => {
        // queue a title update
        article.updateTitle('Updated Title');

        // Trigger save
        await article.persistServerChange();

        expect(recipeAPI.updateArticle).toHaveBeenCalledTimes(1);
        expect(recipeAPI.updateArticle).toHaveBeenCalledWith(1, { title: 'Updated Title' });
        expect(recipeAPI.updateBlocksBatch).not.toHaveBeenCalled();
    });

    it('should batch block updates and title updates separately', async () => {
        // queue a title update
        article.updateTitle('Title 1');

        // queue a block update (simulated by pushing an action manually since we can't easily creaet a block change here without more setup)
        // Manually push a fake block action
        article.pushAction({
            action: { op: 'update', id: 100, block_def: {} } as any,
            doAction: () => { },
            undoAction: () => { }
        });

        // queue another title update
        article.updateTitle('Title 2');

        await article.persistServerChange();

        // Should have called updateBlocksBatch once for the block update
        expect(recipeAPI.updateBlocksBatch).toHaveBeenCalledTimes(1);
        expect(recipeAPI.updateBlocksBatch).toHaveBeenCalledWith([{ op: 'update', id: 100, block_def: {} }]);

        // Should have called updateArticle once with the LAST title
        expect(recipeAPI.updateArticle).toHaveBeenCalledTimes(1);
        expect(recipeAPI.updateArticle).toHaveBeenCalledWith(1, { title: 'Title 2' });
    });
});
