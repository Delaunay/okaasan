import { FC, ReactNode, useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, type Location } from 'react-router-dom';
import { ColorModeButton } from "@/components/ui/color-mode"
import { IconButton, Box, Flex } from '@chakra-ui/react';
import { Bug } from 'lucide-react';
import { recipeAPI, isStaticMode } from '../services/api';
import SidebarSection, { SidebarItem } from './SidebarSection';
import './Layout.css';

const API = import.meta.env.VITE_API_URL ?? '/api';
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

const getStaticSidebarSections = () => [
  {
    title: 'Home',
    href: '/',
    items: []
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
      { name: 'Projects', href: '/projects' },
    ]
  },
  {
    title: 'Home Management',
    href: '/home-management',
    items: [
      { name: 'Computers', href: '/computers' },
      { name: 'Home', href: '/home' },
      { name: 'Sensors', href: "/sensors"},
      { name: 'Switches', href: "/switches"},
      { name: 'AI', href: "/ai"}
    ]
  },
  {
    title: 'Investing',
    href: '/investing',
    items: [
      { name: 'Taxes', href: '/tax' },
      { name: 'Retirement', href: '/retirement' }
    ]
  },
  {
    title: 'Health',
    href: '/health',
    items: []
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
      { name: 'Software Update', href: '/settings/updates' },
      { name: 'API Tester', href: '/api-tester' },
    ]
  },
];

// Export static version for use in App.tsx
export const sidebarSections = getStaticSidebarSections();

// Sections that should never be hidden
const ALWAYS_VISIBLE = new Set(['Home', 'Settings']);

const Layout: FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());

  const allSections = getStaticSidebarSections();

  const fetchSidebarConfig = useCallback(async () => {
    try {
      const url = isStaticMode()
        ? `${API}/api/sidebar.json`
        : `${API}/api/sidebar`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const merged = new Set([
          ...(data.hidden || []),
          ...(isStaticMode() ? (data.static_hidden || []) : []),
        ]);
        setHiddenSections(merged);
      }
    } catch { /* use defaults — show everything */ }
  }, []);

  useEffect(() => { fetchSidebarConfig(); }, [fetchSidebarConfig]);

  useEffect(() => {
    const handler = () => fetchSidebarConfig();
    window.addEventListener('sidebar-config-changed', handler);
    return () => window.removeEventListener('sidebar-config-changed', handler);
  }, [fetchSidebarConfig]);

  const visibleSections = useMemo(
    () => allSections.filter(s => ALWAYS_VISIBLE.has(s.title) || !hiddenSections.has(s.title)),
    [hiddenSections]
  );

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

  return (
    <div className="layout" style={{ height: "100%", width: "100%" }}>
      <Box
        position="fixed"
        top={4}
        left={4}
        zIndex={1001}
        display={{ base: 'block', md: 'none' }}
      >
        <IconButton
          aria-label="Toggle menu"
          onClick={toggleMobileMenu}
          colorScheme="orange"
          size="lg"
          borderRadius="full"
          boxShadow="lg"
        >
          {isMobileMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
        </IconButton>
      </Box>

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
                onMouseEnter={() => setHoveredSection(section.title)}
                onMouseLeave={() => setHoveredSection(null)}
                onItemClick={closeMobileMenu}
              />
            ))}
          </div>

          <div className="nav-section" style={{ borderTop: '1px solid var(--chakra-colors-border)', paddingTop: '0.5rem' }}>
            <a
              href={`${GITHUB_REPO}/issues/new?labels=bug&title=Bug+Report`}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-section-title"
              onClick={closeMobileMenu}
            >
              <Flex align="center" gap={2}><Bug size={16} /> Report a Bug</Flex>
            </a>
          </div>
        </nav>
      </div>

      <div className="main-content" style={{ height: "100%", width: "100%" }}>
        <div className="content-wrapper" style={{ height: "100%", width: "100%" }}>
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
