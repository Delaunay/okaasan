import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
import { SubPageList } from '../src/components/article/subpages';
import { recipeAPI } from '../src/services/api';

// Create system for Chakra UI
const system = createSystem(defaultConfig);
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <ChakraProvider value={system}>
            <MemoryRouter>
                {children}
            </MemoryRouter>
        </ChakraProvider>
    );
};

// Mock API
vi.mock('../src/services/api', () => ({
    recipeAPI: {
        createChildArticle: vi.fn()
    }
}));

describe('SubPageList', () => {
    const mockArticleDef: any = {
        id: 1,
        title: 'Parent Page',
        namespace: 'wiki',
        children: []
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render empty state correctly', () => {
        const { getByText } = render(
            <TestWrapper>
                <SubPageList articleDef={mockArticleDef} />
            </TestWrapper>
        );

        expect(getByText('Parent Page')).toBeTruthy();
        expect(getByText('No sub-pages yet.')).toBeTruthy();
        expect(getByText('Add Page')).toBeTruthy();
    });

    it('should render existing child pages', () => {
        const articleWithChildren: any = {
            ...mockArticleDef,
            children: [
                { id: 101, title: 'Child Page 1', children: [] },
                { id: 102, title: 'Child Page 2', children: [] }
            ]
        };

        const { getByText } = render(
            <TestWrapper>
                <SubPageList articleDef={articleWithChildren} />
            </TestWrapper>
        );

        expect(getByText('Child Page 1')).toBeTruthy();
        expect(getByText('Child Page 2')).toBeTruthy();
        expect(screen.queryByText('No sub-pages yet.')).toBeNull();
    });

    it('should show input when Add Page is clicked', () => {
        const { getByText, getByPlaceholderText } = render(
            <TestWrapper>
                <SubPageList articleDef={mockArticleDef} />
            </TestWrapper>
        );

        fireEvent.click(getByText('Add Page'));

        expect(getByPlaceholderText('Page title')).toBeTruthy();
        expect(getByText('Create')).toBeTruthy();
        expect(getByText('Cancel')).toBeTruthy();
    });

    it('should create new child page', async () => {
        const newChild = { id: 103, title: 'New Child' };
        (recipeAPI.createChildArticle as any).mockResolvedValue(newChild);

        const { getByText, getByPlaceholderText } = render(
            <TestWrapper>
                <SubPageList articleDef={mockArticleDef} />
            </TestWrapper>
        );

        // Open input
        fireEvent.click(getByText('Add Page'));

        // Type title
        const input = getByPlaceholderText('Page title');
        fireEvent.change(input, { target: { value: 'New Child' } });

        // Click create
        fireEvent.click(getByText('Create'));

        // Verify API call
        expect(recipeAPI.createChildArticle).toHaveBeenCalledWith(1, expect.objectContaining({
            title: 'New Child',
            namespace: 'wiki'
        }));

        // Verify UI update
        await waitFor(() => {
            expect(getByText('New Child')).toBeTruthy();
        });

        // Input should be gone
        expect(screen.queryByPlaceholderText('Page title')).toBeNull();
    });
});
