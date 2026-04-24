import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Box, Heading, Text, VStack, HStack, Flex, Badge,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import {
  Cloud, Wind, Thermometer, Droplets, Sunrise, Sunset,
  CalendarDays, UtensilsCrossed, Clock, ChevronLeft, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { recipeAPI, isStaticMode } from '../services/api';
import {
  formatDateRangeForServer, fromDateServer, formatTimeDisplay,
} from '../utils/dateUtils';
import { DAYS, getWeatherInfo, type WeatherData } from './Home';
import type { Event, MealPlan, PlannedMeal } from '../services/type';

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Weather Detail ───────────────────────────────────────────

function WeatherSection({ weather, isToday, cardBg, border, mutedText }: {
  weather: WeatherData | null;
  isToday: boolean;
  cardBg: string;
  border: string;
  mutedText: string;
}) {
  if (!weather?.daily) return null;

  const { current, daily, hourly } = weather;
  const dayCode = daily.weather_code[0];
  const info = getWeatherInfo(dayCode);
  const Icon = info.icon;

  const now = new Date();
  const currentHour = now.getHours();

  const upcomingHours = isToday
    ? hourly?.time
        ?.map((t, i) => ({
          time: t,
          temp: hourly.temperature_2m[i],
          code: hourly.weather_code[i],
          precip: hourly.precipitation_probability[i],
        }))
        .filter(h => new Date(h.time).getHours() >= currentHour && new Date(h.time).getHours() <= 23)
        .filter((_, i) => i % 2 === 0)
        .slice(0, 6) || []
    : hourly?.time
        ?.map((t, i) => ({
          time: t,
          temp: hourly.temperature_2m[i],
          code: hourly.weather_code[i],
          precip: hourly.precipitation_probability[i],
        }))
        .filter((_, i) => i % 3 === 0)
        .slice(0, 8) || [];

  return (
    <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border}>
      <HStack gap={2} mb={3}>
        <Icon size={20} />
        <Heading size="md">Weather</Heading>
      </HStack>

      {isToday && current && (
        <Flex gap={6} flexWrap="wrap" mb={4}>
          <HStack gap={2}>
            <Thermometer size={16} />
            <Text fontSize="2xl" fontWeight="bold">{Math.round(current.temperature_2m)}°C</Text>
          </HStack>
          <VStack align="start" gap={0}>
            <Text fontSize="sm" fontWeight="medium">{getWeatherInfo(current.weather_code).label}</Text>
            <Text fontSize="xs" color={mutedText}>Feels like {Math.round(current.apparent_temperature)}°C</Text>
          </VStack>
          <HStack gap={3}>
            <HStack gap={1}><Wind size={14} /><Text fontSize="xs">{current.wind_speed_10m} km/h</Text></HStack>
            <HStack gap={1}><Droplets size={14} /><Text fontSize="xs">{current.relative_humidity_2m}%</Text></HStack>
          </HStack>
        </Flex>
      )}

      {!isToday && (
        <Flex gap={6} flexWrap="wrap" mb={4}>
          <VStack align="start" gap={0}>
            <Text fontSize="sm" fontWeight="medium">{info.label}</Text>
            <Text fontSize="sm" color={mutedText}>
              High {Math.round(daily.temperature_2m_max[0])}° / Low {Math.round(daily.temperature_2m_min[0])}°
            </Text>
          </VStack>
          {daily.precipitation_sum[0] > 0 && (
            <HStack gap={1}>
              <Droplets size={14} color="#63b3ed" />
              <Text fontSize="sm" color="blue.400">{daily.precipitation_sum[0]}mm precipitation</Text>
            </HStack>
          )}
        </Flex>
      )}

      <HStack gap={4} mb={3} fontSize="xs" color={mutedText}>
        <HStack gap={1}><Sunrise size={14} /><Text>{new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></HStack>
        <HStack gap={1}><Sunset size={14} /><Text>{new Date(daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></HStack>
        {isToday && (
          <Text>High {Math.round(daily.temperature_2m_max[0])}° / Low {Math.round(daily.temperature_2m_min[0])}°</Text>
        )}
      </HStack>

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

// ── Schedule Section ─────────────────────────────────────────

function ScheduleSection({ date, cardBg, border, mutedText }: {
  date: Date;
  cardBg: string;
  border: string;
  mutedText: string;
}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [gcalEvents, setGcalEvents] = useState<any[]>([]);

  useEffect(() => {
    const startOfDay = formatDateRangeForServer(date, false);
    const endOfDay = formatDateRangeForServer(date, true);

    recipeAPI.getEvents(startOfDay, endOfDay)
      .then(setEvents)
      .catch(() => {});

    const isoDate = toISODate(date);
    recipeAPI.getGCalWeekEvents(isoDate)
      .then(evts => {
        const dayStr = date.toDateString();
        setGcalEvents(
          evts.filter((e: any) => e.datetime_start && new Date(e.datetime_start).toDateString() === dayStr)
        );
      })
      .catch(() => {});
  }, [date]);

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
        <Heading size="md">Schedule</Heading>
        <Badge colorPalette="blue" variant="subtle" size="sm">{allEvents.length}</Badge>
      </HStack>

      {allEvents.length === 0 ? (
        <Text fontSize="sm" color={mutedText}>No events scheduled.</Text>
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

// ── Meals Section ────────────────────────────────────────────

function MealsSection({ date, cardBg, border, mutedText }: {
  date: Date;
  cardBg: string;
  border: string;
  mutedText: string;
}) {
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [planName, setPlanName] = useState('');
  const accentBg = useColorModeValue('orange.50', 'orange.900');

  useEffect(() => {
    (async () => {
      try {
        const names = await recipeAPI.getMealPlanNames();
        if (names.length === 0) return;
        const latestName = names[names.length - 1];
        const plan: MealPlan = await recipeAPI.loadMealPlan(latestName);
        setPlanName(latestName);
        const dayOfWeek = DAYS[date.getDay()];
        setMeals(plan.plannedMeals?.filter(m => m.day === dayOfWeek) || []);
      } catch { /* no plan */ }
    })();
  }, [date]);

  const mealTypeOrder: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };
  const sorted = [...meals].sort((a, b) => (mealTypeOrder[a.mealType] ?? 9) - (mealTypeOrder[b.mealType] ?? 9));

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
          <Heading size="md">Menu</Heading>
        </HStack>
        {planName && (
          <Link to="/planning" style={{ textDecoration: 'none' }}>
            <Badge colorPalette="orange" variant="subtle" size="sm" cursor="pointer">{planName}</Badge>
          </Link>
        )}
      </HStack>

      {sorted.length === 0 ? (
        <Text fontSize="sm" color={mutedText}>No meals planned.</Text>
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

// ── Day Detail Page ──────────────────────────────────────────

const DayDetail = () => {
  const { date: dateParam } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const cardBg = useColorModeValue('#f8f9fa', '#16213e');
  const border = useColorModeValue('#e2e8f0', '#2d3748');
  const mutedText = useColorModeValue('#718096', '#a0aec0');

  const date = new Date(dateParam + 'T12:00:00');
  const isToday = date.toDateString() === new Date().toDateString();
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const prevDate = new Date(date);
  prevDate.setDate(date.getDate() - 1);
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + 1);

  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    document.title = `(O)KaaSan - ${dayName}`;
  }, [dayName]);

  useEffect(() => {
    (async () => {
      try {
        const loc = await recipeAPI.getWeatherLocation();
        if (!loc) return;
        const data = await recipeAPI.getWeatherForecast(loc.lat, loc.lon, 1);
        setWeather(data);
      } catch { /* no weather */ }
    })();
  }, [dateParam]);

  if (isStaticMode()) {
    return <Box p={4}><Text>Not available in static mode.</Text></Box>;
  }

  return (
    <Box maxW="900px" mx="auto" p={4}>
      {/* Navigation header */}
      <Flex justify="space-between" align="center" mb={6}>
        <HStack gap={3}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <HStack gap={1} color="blue.400" cursor="pointer" _hover={{ color: 'blue.500' }}>
              <ArrowLeft size={18} />
              <Text fontSize="sm" fontWeight="medium">Home</Text>
            </HStack>
          </Link>
        </HStack>

        <HStack gap={2}>
          <Box
            cursor="pointer"
            p={1}
            borderRadius="md"
            _hover={{ bg: border }}
            onClick={() => navigate(`/day/${toISODate(prevDate)}`)}
          >
            <ChevronLeft size={20} />
          </Box>

          <Box textAlign="center" minW="200px">
            <HStack justify="center" gap={2}>
              <Heading size="lg">{isToday ? 'Today' : dayName}</Heading>
              {isToday && <Badge colorPalette="blue" variant="subtle">Today</Badge>}
            </HStack>
            <Text fontSize="sm" color={mutedText}>{dateStr}</Text>
          </Box>

          <Box
            cursor="pointer"
            p={1}
            borderRadius="md"
            _hover={{ bg: border }}
            onClick={() => navigate(`/day/${toISODate(nextDate)}`)}
          >
            <ChevronRight size={20} />
          </Box>
        </HStack>

        <Box w="70px" /> {/* spacer for centering */}
      </Flex>

      <VStack align="stretch" gap={4}>
        {isToday && weather && (
          <WeatherSection weather={weather} isToday={isToday} cardBg={cardBg} border={border} mutedText={mutedText} />
        )}
        {!isToday && weather?.daily && (
          <WeatherSection weather={weather} isToday={isToday} cardBg={cardBg} border={border} mutedText={mutedText} />
        )}

        <ScheduleSection date={date} cardBg={cardBg} border={border} mutedText={mutedText} />
        <MealsSection date={date} cardBg={cardBg} border={border} mutedText={mutedText} />
      </VStack>
    </Box>
  );
};

export default DayDetail;
