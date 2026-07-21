import { FC, ReactNode, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useLocation, type Location } from 'react-router-dom';
import { ColorModeButton } from "@/components/ui/color-mode"
import { IconButton, Box, Flex } from '@chakra-ui/react';
import { Bug } from 'lucide-react';
import { recipeAPI, isStaticMode } from '../services/api';
import SidebarSection, { SidebarItem } from './SidebarSection';
import MusicPlayer from '../components/music/MusicPlayer';
import TaskStatusIndicator from '../components/tasks/TaskStatusIndicator';
import './Layout.css';

const GITHUB_REPO = 'https://github.com/Delaunay/okaasan';

const HamburgerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);


interface LayoutProps {
  children: ReactNode;
}


async function getArticles(): Promise<SidebarItem[]> {
  try {
    const articles = await recipeAPI.getLastAccessedArticles();
    const articleSection: SidebarItem[] = articles.map(article => ({
      name: article.title || 'Untitled',
      href: `/article?id=${article.id}`
    }))
    return articleSection;
  } catch (error) {
    console.error('Failed to fetch articles for sidebar:', error);
    return [];
  }
}

function getWeekDayItems(): SidebarItem[] {
  const items: SidebarItem[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = i === 0
      ? 'Today'
      : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    items.push({ name: label, href: `/day/${iso}` });
  }
  return items;
}

const getStaticSidebarSections = () => [
  {
    title: 'Home',
    href: '/',
    isSelected: (location: Location) => location.pathname === '/' || location.pathname.startsWith('/day/'),
    items: getWeekDayItems(),
  },
  {
    title: 'Feed',
    href: '/feed',
    isSelected: (location: Location) => location.pathname.startsWith('/feed'),
    items: [
      { name: 'Changes', href: '/feed' },
      { name: 'Report', href: '/feed?tab=report' },
    ],
  },
  {
    title: 'Cooking',
    href: '/cooking',
    items: [
      { name: 'Recipes', href: '/recipes' },
      { name: 'Meal Plan', href: '/planning' },
      { name: 'Ingredients', href: '/ingredients' },
      { name: 'Compare Recipes', href: '/compare' },
    ]
  },
  {
    title: 'Inventory & Shopping',
    href: '/inventory-shopping',
    items: [
      { name: 'Receipts', href: '/receipts' },
      { name: 'Pantry', href: '/pantry' },
      { name: 'Budget', href: '/budget' },
    ]
  },
  {
    title: 'Planning',
    href: '/planning-section',
    items: [
      { name: 'Calendar', href: '/calendar' },
      { name: 'Routine', href: '/routine' },
      { name: 'Tasks', href: '/tasks' },
    ]
  },
  {
    title: 'Home Management',
    href: '/home-management',
    items: [
      { name: 'Computers', href: '/computers' },
      { name: 'Home', href: '/home' },
      { name: 'Connected Devices', href: "/sensors" },
      { name: 'Alerts', href: "/alerts" },
      { name: 'AI', href: "/ai" }
    ]
  },
  {
    title: 'World News',
    href: '/news',
    isSelected: (location: Location) => location.pathname.startsWith('/news'),
    items: [],
  },
  {
    title: 'Socials',
    href: '/socials',
    isSelected: (location: Location) => location.pathname.startsWith('/socials'),
    items: [
      { name: 'Overview', href: '/socials' },
      { name: 'Instagram', href: '/socials/instagram' },
      { name: 'Facebook', href: '/socials/facebook' },
      { name: 'LinkedIn', href: '/socials/linkedin' },
    ],
  },
  {
    title: 'Downloads',
    href: '/torrents',
    isSelected: (location: Location) => location.pathname.startsWith('/torrents'),
    items: [
      { name: 'Discover', href: '/torrents/discover' },
      { name: 'DHT Crawler', href: '/torrents/crawler' },
    ],
  },
  {
    title: 'Money',
    href: '/investing',
    isSelected: (location: Location) => location.pathname.startsWith('/investing'),
    items: [
      { name: 'Overview', href: '/investing' },
      { name: 'Economics', href: '/investing/economics' },
      { name: 'Retirement', href: '/investing/retirement' },
      { name: 'Mortgage', href: '/investing/mortgage' },
      { name: 'Options', href: '/investing/options' },
      { name: 'Microstructure', href: '/investing/microstructure' },
      { name: 'Simulation', href: '/investing/simulation' },
    ]
  },
  {
    title: 'Health',
    href: '/health',
    isSelected: (location: Location) => location.pathname.startsWith('/health'),
    items: [
      { name: 'Dashboard', href: '/health/dashboard' },
      { name: 'Details', href: '/health/details' },
      { name: 'Activities', href: '/health/activities' },
    ]
  },
  {
    title: 'Shows & Movies',
    href: '/shows',
    isSelected: (location: Location) => location.pathname.startsWith('/shows'),
    items: [
      { name: 'Discover', href: '/shows/discover' },
      { name: 'Schedule', href: '/shows/schedule' },
      { name: 'Seen', href: '/shows/seen' },
      { name: 'Favorites', href: '/shows/favorites' },
      { name: 'History', href: '/shows/history' },
      { name: 'Watchlist', href: '/shows/watchlist' },
      { name: 'Stats', href: '/shows/stats' },
      { name: 'Collections', href: '/shows/collections' },
      { name: 'Library', href: '/shows/library' },
    ]
  },
  {
    title: 'Audiobooks',
    href: '/audiobooks',
    isSelected: (location: Location) => location.pathname.startsWith('/audiobooks'),
    items: [
      { name: 'Library', href: '/audiobooks/library' },
      { name: 'Stats', href: '/audiobooks/stats' },
    ]
  },
  {
    title: 'Music',
    href: '/music',
    isSelected: (location: Location) => location.pathname.startsWith('/music'),
    items: [
      { name: 'Discover', href: '/music/discover' },
      { name: 'Library', href: '/music/library' },
      { name: 'Playlists', href: '/music/playlists' },
      { name: 'Stats', href: '/music/stats' },
      { name: 'Schedule', href: '/music/schedule' },
    ]
  },
  {
    title: 'Retro Games',
    href: '/games',
    isSelected: (location: Location) => location.pathname.startsWith('/games'),
    items: [
      { name: 'Library', href: '/games/library' },
      { name: 'Stats', href: '/games/stats' },
    ]
  },
  {
    title: 'Podcasts',
    href: '/podcasts',
    isSelected: (location: Location) => location.pathname.startsWith('/podcasts'),
    items: [
      { name: 'Library', href: '/podcasts/library' },
      { name: 'Stats', href: '/podcasts/stats' },
    ]
  },
  {
    title: 'Books',
    href: '/books',
    isSelected: (location: Location) => location.pathname.startsWith('/books'),
    items: [
      { name: 'Library', href: '/books/library' },
      { name: 'Stats', href: '/books/stats' },
    ]
  },
  {
    title: 'Comics & Manga',
    href: '/comics',
    isSelected: (location: Location) => location.pathname.startsWith('/comics'),
    items: [
      { name: 'Library', href: '/comics/library' },
      { name: 'Stats', href: '/comics/stats' },
    ]
  },
  {
    title: 'Notes',
    href: '/content',
    isSelected: function (location: Location) {
      return location.pathname.startsWith("/content") || location.pathname.startsWith("/article")
    },
    items: [],
    fetch: getArticles
  },
  {
    title: 'Expense Tracker',
    href: '/expense-tracker',
    isSelected: (location: Location) => location.pathname.startsWith('/expense-tracker'),
    items: [
      { name: 'Entries', href: '/expense-tracker/entries' },
      { name: 'Summary', href: '/expense-tracker/summary' },
      { name: 'Tax Summary', href: '/expense-tracker/tax' },
      { name: 'Types', href: '/expense-tracker/types' },
      { name: 'From', href: '/expense-tracker/from' },
      { name: 'Bank', href: '/expense-tracker/bank' },
      { name: 'Details', href: '/expense-tracker/details' },
    ]
  },
  {
    title: 'Scratch',
    href: '/scratch',
    items: [
      { name: 'Code Visualization', href: '/scratch/code-viz' },
      { name: 'Article Blocks', href: '/scratch/article-blocks' },
      { name: 'Filament Math', href: '/scratch/filament-math' },
      { name: 'Wood Planner', href: '/scratch/wood-planner' },
      { name: 'Brainstorm', href: '/scratch/brainstorm' },
      { name: 'Print Cost', href: '/scratch/print-cost' },
      { name: 'PyTorch Wheels', href: '/scratch/pytorch-wheels' },
      { name: 'Machine Designer', href: '/scratch/machine-designer' },
      { name: 'Resource Cycle', href: '/scratch/resource-cycle' },
      { name: 'Climate Map', href: '/scratch/climate-map' },
    ]
  },
  {
    title: 'Units',
    href: '/units',
    items: [
      { name: 'Unit Conversions', href: '/conversions' },
      { name: 'Unit Manager', href: '/unit-manager' },
    ]
  },
  {
    title: 'Settings',
    href: '/settings-section',
    items: [
      { name: 'Settings', href: '/settings' },
      { name: 'Sidebar', href: '/settings/sidebar' },
      { name: 'Git Backup', href: '/settings/git' },
      { name: 'Google Calendar', href: '/settings/google-calendar' },
      { name: 'Software Update', href: '/settings/updates' },
      { name: 'Health', href: '/health/settings' },
      { name: 'Socials', href: '/settings/socials' },
      { name: 'Money', href: '/settings/investing' },
      { name: 'API Tester', href: '/api-tester' },
    ]
  },
];

// Export static version for use in App.tsx
export const sidebarSections = getStaticSidebarSections();

const STATIC_HIDDEN_SECTIONS = new Set(['Settings']);
const STATIC_HIDDEN_HREFS = new Set([
  '/settings/sidebar', '/settings/git', '/settings/google-calendar', '/settings/updates', '/api-tester',
  '/shows/discover', '/shows/schedule', '/shows/watchlist', '/shows/collections', '/shows/library', '/shows/history',
  '/music/discover', '/music/schedule',
  '/torrents',
]);
const DYNAMIC_HIDDEN_HREFS = new Set([
  '/shows/seen', '/shows/favorites',
]);

export function getRouteSections() {
  const all = getStaticSidebarSections();
  if (!isStaticMode()) {
    return all.map(s => ({
      ...s,
      items: s.items.filter((item: { href: string }) => !DYNAMIC_HIDDEN_HREFS.has(item.href)),
    }));
  }
  return all
    .filter(s => !STATIC_HIDDEN_SECTIONS.has(s.title))
    .map(s => ({
      ...s,
      items: s.items.filter((item: { href: string }) =>
        !STATIC_HIDDEN_HREFS.has(item.href) &&
        !(s.title === 'Home' && item.href.startsWith('/day/'))
      ),
    }));
}

// Sections that should never be hidden (Settings stays visible only in dynamic mode)
const ALWAYS_VISIBLE = new Set(['Home']);

const Layout: FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set());

  const allSections = getStaticSidebarSections();

  const MEDIA_SECTIONS = new Set([
    'Shows & Movies', 'Music', 'Audiobooks', 'Podcasts', 'Books', 'Comics & Manga', 'Retro Games',
  ]);

  const fetchSidebarConfig = useCallback(async () => {
    try {
      const data = await recipeAPI.getSidebar();
      const configuredMedia = new Set(data.configured_media || []);
      const unconfigured = [...MEDIA_SECTIONS].filter(s => !configuredMedia.has(s));
      const mergedSections = new Set([
        ...(data.hidden || []),
        ...unconfigured,
        ...(isStaticMode() ? (data.static_hidden || []) : []),
      ]);
      const mergedItems = new Set([
        ...(data.hidden_items || []),
        ...(isStaticMode() ? (data.static_hidden_items || []) : []),
      ]);
      setHiddenSections(mergedSections);
      setHiddenItems(mergedItems);
    } catch { /* use defaults — show everything */ }
  }, []);

  useEffect(() => { fetchSidebarConfig(); }, [fetchSidebarConfig]);

  useEffect(() => {
    const handler = () => fetchSidebarConfig();
    window.addEventListener('sidebar-config-changed', handler);
    return () => window.removeEventListener('sidebar-config-changed', handler);
  }, [fetchSidebarConfig]);

  const visibleSections = useMemo(() => {
    const filtered = allSections.filter(s => {
      if (isStaticMode() && STATIC_HIDDEN_SECTIONS.has(s.title)) return false;
      const alwaysShow = ALWAYS_VISIBLE.has(s.title) || (!isStaticMode() && s.title === 'Settings');
      return alwaysShow || !hiddenSections.has(s.title);
    });

    return filtered.map(s => {
      let items = s.items.filter((item: { href: string }) => {
        if (hiddenItems.has(item.href)) return false;
        if (!isStaticMode() && DYNAMIC_HIDDEN_HREFS.has(item.href)) return false;
        if (isStaticMode() && STATIC_HIDDEN_HREFS.has(item.href)) return false;
        return true;
      });
      if (isStaticMode() && s.title === 'Home') {
        items = items.filter((item: { href: string }) => !item.href.startsWith('/day/'));
      }
      return Object.assign({}, s, { items });
    });
  }, [hiddenSections, hiddenItems]);

  useEffect(() => {
    const path = location.pathname;
    for (const section of visibleSections) {
      if (section.href === path && section.items.length === 0) {
        document.title = section.title;
        return;
      }
      for (const item of section.items) {
        if (item.href === path || (item.href.includes('?') && path === item.href.split('?')[0])) {
          document.title = item.name;
          return;
        }
      }
    }
    if (path === '/') {
      document.title = 'Home';
    }
  }, [location.pathname, visibleSections]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const isSectionActive = (section: typeof allSections[number]) => {
    const itemPath = section.href.split('?')[0];

    if (typeof section.isSelected === 'function') {
      try {
        if (section.isSelected(location)) return true;
      } catch (err) {
        console.error("Error in isSelected for section", section.title, err);
      }
    }

    if (location.pathname === itemPath) {
      return true;
    }

    if (section.title === 'Content' && location.pathname === '/article') {
      return true;
    }

    return section.items.some(item => {
      const itemPath = item.href.split('?')[0];
      const currentPath = location.pathname;
      const currentFullPath = location.pathname + location.search;

      if (currentFullPath === item.href) {
        return true;
      }

      return currentPath === itemPath;
    });
  };

  const isSectionExpanded = (section: typeof allSections[number]) => {
    return hoveredSection === section.title || isSectionActive(section);
  };

  const mobileMenuAnchorRef = useRef<HTMLDivElement>(null);
  const [menuButtonFloating, setMenuButtonFloating] = useState(false);

  useEffect(() => {
    const el = mobileMenuAnchorRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setMenuButtonFloating(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="layout" style={{ height: "100%", width: "100%" }}>
      {menuButtonFloating && (
        <Box
          position="fixed"
          bottom={4}
          left={4}
          zIndex={1001}
          display={{ base: 'block', md: 'none' }}
        >
          <IconButton
            aria-label="Toggle menu"
            onClick={toggleMobileMenu}
            colorPalette="orange"
            variant="solid"
            size="lg"
            borderRadius="full"
            boxShadow="lg"
          >
            {isMobileMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
          </IconButton>
        </Box>
      )}

      <div className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">
            <ColorModeButton />
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }} onClick={closeMobileMenu}>
              (O)KaaSan
            </Link>
          </h2>
        </div>
        <nav className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {visibleSections.map((section) => (
              <SidebarSection
                key={section.title}
                section={section}
                isExpanded={isSectionExpanded(section)}
                onMouseEnter={() => {
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = setTimeout(() => setHoveredSection(section.title), 250);
                }}
                onMouseLeave={() => {
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = null;
                  setHoveredSection(null);
                }}
                onItemClick={closeMobileMenu}
              />
            ))}
          </div>

          <MusicPlayer />
          <TaskStatusIndicator />
          <div className="nav-section" style={{ borderTop: '1px solid var(--chakra-colors-border)', paddingTop: '0.5rem' }}>
            <a
              href="#"
              className="nav-section-title"
              onClick={async (e) => {
                e.preventDefault();
                closeMobileMenu();

                let serverInfo = '(could not fetch)';
                try {
                  const info = await recipeAPI.request<any>('/debug-info');
                  serverInfo = [
                    `Version: ${info.version}`,
                    `Git: ${info.git_branch}@${info.git_commit}`,
                    `Python: ${info.python?.version} (${info.python?.implementation})`,
                    `OS: ${info.system?.os} ${info.system?.os_version} (${info.system?.arch})`,
                    `Host: ${info.system?.hostname}`,
                    `DB size: ${info.server?.db_size}`,
                  ].join('\n');
                } catch {}

                const frontendInfo = [
                  `URL: ${window.location.href}`,
                  `Route: ${window.location.hash}`,
                  `Viewport: ${window.innerWidth}x${window.innerHeight}`,
                  `User-Agent: ${navigator.userAgent}`,
                  `Static mode: ${isStaticMode()}`,
                  `Timestamp: ${new Date().toISOString()}`,
                ].join('\n');

                const body = [
                  '## Description',
                  '',
                  '<!-- Describe the bug here -->',
                  '',
                  '## Steps to Reproduce',
                  '',
                  '1. ',
                  '',
                  '## Expected Behavior',
                  '',
                  '',
                  '## Environment',
                  '',
                  '### Frontend',
                  '```',
                  frontendInfo,
                  '```',
                  '',
                  '### Server',
                  '```',
                  serverInfo,
                  '```',
                ].join('\n');

                const params = new URLSearchParams({
                  labels: 'bug',
                  title: 'Bug Report',
                  body,
                });
                window.open(`${GITHUB_REPO}/issues/new?${params.toString()}`, '_blank');
              }}
            >
              <Flex align="center" gap={2}><Bug size={16} /> Report a Bug</Flex>
            </a>
          </div>
        </nav>
      </div>

      <div className="main-content">
        <div className="content-wrapper">
          <Flex
            ref={mobileMenuAnchorRef}
            display={{ base: 'flex', md: 'none' }}
            align="center"
            gap={2}
            mb={1}
          >
            {!menuButtonFloating && (
              <IconButton
                aria-label="Toggle menu"
                onClick={toggleMobileMenu}
                colorPalette="orange"
                variant="ghost"
                size="xs"
              >
                {isMobileMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
              </IconButton>
            )}
          </Flex>
          {children}
        </div>
      </div>

      {isMobileMenuOpen && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.600"
          zIndex={999}
          onClick={closeMobileMenu}
          display={{ base: 'block', md: 'none' }}
        />
      )}
    </div>
  );
};

export default Layout;
