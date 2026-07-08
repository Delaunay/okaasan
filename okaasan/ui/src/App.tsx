import { HashRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import {
  ChakraProvider,
  createSystem,
  defaultConfig
} from '@chakra-ui/react';
import { ColorModeProvider } from "@/components/ui/color-mode"
import Layout, { getRouteSections } from './layout/Layout';
import { isStaticMode } from './services/api';
import Home from './components/home/Home';
import StandaloneArticleView from './components/content/StandaloneArticleView';
import DayDetail from './components/home/DayDetail';
import RecipeList from './components/recipes/RecipeList';
import RecipeDetail from './components/recipes/RecipeDetail';
import CreateRecipe from './components/recipes/CreateRecipe';
import Ingredients from './components/recipes/Ingredients';
import IngredientDetail from './components/recipes/IngredientDetail';
import UnitConversions from './components/recipes/UnitConversions';
import UnitManager from './components/recipes/UnitManager';
import RecipeComparison from './components/recipes/RecipeComparison';
import Calendar from './components/calendar/Calendar';
import Routine from './components/tasks/Routine';
import Tasks from './components/tasks/Tasks';
import MealPlanning from './components/meal-planning/MealPlanning';
import WeeklyPrep from './components/meal-planning/WeeklyPrep';
import GroceryReceipts from './components/inventory/GroceryReceipts';
import Pantry from './components/inventory/Pantry';
import Budget from './components/budget/Budget';
import BudgetSheet from './components/budget/BudgetSheet';
import Settings from './components/settings/Settings';
import GitSettings from './components/settings/GitSettings';
import UpdateSettings from './components/settings/UpdateSettings';
import SidebarSettings from './components/settings/SidebarSettings';
import GoogleCalendarSettings from './components/settings/GoogleCalendarSettings';
import TMDBSettings from './components/settings/TMDBSettings';
import TraktSettings from './components/settings/TraktSettings';
import AniListSettings from './components/settings/AniListSettings';
import LibrarySettings from './components/settings/LibrarySettings';
import ApiTester from './components/ApiTester';
import HealthDashboard from './components/health/HealthDashboard';
import HealthSettings from './components/health/HealthSettings';
import HealthDetailView from './components/health/HealthDetailView';
import HealthActivities from './components/health/HealthActivities';
import ArticleTestPage from './components/content/ArticleTestPage';
import ArticleView from './components/content/ArticleView';
import FeedPage from './components/feed/FeedPage';
import SectionView from './components/content/SectionView';
import ContentView from './components/content/ContentView';
import ShowsOverview from './components/shows/ShowsOverview';
import ShowsHistory from './components/shows/ShowsHistory';
import ShowsSeen from './components/shows/ShowsSeen';
import ShowsFavorites from './components/shows/ShowsFavorites';
import ShowsWatchlist from './components/shows/ShowsWatchlist';
import ShowsStats from './components/shows/ShowsStats';
import ShowsCollections from './components/shows/ShowsCollections';
import ShowsDiscover from './components/shows/ShowsDiscover';
import ShowsSchedule from './components/shows/ShowsSchedule';
import ShowsDetail from './components/shows/ShowsDetail';
import ShowsLibrary from './components/shows/ShowsLibrary';
import GamesOverview from './components/games/GamesOverview';
import GamesLibrary from './components/games/GamesLibrary';
import GamesDetail from './components/games/GamesDetail';
import GamesStats from './components/games/GamesStats';
import GamesSettings from './components/settings/GamesSettings';
import BooksOverview from './components/books/BooksOverview';
import BooksLibrary from './components/books/BooksLibrary';
import BooksDetail from './components/books/BooksDetail';
import BooksStats from './components/books/BooksStats';
import BooksSettings from './components/settings/BooksSettings';
import ComicsOverview from './components/comics/ComicsOverview';
import ComicsLibrary from './components/comics/ComicsLibrary';
import ComicsDetail from './components/comics/ComicsDetail';
import ComicsStats from './components/comics/ComicsStats';
import ComicsSettings from './components/settings/ComicsSettings';
import PodcastsOverview from './components/podcasts/PodcastsOverview';
import PodcastsLibrary from './components/podcasts/PodcastsLibrary';
import PodcastsDetail from './components/podcasts/PodcastsDetail';
import PodcastsStats from './components/podcasts/PodcastsStats';
import PodcastsSettings from './components/settings/PodcastsSettings';
import AudiobooksOverview from './components/audiobooks/AudiobooksOverview';
import AudiobooksLibrary from './components/audiobooks/AudiobooksLibrary';
import AudiobooksDetail from './components/audiobooks/AudiobooksDetail';
import AudiobooksStats from './components/audiobooks/AudiobooksStats';
import AudiobooksSettings from './components/settings/AudiobooksSettings';
import MusicOverview from './components/music/MusicOverview';
import MusicDiscover from './components/music/MusicDiscover';
import MusicLibrary from './components/music/MusicLibrary';
import MusicPlaylists from './components/music/MusicPlaylists';
import MusicStats from './components/music/MusicStats';
import MusicSchedule from './components/music/MusicSchedule';
import MusicDetail from './components/music/MusicDetail';
import { MusicPlayerProvider } from './components/music/MusicPlayerContext';
import MusicSettings from './components/settings/MusicSettings';
import NewsOverview from './components/news/NewsOverview';
import SocialsOverview from './components/socials/SocialsOverview';
import SocialsPlatform from './components/socials/SocialsPlatform';
import SocialsItemDetail from './components/socials/SocialsItemDetail';
import SocialsSettings from './components/settings/SocialsSettings';
import InvestingOverview from './components/investing/InvestingOverview';
import TickerDetail from './components/investing/TickerDetail';
import EconomicsOverview from './components/investing/EconomicsOverview';
import RetirementPlanner from './components/investing/RetirementPlanner';
import MortgagePlanner from './components/investing/MortgagePlanner';
import OptionsPage from './components/investing/OptionsPage';
import MarketMicrostructure from './components/investing/MarketMicrostructure';
import MarketSimulation from './components/investing/MarketSimulation';
import InvestingSettings from './components/settings/InvestingSettings';
import TorrentsPage from './components/torrents/TorrentsPage';
import DiscoverPage from './components/torrents/DiscoverPage';
import CrawlerPage from './components/torrents/CrawlerPage';
import ComputersOverview from './components/computers/ComputersOverview';
import ComputerDetail from './components/computers/ComputerDetail';
import SmartHomePage from './components/smarthome/SmartHomePage';
import SensorsPage from './components/smarthome/SensorsPage';
import SensorDetailPage from './components/smarthome/SensorDetailPage';
import AlertsPage from './components/alerts/AlertsPage';
import CodeVisualization from './components/scratch/CodeVisualization';
import FilamentMath from './components/scratch/FilamentMath';
import WoodPlanner from './components/scratch/WoodPlanner';
import Brainstorm from './components/scratch/Brainstorm';
import PrintCostEstimator from './components/scratch/PrintCostEstimator';
import PyTorchWheels from './components/scratch/PyTorchWheels';
import MachineDesigner from './components/scratch/MachineDesigner';
import { BudgetProvider } from './services/BudgetContext';
import { Toaster } from './components/ui/toaster';
import './App.css';

function ExpenseTrackerRedirect() {
  const { tab } = useParams<{ tab: string }>();
  const year = localStorage.getItem('expense-tracker-year') || String(new Date().getFullYear());
  return <Navigate to={`/expense-tracker/${year}/${tab || 'entries'}`} replace />;
}

const system = createSystem(defaultConfig);

const sectionOverrides: Record<string, React.ReactNode> = {
  '/content': <ContentView />,
  '/shows': <ShowsOverview />,
  '/games': <GamesOverview />,
  '/books': <BooksOverview />,
  '/comics': <ComicsOverview />,
  '/podcasts': <PodcastsOverview />,
  '/audiobooks': <AudiobooksOverview />,
  '/music': <MusicOverview />,
  '/feed': <FeedPage />,
  '/news': <NewsOverview />,
  '/socials': <SocialsOverview />,
  '/investing': <InvestingOverview />,
  '/torrents': <TorrentsPage />,
};

function MainApp() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Section overview pages */}
        {getRouteSections().map((section) => (
          <Route
            key={section.href}
            path={section.href}
            element={sectionOverrides[section.href] ?? <SectionView title={section.title} items={section.items} />}
          />
        ))}

        {/* Individual pages */}
        <Route path="/day/:date" element={<DayDetail />} />
        <Route path="/recipes" element={<RecipeList />} />
        <Route path="/recipes/:identifier" element={<RecipeDetail />} />
        <Route path="/create" element={<CreateRecipe />} />
        <Route path="/receipts" element={<GroceryReceipts />} />
        <Route path="/pantry" element={<Pantry />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/planning" element={<WeeklyPrep />} />
        <Route path="/planning/detailed" element={<MealPlanning />} />
        <Route path="/planning/detailed/:planName" element={<MealPlanning />} />
        <Route path="/planning/:planName" element={<WeeklyPrep />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/routine" element={<Routine />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/:taskId" element={<Tasks />} />
        <Route path="/ingredients" element={<Ingredients />} />
        <Route path="/ingredients/:identifier" element={<IngredientDetail />} />
        <Route path="/conversions" element={<UnitConversions />} />
        <Route path="/unit-manager" element={<UnitManager />} />
        <Route path="/compare" element={<RecipeComparison />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/git" element={isStaticMode() ? <Navigate to="/settings" replace /> : <GitSettings />} />
        <Route path="/settings/updates" element={isStaticMode() ? <Navigate to="/settings" replace /> : <UpdateSettings />} />
        <Route path="/settings/sidebar" element={isStaticMode() ? <Navigate to="/settings" replace /> : <SidebarSettings />} />
        <Route path="/settings/google-calendar" element={isStaticMode() ? <Navigate to="/settings" replace /> : <GoogleCalendarSettings />} />
        <Route path="/settings/tmdb" element={isStaticMode() ? <Navigate to="/settings" replace /> : <TMDBSettings />} />
        <Route path="/settings/anilist" element={isStaticMode() ? <Navigate to="/settings" replace /> : <AniListSettings />} />
        <Route path="/settings/trakt" element={isStaticMode() ? <Navigate to="/settings" replace /> : <TraktSettings />} />
        <Route path="/settings/library" element={isStaticMode() ? <Navigate to="/settings" replace /> : <LibrarySettings />} />
        <Route path="/api-tester" element={isStaticMode() ? <Navigate to="/settings" replace /> : <ApiTester />} />
        <Route path="/article" element={<ArticleView />} />
        {/* Expense Tracker */}
        <Route path="/expense-tracker/:tab" element={<ExpenseTrackerRedirect />} />
        <Route path="/expense-tracker/:year/:tab" element={<BudgetProvider><BudgetSheet /></BudgetProvider>} />

        {/* Health */}
        <Route path="/health/dashboard" element={<HealthDashboard />} />
        <Route path="/health/details" element={<HealthDetailView />} />
        <Route path="/health/activities" element={<HealthActivities />} />
        <Route path="/health/settings" element={<HealthSettings />} />

        {/* Shows & Movies */}
        <Route path="/shows/overview" element={<ShowsOverview />} />
        <Route path="/shows/seen" element={<ShowsSeen />} />
        <Route path="/shows/history" element={<ShowsHistory />} />
        <Route path="/shows/favorites" element={<ShowsFavorites />} />
        <Route path="/shows/watchlist" element={<ShowsWatchlist />} />
        <Route path="/shows/stats" element={<ShowsStats />} />
        <Route path="/shows/collections" element={<ShowsCollections />} />
        <Route path="/shows/collections/:collectionId" element={<ShowsCollections />} />
        <Route path="/shows/discover" element={<ShowsDiscover />} />
        <Route path="/shows/schedule" element={<ShowsSchedule />} />
        <Route path="/shows/library" element={<ShowsLibrary />} />
        <Route path="/shows/detail/:mediaType/:tmdbId" element={<ShowsDetail />} />

        {/* Retro Games */}
        <Route path="/games/library" element={<GamesLibrary />} />
        <Route path="/games/detail/:id" element={<GamesDetail />} />
        <Route path="/games/stats" element={<GamesStats />} />
        <Route path="/settings/games" element={isStaticMode() ? <Navigate to="/settings" replace /> : <GamesSettings />} />

        {/* Comics & Manga */}
        <Route path="/comics/library" element={<ComicsLibrary />} />
        <Route path="/comics/detail/:id" element={<ComicsDetail />} />
        <Route path="/comics/stats" element={<ComicsStats />} />
        <Route path="/settings/comics" element={isStaticMode() ? <Navigate to="/settings" replace /> : <ComicsSettings />} />

        {/* Podcasts */}
        <Route path="/podcasts/library" element={<PodcastsLibrary />} />
        <Route path="/podcasts/detail/:id" element={<PodcastsDetail />} />
        <Route path="/podcasts/stats" element={<PodcastsStats />} />
        <Route path="/settings/podcasts" element={isStaticMode() ? <Navigate to="/settings" replace /> : <PodcastsSettings />} />

        {/* Books */}
        <Route path="/books/library" element={<BooksLibrary />} />
        <Route path="/books/detail/:id" element={<BooksDetail />} />
        <Route path="/books/stats" element={<BooksStats />} />
        <Route path="/settings/books" element={isStaticMode() ? <Navigate to="/settings" replace /> : <BooksSettings />} />

        {/* Audiobooks */}
        <Route path="/audiobooks/library" element={<AudiobooksLibrary />} />
        <Route path="/audiobooks/detail/:id" element={<AudiobooksDetail />} />
        <Route path="/audiobooks/stats" element={<AudiobooksStats />} />
        <Route path="/settings/audiobooks" element={isStaticMode() ? <Navigate to="/settings" replace /> : <AudiobooksSettings />} />

        {/* Music */}
        <Route path="/music/discover" element={<MusicDiscover />} />
        <Route path="/music/library" element={<MusicLibrary />} />
        <Route path="/music/playlists" element={<MusicPlaylists />} />
        <Route path="/music/playlists/:playlistId" element={<MusicPlaylists />} />
        <Route path="/music/stats" element={<MusicStats />} />
        <Route path="/music/schedule" element={<MusicSchedule />} />
        <Route path="/music/detail/:albumId" element={<MusicDetail />} />
        <Route path="/settings/music" element={isStaticMode() ? <Navigate to="/settings" replace /> : <MusicSettings />} />
        <Route path="/investing/economics" element={<EconomicsOverview />} />
        <Route path="/investing/retirement" element={<RetirementPlanner />} />
        <Route path="/investing/retirement/:scenario" element={<RetirementPlanner />} />
        <Route path="/investing/mortgage" element={<MortgagePlanner />} />
        <Route path="/investing/mortgage/:scenario" element={<MortgagePlanner />} />
        <Route path="/investing/options" element={<OptionsPage />} />
        <Route path="/investing/microstructure" element={<MarketMicrostructure />} />
        <Route path="/investing/simulation" element={<MarketSimulation />} />
        <Route path="/investing/:symbol" element={<TickerDetail />} />
        <Route path="/settings/investing" element={isStaticMode() ? <Navigate to="/settings" replace /> : <InvestingSettings />} />
        <Route path="/settings/socials" element={isStaticMode() ? <Navigate to="/settings" replace /> : <SocialsSettings />} />

        {/* Socials */}
        <Route path="/socials/:platform" element={<SocialsPlatform />} />
        <Route path="/socials/:platform/item/:itemId" element={<SocialsItemDetail />} />

        {/* Downloads */}
        <Route path="/torrents/discover" element={<DiscoverPage />} />
        <Route path="/torrents/crawler" element={<CrawlerPage />} />

        {/* Computers */}
        <Route path="/computers" element={<ComputersOverview />} />
        <Route path="/computers/:id" element={<ComputerDetail />} />

        {/* Smart Home */}
        <Route path="/home" element={<SmartHomePage />} />
        <Route path="/sensors" element={<SensorsPage />} />
        <Route path="/sensors/:id" element={<SensorDetailPage />} />

        {/* Alerts */}
        <Route path="/alerts" element={<AlertsPage />} />

        <Route path="/scratch/code-viz" element={<CodeVisualization />} />
        <Route path="/scratch/filament-math" element={<FilamentMath />} />
        <Route path="/scratch/wood-planner" element={<WoodPlanner />} />
        <Route path="/scratch/wood-planner/:project" element={<WoodPlanner />} />
        <Route path="/scratch/brainstorm" element={<Brainstorm />} />
        <Route path="/scratch/brainstorm/:project" element={<Brainstorm />} />
        <Route path="/scratch/print-cost" element={<PrintCostEstimator />} />
        <Route path="/scratch/print-cost/:project" element={<PrintCostEstimator />} />
        <Route path="/scratch/pytorch-wheels" element={<PyTorchWheels />} />
        <Route path="/scratch/machine-designer" element={<MachineDesigner />} />

        {/* Test pages */}
        <Route path="/scratch/article-blocks" element={<ArticleTestPage />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <>
      <ChakraProvider value={system}>
        <ColorModeProvider>
          <Toaster />
          <Router>
            <MusicPlayerProvider>
              <Routes>
                <Route path="/share/article" element={<StandaloneArticleView />} />
                <Route path="/*" element={<MainApp />} />
              </Routes>
            </MusicPlayerProvider>
          </Router>
        </ColorModeProvider>
      </ChakraProvider>
    </>
  );
}

export default App;
