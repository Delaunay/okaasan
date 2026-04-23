import { FC, ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, type Location } from 'react-router-dom';
import { ColorModeButton } from "@/components/ui/color-mode"
import { IconButton, Box } from '@chakra-ui/react';
import { recipeAPI } from '../services/api';
import SidebarSection, { SidebarItem } from './SidebarSection';
import './Layout.css';

// Custom icon components
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
      // Add your home management features here
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
      // Add your home management features here
      { name: 'Taxes', href: '/tax' },
      { name: 'Retirement', href: '/retirement' }
    ]
  },
  {
    title: 'Health',
    href: '/health',
    items: [
      // Add your home management features here
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
      { name: 'API Tester', href: '/api-tester' },
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
      { name: 'Budget Sheet', href: '/scratch/budget-sheet' },
      { name: 'Print Cost', href: '/scratch/print-cost' },
    ]
  },
];

// Export static version for use in App.tsx
export const sidebarSections = getStaticSidebarSections();

const Layout: FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  // Use static sidebar sections (Content section will fetch its own items)
  const sidebarSections = getStaticSidebarSections();

  useEffect(() => {
    const path = location.pathname;
    for (const section of sidebarSections) {
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
  }, [location.pathname, sidebarSections]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Check if a section contains the active route or if we're on the section page itself
  const isSectionActive = (section: typeof sidebarSections[number]) => {
    // console.log(location.pathname, section)
    const itemPath = section.href.split('?')[0];

    // check if section has "isSelected", if so call that, if true return else continue
    if (typeof section.isSelected === 'function') {
      try {
        if (section.isSelected(location)) return true;
      } catch (err) {
        // Defensive: do not crash sidebar on error in isSelected
        console.error("Error in isSelected for section", section.title, err);
      }
    }

    // Check if we're on the section's main page
    if (location.pathname === itemPath) {
      return true;
    }

    // For sections with dynamic items (like Content), check if we're on a matching path
    // Content section items link to /article?id=..., so if we're on /article, Content is active
    if (section.title === 'Content' && location.pathname === '/article') {
      return true;
    }

    // Check if we're on one of the section's items (need to handle query params)
    return section.items.some(item => {
      const itemPath = item.href.split('?')[0];
      const currentPath = location.pathname;
      const currentFullPath = location.pathname + location.search;

      // Exact match with query params
      if (currentFullPath === item.href) {
        return true;
      }

      // Path match without query params
      return currentPath === itemPath;
    });
  };

  // Determine if a section should be expanded
  const isSectionExpanded = (section: typeof sidebarSections[number]) => {
    return hoveredSection === section.title || isSectionActive(section);
  };

  return (
    <div className="layout" style={{ height: "100%", width: "100%" }}>
      {/* Mobile Menu Button */}
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

              {/* <br></br>
              (お)母さん */}
            </Link>
          </h2>
        </div>
        <nav className="sidebar-nav">
          {sidebarSections.map((section) => (
            <SidebarSection
              key={section.title}
              section={section}
              isExpanded={isSectionExpanded(section)}
              onMouseEnter={() => setHoveredSection(section.title)}
              onMouseLeave={() => setHoveredSection(null)}
              onItemClick={closeMobileMenu}
            />
          ))}
        </nav>
      </div>

      <div className="main-content" style={{ height: "100%", width: "100%" }}>
        <div className="content-wrapper" style={{ height: "100%", width: "100%" }}>
          {children}
        </div>
      </div>

      {/* Mobile Overlay */}
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
