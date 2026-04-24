import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Box, Heading, Text, VStack, HStack, Flex, Badge, Card,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle,
  CloudFog, Wind, Thermometer, Droplets, Sunrise, Sunset,
  CalendarDays, UtensilsCrossed, Clock,
} from 'lucide-react';
import { recipeAPI, isStaticMode } from '../services/api';
import {
  formatDateRangeForServer, fromDateServer, formatTimeDisplay,
} from '../utils/dateUtils';
import type { Event, MealPlan, PlannedMeal } from '../services/type';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WMO_CODES: Record<number, { label: string; icon: typeof Sun }> = {
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

function getWeatherInfo(code: number) {
  return WMO_CODES[code] || { label: `Code ${code}`, icon: Cloud };
}

interface WeatherData {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily?: {
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

const LOCATION_KEY = 'okaasan_weather_location';

function getSavedLocation(): { lat: number; lon: number; name: string } | null {
  try {
    const saved = localStorage.getItem(LOCATION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

function saveLocation(lat: number, lon: number, name: string) {
  localStorage.setItem(LOCATION_KEY, JSON.stringify({ lat, lon, name }));
}

// ── Weather Card ──────────────────────────────────────────────

function WeatherCard({ cardBg, border, mutedText }: { cardBg: string; border: string; mutedText: string }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchWeather = async () => {
      const saved = getSavedLocation();
      if (saved) {
        setLocationName(saved.name);
        try {
          const data = await recipeAPI.getWeatherForecast(saved.lat, saved.lon, 1);
          setWeather(data);
        } catch { setError('Could not fetch weather'); }
        return;
      }

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
              const locations = await recipeAPI.geocode(`${latitude},${longitude}`);
              const name = locations?.[0]?.name || 'Your location';
              saveLocation(latitude, longitude, name);
              setLocationName(name);
            } catch { setLocationName('Your location'); }
            try {
              const data = await recipeAPI.getWeatherForecast(latitude, longitude, 1);
              setWeather(data);
            } catch { setError('Could not fetch weather'); }
          },
          () => setError('no-location'),
          { timeout: 5000 }
        );
      } else {
        setError('no-location');
      }
    };
    fetchWeather();
  }, []);

  if (error) {
    return (
      <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border}>
        <HStack gap={2} mb={2}><Cloud size={20} /><Heading size="md">Weather</Heading></HStack>
        {error === 'no-location' ? (
          <HStack gap={2}>
            <Text fontSize="sm" color={mutedText}>No location set.</Text>
            <Link to="/settings" style={{ textDecoration: 'none' }}>
              <Text fontSize="sm" color="blue.400" fontWeight="medium" cursor="pointer">Set location in Settings →</Text>
            </Link>
          </HStack>
        ) : (
          <Text fontSize="sm" color={mutedText}>{error}</Text>
        )}
      </Box>
    );
  }

  if (!weather?.current) {
    return (
      <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border}>
        <HStack gap={2} mb={2}><Cloud size={20} /><Heading size="md">Weather</Heading></HStack>
        <Text fontSize="sm" color={mutedText}>Loading...</Text>
      </Box>
    );
  }

  const { current, daily, hourly } = weather;
  const info = getWeatherInfo(current.weather_code);
  const Icon = info.icon;

  const now = new Date();
  const currentHour = now.getHours();

  const upcomingHours = hourly?.time
    ?.map((t, i) => ({ time: t, temp: hourly.temperature_2m[i], code: hourly.weather_code[i], precip: hourly.precipitation_probability[i] }))
    .filter(h => {
      const hour = new Date(h.time).getHours();
      return hour >= currentHour && hour <= 23;
    })
    .filter((_, i) => i % 2 === 0)
    .slice(0, 6) || [];

  return (
    <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border}>
      <HStack justify="space-between" mb={3}>
        <HStack gap={2}>
          <Icon size={20} />
          <Heading size="md">Weather</Heading>
          {locationName && <Text fontSize="sm" color={mutedText}>— {locationName}</Text>}
        </HStack>
      </HStack>

      <Flex gap={6} flexWrap="wrap" mb={4}>
        <HStack gap={2}>
          <Thermometer size={16} />
          <Text fontSize="2xl" fontWeight="bold">{Math.round(current.temperature_2m)}°C</Text>
        </HStack>
        <VStack align="start" gap={0}>
          <Text fontSize="sm" fontWeight="medium">{info.label}</Text>
          <Text fontSize="xs" color={mutedText}>Feels like {Math.round(current.apparent_temperature)}°C</Text>
        </VStack>
        <HStack gap={3}>
          <HStack gap={1}><Wind size={14} /><Text fontSize="xs">{current.wind_speed_10m} km/h</Text></HStack>
          <HStack gap={1}><Droplets size={14} /><Text fontSize="xs">{current.relative_humidity_2m}%</Text></HStack>
        </HStack>
      </Flex>

      {daily && (
        <HStack gap={4} mb={3} fontSize="xs" color={mutedText}>
          <HStack gap={1}><Sunrise size={14} /><Text>{new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></HStack>
          <HStack gap={1}><Sunset size={14} /><Text>{new Date(daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></HStack>
          <Text>High {Math.round(daily.temperature_2m_max[0])}° / Low {Math.round(daily.temperature_2m_min[0])}°</Text>
        </HStack>
      )}

      {upcomingHours.length > 0 && (
        <Flex gap={2} overflowX="auto">
          {upcomingHours.map((h, i) => {
            const hInfo = getWeatherInfo(h.code);
            const HIcon = hInfo.icon;
            return (
              <VStack key={i} gap={0} minW="50px" align="center" p={1}>
                <Text fontSize="xs" color={mutedText}>{new Date(h.time).getHours()}:00</Text>
                <HIcon size={14} />
                <Text fontSize="xs" fontWeight="medium">{Math.round(h.temp)}°</Text>
                {h.precip > 0 && <Text fontSize="xs" color="blue.400">{h.precip}%</Text>}
              </VStack>
            );
          })}
        </Flex>
      )}
    </Box>
  );
}

// ── Schedule Card ─────────────────────────────────────────────

function ScheduleCard({ cardBg, border, mutedText }: { cardBg: string; border: string; mutedText: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [gcalEvents, setGcalEvents] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date();
    const startOfDay = formatDateRangeForServer(today, false);
    const endOfDay = formatDateRangeForServer(today, true);

    recipeAPI.getEvents(startOfDay, endOfDay)
      .then(setEvents)
      .catch(() => {});

    recipeAPI.getGCalWeekEvents()
      .then(evts => {
        const todayStr = today.toDateString();
        const todayEvents = evts.filter((e: any) => {
          const start = e.datetime_start;
          if (!start) return false;
          return new Date(start).toDateString() === todayStr;
        });
        setGcalEvents(todayEvents);
      })
      .catch(() => {});
  }, []);

  const allEvents = [
    ...events.map(e => ({
      title: e.title,
      start: fromDateServer(e.datetime_start),
      end: fromDateServer(e.datetime_end),
      color: e.color || '#3182CE',
      source: 'local' as const,
      description: e.description,
    })),
    ...gcalEvents.map(e => ({
      title: e.title,
      start: new Date(e.datetime_start),
      end: new Date(e.datetime_end),
      color: e.color || '#4285F4',
      source: 'google' as const,
      description: e.description,
    })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  return (
    <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border}>
      <HStack gap={2} mb={3}>
        <CalendarDays size={20} />
        <Heading size="md">Today's Schedule</Heading>
        <Badge colorPalette="blue" variant="subtle" size="sm">{allEvents.length}</Badge>
      </HStack>

      {allEvents.length === 0 ? (
        <Text fontSize="sm" color={mutedText}>No events scheduled for today.</Text>
      ) : (
        <VStack align="stretch" gap={2}>
          {allEvents.map((evt, i) => (
            <HStack key={i} gap={3} p={2} borderRadius="md" border="1px solid" borderColor={border}>
              <Box w="4px" alignSelf="stretch" borderRadius="full" bg={evt.color} flexShrink={0} />
              <Box flex={1} minW={0}>
                <HStack justify="space-between">
                  <Text fontSize="sm" fontWeight="medium" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                    {evt.title}
                  </Text>
                  {evt.source === 'google' && (
                    <Badge colorPalette="blue" variant="subtle" size="sm" flexShrink={0}>Google</Badge>
                  )}
                </HStack>
                <HStack gap={1}>
                  <Clock size={12} />
                  <Text fontSize="xs" color={mutedText}>
                    {formatTimeDisplay(evt.start)} — {formatTimeDisplay(evt.end)}
                  </Text>
                </HStack>
              </Box>
            </HStack>
          ))}
        </VStack>
      )}
    </Box>
  );
}

// ── Meals Card ────────────────────────────────────────────────

function MealsCard({ cardBg, border, mutedText }: { cardBg: string; border: string; mutedText: string }) {
  const [todayMeals, setTodayMeals] = useState<PlannedMeal[]>([]);
  const [planName, setPlanName] = useState('');
  const accentBg = useColorModeValue('orange.50', 'orange.900');

  useEffect(() => {
    const loadTodayMeals = async () => {
      try {
        const names = await recipeAPI.getMealPlanNames();
        if (names.length === 0) return;

        const latestName = names[names.length - 1];
        const plan: MealPlan = await recipeAPI.loadMealPlan(latestName);
        setPlanName(latestName);

        const today = DAYS[new Date().getDay()];
        const meals = plan.plannedMeals?.filter(m => m.day === today) || [];
        setTodayMeals(meals);
      } catch { /* no plan yet */ }
    };
    loadTodayMeals();
  }, []);

  const mealTypeOrder = { breakfast: 0, lunch: 1, dinner: 2 };
  const sorted = [...todayMeals].sort((a, b) => mealTypeOrder[a.mealType] - mealTypeOrder[b.mealType]);

  const mealTypeLabel: Record<string, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
  };

  const mealTypeColor: Record<string, string> = {
    breakfast: 'yellow',
    lunch: 'green',
    dinner: 'purple',
  };

  return (
    <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border}>
      <HStack gap={2} mb={3} justify="space-between">
        <HStack gap={2}>
          <UtensilsCrossed size={20} />
          <Heading size="md">Today's Menu</Heading>
        </HStack>
        {planName && (
          <Link to="/planning" style={{ textDecoration: 'none' }}>
            <Badge colorPalette="orange" variant="subtle" size="sm" cursor="pointer">{planName}</Badge>
          </Link>
        )}
      </HStack>

      {sorted.length === 0 ? (
        <VStack gap={2} align="stretch">
          <Text fontSize="sm" color={mutedText}>No meals planned for today.</Text>
          <Link to="/planning" style={{ textDecoration: 'none' }}>
            <Text fontSize="sm" color="orange.500" fontWeight="medium" _hover={{ textDecoration: 'underline' }}>
              Open Meal Planner →
            </Text>
          </Link>
        </VStack>
      ) : (
        <VStack align="stretch" gap={2}>
          {sorted.map((meal, i) => (
            <Link key={i} to={`/recipes/${meal.recipeId}`} style={{ textDecoration: 'none' }}>
              <HStack gap={3} p={3} borderRadius="md" bg={accentBg} transition="all 0.15s" _hover={{ opacity: 0.8 }}>
                <Badge colorPalette={mealTypeColor[meal.mealType]} variant="subtle" size="sm" minW="70px" textAlign="center">
                  {mealTypeLabel[meal.mealType]}
                </Badge>
                <Box flex={1}>
                  <Text fontSize="sm" fontWeight="medium">{meal.recipeName}</Text>
                  <Text fontSize="xs" color={mutedText}>{meal.portions} portion{meal.portions !== 1 ? 's' : ''}</Text>
                </Box>
              </HStack>
            </Link>
          ))}
        </VStack>
      )}
    </Box>
  );
}

// ── Home Page ─────────────────────────────────────────────────

const Home = () => {
  const cardBg = useColorModeValue('#f8f9fa', '#16213e');
  const border = useColorModeValue('#e2e8f0', '#2d3748');
  const mutedText = useColorModeValue('#718096', '#a0aec0');
  const _static = isStaticMode();

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  useEffect(() => {
    document.title = '(O)KaaSan - Home';
  }, []);

  return (
    <Box maxW="900px" mx="auto" p={4}>
      <Box mb={6}>
        <Heading size="xl" mb={1}>{dayName}</Heading>
        <Text fontSize="lg" color={mutedText}>{dateStr}</Text>
      </Box>

      <VStack align="stretch" gap={4}>
        {!_static && <WeatherCard cardBg={cardBg} border={border} mutedText={mutedText} />}
        {!_static && <ScheduleCard cardBg={cardBg} border={border} mutedText={mutedText} />}
        {!_static && <MealsCard cardBg={cardBg} border={border} mutedText={mutedText} />}

        {_static && (
          <Box textAlign="center" py={8}>
            <Heading size="lg" mb={2} color="orange.500">Welcome to (O)KaaSan</Heading>
            <Text color={mutedText}>Use the sidebar to navigate.</Text>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default Home;
