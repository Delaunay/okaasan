import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Box, Heading, Text, VStack, HStack, Flex, Badge,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle,
  CloudFog, CalendarDays, UtensilsCrossed, ChevronRight,
} from 'lucide-react';
import { recipeAPI, isStaticMode } from '../services/api';
import {
  formatDateRangeForServer, fromDateServer,
} from '../utils/dateUtils';
import type { MealPlan, PlannedMeal } from '../services/type';

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const WMO_CODES: Record<number, { label: string; icon: typeof Sun }> = {
  0: { label: 'Clear sky', icon: Sun },
  1: { label: 'Mainly clear', icon: Sun },
  2: { label: 'Partly cloudy', icon: Cloud },
  3: { label: 'Overcast', icon: Cloud },
  45: { label: 'Fog', icon: CloudFog },
  48: { label: 'Rime fog', icon: CloudFog },
  51: { label: 'Light drizzle', icon: CloudDrizzle },
  53: { label: 'Drizzle', icon: CloudDrizzle },
  55: { label: 'Dense drizzle', icon: CloudDrizzle },
  61: { label: 'Light rain', icon: CloudRain },
  63: { label: 'Rain', icon: CloudRain },
  65: { label: 'Heavy rain', icon: CloudRain },
  71: { label: 'Light snow', icon: CloudSnow },
  73: { label: 'Snow', icon: CloudSnow },
  75: { label: 'Heavy snow', icon: CloudSnow },
  80: { label: 'Rain showers', icon: CloudRain },
  81: { label: 'Heavy showers', icon: CloudRain },
  82: { label: 'Violent showers', icon: CloudRain },
  85: { label: 'Snow showers', icon: CloudSnow },
  86: { label: 'Heavy snow showers', icon: CloudSnow },
  95: { label: 'Thunderstorm', icon: CloudLightning },
  96: { label: 'Thunderstorm + hail', icon: CloudLightning },
  99: { label: 'Thunderstorm + heavy hail', icon: CloudLightning },
};

export function getWeatherInfo(code: number) {
  return WMO_CODES[code] || { label: `Code ${code}`, icon: Cloud };
}

export interface WeatherData {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    sunrise: string[];
    sunset: string[];
    precipitation_sum: number[];
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
  };
  current_units?: Record<string, string>;
}

// ── Helpers ──────────────────────────────────────────────────

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildWeek(): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

interface DayData {
  date: Date;
  iso: string;
  weatherCode?: number;
  tempMax?: number;
  tempMin?: number;
  events: { title: string; source: 'local' | 'google' }[];
  meals: PlannedMeal[];
}

// ── Day Summary Card ─────────────────────────────────────────

function DaySummaryCard({ day, cardBg, border, mutedText, isToday }: {
  day: DayData;
  cardBg: string;
  border: string;
  mutedText: string;
  isToday: boolean;
}) {
  const todayBorder = isToday ? 'blue.400' : border;
  const WeatherIcon = day.weatherCode != null ? getWeatherInfo(day.weatherCode).icon : null;
  const dayName = day.date.toLocaleDateString('en-US', { weekday: 'long' });
  const dateLabel = day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const mealTypeOrder: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };
  const sortedMeals = [...day.meals].sort((a, b) => (mealTypeOrder[a.mealType] ?? 9) - (mealTypeOrder[b.mealType] ?? 9));

  const mealTypeColor: Record<string, string> = {
    breakfast: 'yellow',
    lunch: 'green',
    dinner: 'purple',
  };

  return (
    <Link to={`/day/${day.iso}`} style={{ textDecoration: 'none' }}>
      <Box
        bg={cardBg}
        p={4}
        borderRadius="lg"
        border="2px solid"
        borderColor={todayBorder}
        cursor="pointer"
        transition="all 0.15s"
        _hover={{ boxShadow: 'md', transform: 'translateY(-1px)' }}
      >
        <Flex justify="space-between" align="center">
          <HStack gap={4} flex={1} minW={0} flexWrap="wrap">
            {/* Day + date */}
            <Box minW="130px">
              <HStack gap={2}>
                <Text fontWeight={isToday ? 'bold' : 'semibold'} fontSize="md">
                  {isToday ? 'Today' : dayName}
                </Text>
                {isToday && <Badge colorPalette="blue" variant="subtle" size="sm">Today</Badge>}
              </HStack>
              <Text fontSize="xs" color={mutedText}>{dateLabel}</Text>
            </Box>

            {/* Weather */}
            {WeatherIcon && day.tempMax != null && day.tempMin != null && (
              <HStack gap={2} minW="90px">
                <WeatherIcon size={18} />
                <Text fontSize="sm" fontWeight="medium">
                  {Math.round(day.tempMax)}° / {Math.round(day.tempMin)}°
                </Text>
              </HStack>
            )}

            {/* Events */}
            {day.events.length > 0 && (
              <HStack gap={1}>
                <CalendarDays size={14} />
                <Badge colorPalette="blue" variant="subtle" size="sm">
                  {day.events.length} event{day.events.length !== 1 ? 's' : ''}
                </Badge>
              </HStack>
            )}

            {/* Meals */}
            {sortedMeals.length > 0 && (
              <HStack gap={1} flexWrap="wrap">
                <UtensilsCrossed size={14} />
                {sortedMeals.map((m, i) => (
                  <Badge key={i} colorPalette={mealTypeColor[m.mealType] || 'gray'} variant="subtle" size="sm">
                    {m.recipeName}
                  </Badge>
                ))}
              </HStack>
            )}
          </HStack>

          <Box flexShrink={0} color={mutedText}>
            <ChevronRight size={18} />
          </Box>
        </Flex>
      </Box>
    </Link>
  );
}

// ── Home Page ─────────────────────────────────────────────────

const Home = () => {
  const cardBg = useColorModeValue('#f8f9fa', '#16213e');
  const border = useColorModeValue('#e2e8f0', '#2d3748');
  const mutedText = useColorModeValue('#718096', '#a0aec0');
  const _static = isStaticMode();

  const [days, setDays] = useState<DayData[]>([]);
  const [weatherError, setWeatherError] = useState('');

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  useEffect(() => {
    document.title = '(O)KaaSan - Home';
  }, []);

  useEffect(() => {
    if (_static) return;

    const week = buildWeek();
    const initialDays: DayData[] = week.map(d => ({
      date: d,
      iso: toISODate(d),
      events: [],
      meals: [],
    }));
    setDays(initialDays);

    const weekStart = formatDateRangeForServer(week[0], false);
    const weekEnd = formatDateRangeForServer(week[6], true);

    // Fetch weather
    (async () => {
      try {
        const loc = await recipeAPI.getWeatherLocation();
        if (!loc) { setWeatherError('no-location'); return; }
        const weather: WeatherData = await recipeAPI.getWeatherForecast(loc.lat, loc.lon, 7);
        if (weather.daily) {
          setDays(prev => prev.map((d, i) => ({
            ...d,
            weatherCode: weather.daily!.weather_code[i],
            tempMax: weather.daily!.temperature_2m_max[i],
            tempMin: weather.daily!.temperature_2m_min[i],
          })));
        }
      } catch {
        setWeatherError('error');
      }
    })();

    // Fetch local events for the 7-day range
    recipeAPI.getEvents(weekStart, weekEnd)
      .then(localEvents => {
        setDays(prev => prev.map(d => {
          const dayStr = d.date.toDateString();
          const matching = localEvents.filter(e => fromDateServer(e.datetime_start).toDateString() === dayStr);
          return {
            ...d,
            events: [
              ...d.events,
              ...matching.map(e => ({ title: e.title, source: 'local' as const })),
            ],
          };
        }));
      })
      .catch(() => {});

    // Fetch Google Calendar events
    recipeAPI.getGCalWeekEvents()
      .then(gcalEvents => {
        setDays(prev => prev.map(d => {
          const dayStr = d.date.toDateString();
          const matching = gcalEvents.filter((e: any) => {
            const start = e.datetime_start;
            return start && new Date(start).toDateString() === dayStr;
          });
          return {
            ...d,
            events: [
              ...d.events,
              ...matching.map((e: any) => ({ title: e.title, source: 'google' as const })),
            ],
          };
        }));
      })
      .catch(() => {});

    // Fetch meal plan
    (async () => {
      try {
        const names = await recipeAPI.getMealPlanNames();
        if (names.length === 0) return;
        const plan: MealPlan = await recipeAPI.loadMealPlan(names[names.length - 1]);
        setDays(prev => prev.map(d => {
          const dayOfWeek = DAYS[d.date.getDay()];
          const meals = plan.plannedMeals?.filter(m => m.day === dayOfWeek) || [];
          return { ...d, meals };
        }));
      } catch { /* no plan */ }
    })();
  }, [_static]);

  const todayStr = today.toDateString();

  return (
    <Box maxW="900px" mx="auto" p={4}>
      <Box mb={6}>
        <Heading size="xl" mb={1}>{dayName}</Heading>
        <Text fontSize="lg" color={mutedText}>{dateStr}</Text>
      </Box>

      {_static ? (
        <Box textAlign="center" py={8}>
          <Heading size="lg" mb={2} color="orange.500">Welcome to (O)KaaSan</Heading>
          <Text color={mutedText}>Use the sidebar to navigate.</Text>
        </Box>
      ) : (
        <VStack align="stretch" gap={3}>
          {weatherError === 'no-location' && (
            <Box bg={cardBg} p={4} borderRadius="lg" border="1px solid" borderColor={border}>
              <HStack gap={2}>
                <Cloud size={18} />
                <Text fontSize="sm" color={mutedText}>No weather location set.</Text>
                <Link to="/settings" style={{ textDecoration: 'none' }}>
                  <Text fontSize="sm" color="blue.400" fontWeight="medium">Set location in Settings →</Text>
                </Link>
              </HStack>
            </Box>
          )}

          {days.map(d => (
            <DaySummaryCard
              key={d.iso}
              day={d}
              cardBg={cardBg}
              border={border}
              mutedText={mutedText}
              isToday={d.date.toDateString() === todayStr}
            />
          ))}
        </VStack>
      )}
    </Box>
  );
};

export default Home;
