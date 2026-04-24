import React, { useState } from 'react';
import {
  Button, VStack, HStack, Text, Box, Heading, Input, Badge,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import { MapPin, Search, Loader2, Check, X, Trash2 } from 'lucide-react';
import { recipeAPI } from '../services/api';

const LOCATION_KEY = 'okaasan_weather_location';

interface Location {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  country_code: string;
  admin1?: string;
}

interface WeatherLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getSavedLocation(): { lat: number; lon: number; name: string } | null {
  try {
    const saved = localStorage.getItem(LOCATION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

export const WeatherLocationModal: React.FC<WeatherLocationModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(getSavedLocation());
  const [justSaved, setJustSaved] = useState(false);

  const selectedBg = useColorModeValue('blue.50', 'blue.900');
  const hoverBg = useColorModeValue('gray.50', 'gray.800');
  const border = useColorModeValue('gray.200', 'gray.700');
  const mutedText = useColorModeValue('gray.600', 'gray.400');

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const data = await recipeAPI.geocode(query.trim());
      setResults(data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') search();
  };

  const selectLocation = (loc: Location) => {
    const label = [loc.name, loc.admin1, loc.country].filter(Boolean).join(', ');
    const data = { lat: loc.latitude, lon: loc.longitude, name: label };
    localStorage.setItem(LOCATION_KEY, JSON.stringify(data));
    setSaved(data);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const clearLocation = () => {
    localStorage.removeItem(LOCATION_KEY);
    setSaved(null);
  };

  if (!isOpen) return null;

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
        borderRadius="md"
        p={6}
        maxW="500px"
        w="90%"
        maxH="90%"
        overflowY="auto"
        boxShadow="xl"
      >
        <VStack gap={5} align="stretch">
          <HStack justify="space-between">
            <HStack gap={2}>
              <Box color="blue.500"><MapPin size={22} /></Box>
              <Heading size="lg">Weather Location</Heading>
            </HStack>
            <Button variant="ghost" onClick={onClose} size="sm" p={0} minW={0}>
              <X size={18} />
            </Button>
          </HStack>

          <Text fontSize="sm" color={mutedText}>
            Search for your city to show weather on the home page.
          </Text>

          {/* Current location */}
          {saved && (
            <Box p={3} borderRadius="md" border="1px solid" borderColor="green.400" bg={selectedBg}>
              <HStack justify="space-between">
                <HStack gap={2}>
                  <Check size={16} color="green" />
                  <Box>
                    <Text fontSize="sm" fontWeight="medium">{saved.name}</Text>
                    <Text fontSize="xs" color={mutedText}>
                      {saved.lat.toFixed(2)}°, {saved.lon.toFixed(2)}°
                    </Text>
                  </Box>
                </HStack>
                <Button size="xs" variant="ghost" onClick={clearLocation} color="red.400">
                  <Trash2 size={14} />
                </Button>
              </HStack>
            </Box>
          )}

          {/* Search */}
          <HStack gap={2}>
            <Input
              placeholder="Search city (e.g. Montreal, Tokyo, London)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              flex={1}
              size="sm"
            />
            <Button onClick={search} size="sm" colorPalette="blue" disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="spin" size={14} /> : <Search size={14} />}
            </Button>
          </HStack>

          {/* Results */}
          {results.length > 0 && (
            <VStack align="stretch" gap={1}>
              {results.map((loc, i) => {
                const label = [loc.name, loc.admin1, loc.country].filter(Boolean).join(', ');
                const isSelected = saved?.lat === loc.latitude && saved?.lon === loc.longitude;
                return (
                  <Box
                    key={i}
                    p={3}
                    borderRadius="md"
                    border="1px solid"
                    borderColor={isSelected ? 'blue.400' : border}
                    bg={isSelected ? selectedBg : 'transparent'}
                    cursor="pointer"
                    transition="all 0.15s"
                    _hover={{ bg: hoverBg, borderColor: 'blue.300' }}
                    onClick={() => selectLocation(loc)}
                  >
                    <HStack justify="space-between">
                      <Box>
                        <Text fontSize="sm" fontWeight="medium">{loc.name}</Text>
                        <Text fontSize="xs" color={mutedText}>
                          {[loc.admin1, loc.country].filter(Boolean).join(', ')}
                        </Text>
                      </Box>
                      <HStack gap={2}>
                        <Badge size="sm" variant="subtle">{loc.country_code}</Badge>
                        {isSelected && <Check size={16} color="green" />}
                      </HStack>
                    </HStack>
                  </Box>
                );
              })}
            </VStack>
          )}

          {results.length === 0 && !loading && query.trim() && (
            <Text fontSize="sm" color={mutedText} textAlign="center" py={2}>
              No results. Try a different city name.
            </Text>
          )}

          {justSaved && (
            <Box p={3} bg="green.50" borderRadius="md" border="1px solid" borderColor="green.200">
              <Text fontSize="sm" color="green.800">Location saved. Refresh the home page to see weather.</Text>
            </Box>
          )}

          <HStack justify="flex-end">
            <Button variant="outline" onClick={onClose} size="sm">Done</Button>
          </HStack>
        </VStack>
      </Box>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </Box>
  );
};
