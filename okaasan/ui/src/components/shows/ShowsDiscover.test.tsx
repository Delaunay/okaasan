import { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import ShowsDiscover from './ShowsDiscover';
import { recipeAPI } from '../../services/api';

const CACHE_KEY = 'shows_discover_state';
const system = createSystem(defaultConfig);

// jsdom has no IntersectionObserver — ShowsDiscover only uses it for
// infinite-scroll, which these tests don't exercise.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = MockIntersectionObserver;

function renderDiscover() {
  return render(
    <StrictMode>
      <ChakraProvider value={system}>
        <MemoryRouter>
          <ShowsDiscover />
        </MemoryRouter>
      </ChakraProvider>
    </StrictMode>
  );
}

describe('ShowsDiscover — cache-on-return', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test('a matching cache is not discarded by a refetch, even under StrictMode double-invoke', async () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      items: [{ id: 1, title: 'Cached Movie', poster_path: null, overview: '', vote_average: 5, media_type: 'movie' }],
      category: 'trending',
      mediaFilter: 'all',
      searchQuery: '',
      page: 1,
      hasMore: true,
      scrollY: 0,
    }));

    const requestSpy = vi.spyOn(recipeAPI, 'request').mockImplementation((endpoint: any) => {
      if (endpoint === '/shows/watched-tmdb-ids') return Promise.resolve({ ids: {} });
      if (endpoint === '/shows/watchlist') return Promise.resolve([]);
      return Promise.resolve({ results: [], total_pages: 1 });
    });

    renderDiscover();

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith('/shows/watched-tmdb-ids');
    });
    // Give any stray async fetch a chance to fire before asserting it didn't.
    await new Promise((r) => setTimeout(r, 50));

    const trendingCalls = requestSpy.mock.calls.filter(([url]) => String(url).includes('/shows/discover/trending'));
    expect(trendingCalls).toHaveLength(0);
  });

  test('switching filters away and back still refetches (does not get stuck trusting a stale cache)', async () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      items: [{ id: 1, title: 'Cached Movie', poster_path: null, overview: '', vote_average: 5, media_type: 'movie' }],
      category: 'trending',
      mediaFilter: 'all',
      searchQuery: '',
      page: 1,
      hasMore: true,
      scrollY: 0,
    }));

    const requestSpy = vi.spyOn(recipeAPI, 'request').mockImplementation((endpoint: any) => {
      if (endpoint === '/shows/watched-tmdb-ids') return Promise.resolve({ ids: {} });
      if (endpoint === '/shows/watchlist') return Promise.resolve([]);
      return Promise.resolve({ results: [], total_pages: 1 });
    });

    const { getByText } = renderDiscover();

    // Sanity: the cache hit means no trending fetch yet.
    await new Promise((r) => setTimeout(r, 50));
    expect(requestSpy.mock.calls.filter(([u]) => String(u).includes('/shows/discover/trending'))).toHaveLength(0);

    // Switch to Popular, then back to Trending — both are real user actions
    // and should both hit the network, not silently reuse the old cache.
    getByText('Popular').click();
    await waitFor(() => {
      expect(requestSpy.mock.calls.some(([u]) => String(u).includes('/shows/discover/popular'))).toBe(true);
    });

    getByText('Trending').click();
    await waitFor(() => {
      expect(requestSpy.mock.calls.filter(([u]) => String(u).includes('/shows/discover/trending')).length).toBeGreaterThan(0);
    });
  });

  test('with no cache, it fetches trending normally', async () => {
    const requestSpy = vi.spyOn(recipeAPI, 'request').mockImplementation((endpoint: any) => {
      if (endpoint === '/shows/watched-tmdb-ids') return Promise.resolve({ ids: {} });
      if (endpoint === '/shows/watchlist') return Promise.resolve([]);
      return Promise.resolve({ results: [], total_pages: 1 });
    });

    renderDiscover();

    await waitFor(() => {
      const trendingCalls = requestSpy.mock.calls.filter(([url]) => String(url).includes('/shows/discover/trending'));
      expect(trendingCalls.length).toBeGreaterThan(0);
    });
  });
});
