import { HashRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import {
  ChakraProvider,
  createSystem,
  defaultConfig
} from '@chakra-ui/react';
import { ColorModeProvider } from "@/components/ui/color-mode"
import Layout, { sidebarSections } from './layout/Layout';
import { isStaticMode } from './services/api';
import Home from './components/Home';
import DayDetail from './components/DayDetail';
import RecipeList from './components/RecipeList';
import RecipeDetail from './components/RecipeDetail';
import CreateRecipe from './components/CreateRecipe';
import Ingredients from './components/Ingredients';
import IngredientDetail from './components/IngredientDetail';
import UnitConversions from './components/UnitConversions';
import UnitManager from './components/UnitManager';
import Calendar from './components/Calendar';
import Routine from './components/Routine';
import Tasks from './components/Tasks';
import MealPlanning from './components/MealPlanning';
import GroceryReceipts from './components/GroceryReceipts';
import Pantry from './components/Pantry';
import Budget from './components/Budget';
import Settings from './components/Settings';
import GitSettings from './components/GitSettings';
import UpdateSettings from './components/UpdateSettings';
import SidebarSettings from './components/SidebarSettings';
import GoogleCalendarSettings from './components/GoogleCalendarSettings';
import RecipeComparison from './components/RecipeComparison';
import ApiTester from './components/ApiTester';
import ArticleTestPage from './components/ArticleTestPage';
import ArticleView from './components/ArticleView';
import SectionView from './components/SectionView';
import ContentView from './components/ContentView';
import CodeVisualization from './components/CodeVisualization';
import FilamentMath from './components/FilamentMath';
import WoodPlanner from './components/WoodPlanner';
import Brainstorm from './components/Brainstorm';
import BudgetSheet from './components/BudgetSheet';
import { BudgetProvider } from './services/BudgetContext';
import PrintCostEstimator from './components/PrintCostEstimator';
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
