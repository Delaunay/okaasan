import { HashRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import {
  ChakraProvider,
  createSystem,
  defaultConfig
} from '@chakra-ui/react';
import { ColorModeProvider } from "@/components/ui/color-mode"
import Layout, { sidebarSections } from './layout/Layout';
import { isStaticMode } from './services/api';
import Home from './components/home/Home';
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
import GroceryReceipts from './components/inventory/GroceryReceipts';
import Pantry from './components/inventory/Pantry';
import Budget from './components/budget/Budget';
import BudgetSheet from './components/budget/BudgetSheet';
import Settings from './components/settings/Settings';
import GitSettings from './components/settings/GitSettings';
import UpdateSettings from './components/settings/UpdateSettings';
import SidebarSettings from './components/settings/SidebarSettings';
import GoogleCalendarSettings from './components/settings/GoogleCalendarSettings';
import ApiTester from './components/ApiTester';
import ArticleTestPage from './components/content/ArticleTestPage';
import ArticleView from './components/content/ArticleView';
import SectionView from './components/content/SectionView';
import ContentView from './components/content/ContentView';
import CodeVisualization from './components/scratch/CodeVisualization';
import FilamentMath from './components/scratch/FilamentMath';
import WoodPlanner from './components/scratch/WoodPlanner';
import Brainstorm from './components/scratch/Brainstorm';
import PrintCostEstimator from './components/scratch/PrintCostEstimator';
import { BudgetProvider } from './services/BudgetContext';
import { Toaster } from './components/ui/toaster';
import './App.css';

function ExpenseTrackerRedirect() {
  const { tab } = useParams<{ tab: string }>();
  const year = localStorage.getItem('expense-tracker-year') || String(new Date().getFullYear());
  return <Navigate to={`/expense-tracker/${year}/${tab || 'entries'}`} replace />;
}

const system = createSystem(defaultConfig);

function App() {
  return (
    <>
      <ChakraProvider value={system}>
        <ColorModeProvider>
          <Toaster />
          <Router>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />

                {/* Section overview pages */}
                {sidebarSections.map((section) => {
                  // Use custom ContentView for the Content section
                  if (section.href === '/content') {
                    return (
                      <Route
                        key={section.href}
                        path={section.href}
                        element={<ContentView />}
                      />
                    );
                  }
                  // Use default SectionView for all other sections
                  return (
                    <Route
                      key={section.href}
                      path={section.href}
                      element={<SectionView title={section.title} items={section.items} />}
                    />
                  );
                })}

                {/* Individual pages */}
                <Route path="/day/:date" element={<DayDetail />} />
                <Route path="/recipes" element={<RecipeList />} />
                <Route path="/recipes/:identifier" element={<RecipeDetail />} />
                <Route path="/create" element={<CreateRecipe />} />
                <Route path="/receipts" element={<GroceryReceipts />} />
                <Route path="/pantry" element={<Pantry />} />
                <Route path="/budget" element={<Budget />} />
                <Route path="/planning" element={<MealPlanning />} />
                <Route path="/planning/:planName" element={<MealPlanning />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/routine" element={<Routine />} />
                <Route path="/tasks" element={<Tasks />} />
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
                <Route path="/api-tester" element={isStaticMode() ? <Navigate to="/settings" replace /> : <ApiTester />} />
                <Route path="/article" element={<ArticleView />} />
                {/* Expense Tracker */}
                <Route path="/expense-tracker/:tab" element={<ExpenseTrackerRedirect />} />
                <Route path="/expense-tracker/:year/:tab" element={<BudgetProvider><BudgetSheet /></BudgetProvider>} />

                <Route path="/scratch/code-viz" element={<CodeVisualization />} />
                <Route path="/scratch/filament-math" element={<FilamentMath />} />
                <Route path="/scratch/wood-planner" element={<WoodPlanner />} />
                <Route path="/scratch/wood-planner/:project" element={<WoodPlanner />} />
                <Route path="/scratch/brainstorm" element={<Brainstorm />} />
                <Route path="/scratch/brainstorm/:project" element={<Brainstorm />} />
                <Route path="/scratch/print-cost" element={<PrintCostEstimator />} />
                <Route path="/scratch/print-cost/:project" element={<PrintCostEstimator />} />
  
                {/* Test pages */}
                <Route path="/scratch/article-blocks" element={<ArticleTestPage />} />
              </Routes>
            </Layout>
          </Router>
        </ColorModeProvider>
      </ChakraProvider>
    </>
  );
}

export default App;
