import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Box, Heading, Text, VStack, HStack, Flex, Badge, Button, SimpleGrid,
} from '@chakra-ui/react';
import { useColorModeValue } from '../ui/color-mode';
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle,
  CloudFog, Clock, ExternalLink, MapPin, X, Users,
} from 'lucide-react';
import { recipeAPI, isStaticMode } from '../../services/api';
import {
  formatDateRangeForServer, fromDateServer, formatTimeDisplay,
} from '../../utils/dateUtils';
import { sidebarSections } from '../../layout/Layout';
import type { MealPlan, PlannedMeal } from '../../services/type';

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

export interface DayEvent {
  title: string;
  start: Date;
  end: Date;
  color: string;
  source: 'local' | 'google';
  description?: string;
  link?: string;
  location?: string;
  attendees?: string[];
}

interface DayData {
  date: Date;
  iso: string;
  weatherCode?: number;
  tempMax?: number;
  tempMin?: number;
  events: DayEvent[];
  meals: PlannedMeal[];
}

// ── Event Detail Modal ───────────────────────────────────────

export function EventModal({ event, onClose }: { event: DayEvent; onClose: () => void }) {
  const border = useColorModeValue('#e2e8f0', '#2d3748');
  const mutedText = useColorModeValue('#718096', '#a0aec0');

  const dateLabel = event.start.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const timeRange = `${formatTimeDisplay(event.start)} — ${formatTimeDisplay(event.end)}`;

  return (
    <Box
      position="fixed"
      top={0} left={0} right={0} bottom={0}
      bg="rgba(0, 0, 0, 0.6)"
      zIndex={1000}
      display="flex"
      alignItems="center"
      justifyContent="center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Box
        bg="bg"
        borderRadius="lg"
        p={5}
        maxW="480px"
        w="90%"
        maxH="80vh"
        overflowY="auto"
        boxShadow="xl"
      >
        <Flex justify="space-between" align="start" mb={4}>
          <HStack gap={2} align="start">
            <Box w="4px" h="24px" borderRadius="full" bg={event.color} flexShrink={0} mt={1} />
            <Heading size="md">{event.title}</Heading>
          </HStack>
          <Button variant="ghost" onClick={onClose} size="sm" p={0} minW={0}>
            <X size={18} />
          </Button>
        </Flex>

        <VStack align="stretch" gap={3}>
          {/* Time */}
          <HStack gap={2}>
            <Clock size={16} color={mutedText} />
            <Box>
              <Text fontSize="sm">{dateLabel}</Text>
              <Text fontSize="sm" fontWeight="medium">{timeRange}</Text>
            </Box>
          </HStack>

          {/* Location */}
          {event.location && (
            <HStack gap={2} align="start">
              <MapPin size={16} color={mutedText} style={{ flexShrink: 0, marginTop: 2 }} />
              <Text fontSize="sm">{event.location}</Text>
            </HStack>
          )}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <HStack gap={2} align="start">
              <Users size={16} color={mutedText} style={{ flexShrink: 0, marginTop: 2 }} />
              <Box>
                {event.attendees.map((a, i) => (
                  <Text key={i} fontSize="xs" color={mutedText}>{a}</Text>
                ))}
              </Box>
            </HStack>
          )}

          {/* Description */}
          {event.description && (
            <Box p={3} borderRadius="md" border="1px solid" borderColor={border}>
              <Text fontSize="sm" whiteSpace="pre-wrap">{event.description}</Text>
            </Box>
          )}

          {/* Source badge + link */}
          <Flex justify="space-between" align="center" pt={2}>
            <Badge
              colorPalette={event.source === 'google' ? 'blue' : 'gray'}
              variant="subtle"
              size="sm"
            >
              {event.source === 'google' ? 'Google Calendar' : 'Local'}
            </Badge>

            {event.link && (
              <a href={event.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="outline" colorPalette="blue">
                  <ExternalLink size={14} />
                  <Box ml={1}>Open in Google</Box>
                </Button>
              </a>
            )}
          </Flex>
        </VStack>
      </Box>
    </Box>
  );
}

// ── Day Column ───────────────────────────────────────────────

function DayColumn({ day, cardBg, border, mutedText, isToday, onEventClick }: {
  day: DayData;
  cardBg: string;
  border: string;
  mutedText: string;
  isToday: boolean;
  onEventClick: (evt: DayEvent) => void;
}) {
  const todayBorder = isToday ? 'blue.400' : border;
  const WeatherIcon = day.weatherCode != null ? getWeatherInfo(day.weatherCode).icon : null;
  const weatherLabel = day.weatherCode != null ? getWeatherInfo(day.weatherCode).label : '';
  const dayName = day.date.toLocaleDateString('en-US', { weekday: 'short' });
  const dateLabel = day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const mealTypeOrder: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };
  const sortedMeals = [...day.meals].sort((a, b) => (mealTypeOrder[a.mealType] ?? 9) - (mealTypeOrder[b.mealType] ?? 9));
  const sortedEvents = [...day.events].sort((a, b) => a.start.getTime() - b.start.getTime());

  const mealTypeColor: Record<string, string> = {
    breakfast: 'yellow',
    lunch: 'green',
    dinner: 'purple',
  };

  const MEAL_SLOTS = [
    { type: 'breakfast', short: 'B' },
    { type: 'lunch', short: 'L' },
    { type: 'dinner', short: 'D' },
  ] as const;

  const mealsByType: Record<string, PlannedMeal | undefined> = {};
  for (const m of sortedMeals) {
    if (!mealsByType[m.mealType]) mealsByType[m.mealType] = m;
  }

  return (
    <Link to={`/day/${day.iso}`} style={{ textDecoration: 'none', display: 'block', minWidth: 0 }}>
      <Box
        bg={cardBg}
        borderRadius="lg"
        border="2px solid"
        borderColor={todayBorder}
        cursor="pointer"
        transition="all 0.15s"
        _hover={{ boxShadow: 'md', borderColor: 'blue.300' }}
        minW={{ base: '260px', md: 'auto' }}
        w="100%"
        h="100%"
        display="flex"
        flexDirection="column"
      >
        {/* Header */}
        <Box p={3} pb={2} borderBottom="1px solid" borderColor={border}>
          <HStack justify="space-between">
            <Box>
              <Text fontWeight={isToday ? 'bold' : 'semibold'} fontSize="md">
                {isToday ? 'Today' : dayName}
              </Text>
              <Text fontSize="xs" color={mutedText}>{dateLabel}</Text>
            </Box>
            {isToday && <Badge colorPalette="blue" variant="subtle" size="sm">Today</Badge>}
          </HStack>
        </Box>

        {/* Weather */}
        {WeatherIcon && day.tempMax != null && day.tempMin != null && (
          <Box px={3} py={2} borderBottom="1px solid" borderColor={border}>
            <HStack gap={2}>
              <WeatherIcon size={16} />
              <Text fontSize="sm" fontWeight="medium">
                {Math.round(day.tempMax)}° / {Math.round(day.tempMin)}°
              </Text>
            </HStack>
            <Text fontSize="xs" color={mutedText}>{weatherLabel}</Text>
          </Box>
        )}

        {/* Meals — fixed 3-slot grid, only shown when there are meals */}
        {sortedMeals.length > 0 && (
          <Box px={3} py={2} borderBottom="1px solid" borderColor={border}>
            <VStack align="stretch" gap={1}>
              {MEAL_SLOTS.map(slot => {
                const meal = mealsByType[slot.type];
                return (
                  <HStack key={slot.type} gap={2} h="22px">
                    <Badge
                      colorPalette={meal ? mealTypeColor[slot.type] : 'gray'}
                      variant="subtle"
                      size="sm"
                      flexShrink={0}
                      minW="16px"
                      textAlign="center"
                      opacity={meal ? 1 : 0.3}
                    >
                      {slot.short}
                    </Badge>
                    {meal ? (
                      <Text fontSize="xs" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                        {meal.recipeName}
                      </Text>
                    ) : (
                      <Text fontSize="xs" color={mutedText} opacity={0.4}>—</Text>
                    )}
                  </HStack>
                );
              })}
            </VStack>
          </Box>
        )}

        {/* Events */}
        <Box p={3} flex={1}>
          {sortedEvents.length > 0 ? (
            <VStack align="stretch" gap={1}>
              {sortedEvents.map((evt, i) => (
                <HStack
                  key={i}
                  gap={2}
                  px={1}
                  py={0.5}
                  borderRadius="md"
                  cursor="pointer"
                  _hover={{ bg: 'bg.muted' }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEventClick(evt); }}
                >
                  <Box w="3px" alignSelf="stretch" borderRadius="full" bg={evt.color} flexShrink={0} />
                  <Box minW={0} flex={1}>
                    <Text fontSize="xs" fontWeight="medium" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                      {evt.title}
                    </Text>
                    <HStack gap={1}>
                      <Clock size={10} />
                      <Text fontSize="xs" color={mutedText}>
                        {formatTimeDisplay(evt.start)}
                      </Text>
                    </HStack>
                  </Box>
                  {evt.source === 'google' && (
                    <ExternalLink size={10} color={mutedText} style={{ flexShrink: 0 }} />
                  )}
                </HStack>
              ))}
            </VStack>
          ) : (
            <Text fontSize="xs" color={mutedText} textAlign="center" py={1}>No events</Text>
          )}
        </Box>
      </Box>
    </Link>
  );
}

// ── Static Home (big navigation buttons) ────────────────────

const STATIC_SKIP = new Set(['Home', 'Settings']);

function StaticHome({ cardBg, border, mutedText }: {
  cardBg: string;
  border: string;
  mutedText: string;
}) {
  const sections = sidebarSections.filter(s => !STATIC_SKIP.has(s.title) && (s.items.length > 0 || s.href !== '/'));

  return (
    <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} gap={5}>
      {sections.map(section => (
        <Link key={section.title} to={section.items[0]?.href || section.href} style={{ textDecoration: 'none' }}>
          <Box
            bg={cardBg}
            borderRadius="xl"
            border="1px solid"
            borderColor={border}
            p={6}
            cursor="pointer"
            transition="all 0.2s"
            _hover={{ shadow: 'lg', transform: 'translateY(-2px)', borderColor: 'blue.300' }}
            h="100%"
          >
            <Heading size="md" mb={2}>{section.title}</Heading>
            {section.items.length > 0 && (
              <VStack align="stretch" gap={1}>
                {section.items.map(item => (
                  <Text key={item.href} fontSize="sm" color={mutedText}>{item.name}</Text>
                ))}
              </VStack>
            )}
          </Box>
        </Link>
      ))}
    </SimpleGrid>
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
  const [selectedEvent, setSelectedEvent] = useState<DayEvent | null>(null);

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

    // Fetch local events for the full 7-day range
    recipeAPI.getEvents(weekStart, weekEnd)
      .then(localEvents => {
        setDays(prev => prev.map(d => {
          const dayStr = d.date.toDateString();
          const matching = localEvents.filter(e => fromDateServer(e.datetime_start).toDateString() === dayStr);
          return {
            ...d,
            events: [
              ...d.events,
              ...matching.map(e => ({
                title: e.title,
                start: fromDateServer(e.datetime_start),
                end: fromDateServer(e.datetime_end),
                color: e.color || '#3182CE',
                source: 'local' as const,
                description: e.description,
              })),
            ],
          };
        }));
      })
      .catch(() => {});

    // Fetch Google Calendar events for the full 7-day range
    recipeAPI.getGCalEventsRange(weekStart, weekEnd)
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
              ...matching.map((e: any) => ({
                title: e.title,
                start: new Date(e.datetime_start),
                end: new Date(e.datetime_end),
                color: e.color || '#4285F4',
                source: 'google' as const,
                description: e.description,
                link: e.link,
                location: e.location,
                attendees: e.attendees,
              })),
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
    <Box mx="auto" p={4}>
      <Box mb={6}>
        <Heading size="xl" mb={1}>{dayName}</Heading>
        <Text fontSize="lg" color={mutedText}>{dateStr}</Text>
      </Box>

      {_static ? (
        <StaticHome cardBg={cardBg} border={border} mutedText={mutedText} />
      ) : (
        <>
          {weatherError === 'no-location' && (
            <Box bg={cardBg} p={4} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
              <HStack gap={2}>
                <Cloud size={18} />
                <Text fontSize="sm" color={mutedText}>No weather location set.</Text>
                <Link to="/settings" style={{ textDecoration: 'none' }}>
                  <Text fontSize="sm" color="blue.400" fontWeight="medium">Set location in Settings</Text>
                </Link>
              </HStack>
            </Box>
          )}

          {/* Horizontal scroll on mobile, flex columns on desktop */}
          <Flex
            gap={3}
            overflowX={{ base: 'auto', lg: 'visible' }}
            flexWrap={{ base: 'nowrap', lg: 'nowrap' }}
            pb={{ base: 3, lg: 0 }}
          >
            {days.map(d => (
              <Box
                key={d.iso}
                flex={{ base: '0 0 260px', lg: '1 1 0%' }}
                minW={{ base: '260px', lg: 0 }}
              >
                <DayColumn
                  day={d}
                  cardBg={cardBg}
                  border={border}
                  mutedText={mutedText}
                  isToday={d.date.toDateString() === todayStr}
                  onEventClick={setSelectedEvent}
                />
              </Box>
            ))}
          </Flex>
        </>
      )}

      {selectedEvent && (
        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </Box>
  );
};

export default Home;
