import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Button, Input } from '@chakra-ui/react';
import { Calendar, Plus, Music, MapPin, ExternalLink, Trash2, Disc3, Ticket } from 'lucide-react';
import { recipeAPI } from '../../services/api';

type EventType = 'concert' | 'release' | 'tour';

interface MusicEvent {
  id: number;
  event_type: EventType;
  title: string;
  artist: string | null;
  venue: string | null;
  city: string | null;
  date: string;
  end_date: string | null;
  url: string | null;
  notes: string | null;
  cover_path: string | null;
}

interface ScheduleData {
  upcoming: MusicEvent[];
  past: MusicEvent[];
}

const EVENT_COLORS: Record<EventType, string> = {
  concert: 'purple',
  release: 'blue',
  tour: 'green',
};

const EVENT_ICONS: Record<EventType, React.ReactNode> = {
  concert: <Ticket size={14} />,
  release: <Disc3 size={14} />,
  tour: <MapPin size={14} />,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function daysUntil(iso: string): number {
  const now = new Date();
  const target = new Date(iso);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const MusicSchedule: React.FC = () => {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    event_type: 'concert' as EventType,
    title: '',
    artist: '',
    venue: '',
    city: '',
    date: '',
    url: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchSchedule = () => {
    recipeAPI.request<ScheduleData>('/music/schedule')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSchedule(); }, []);

  const handleSubmit = async () => {
    if (!form.title || !form.date) return;
    setSaving(true);
    try {
      await recipeAPI.request('/music/schedule', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          date: new Date(form.date).toISOString(),
          artist: form.artist || null,
          venue: form.venue || null,
          city: form.city || null,
          url: form.url || null,
          notes: form.notes || null,
        }),
      });
      setForm({ event_type: 'concert', title: '', artist: '', venue: '', city: '', date: '', url: '', notes: '' });
      setShowForm(false);
      fetchSchedule();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await recipeAPI.request(`/music/schedule/${id}`, { method: 'DELETE' });
      fetchSchedule();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack justify="space-between">
        <HStack>
          <Calendar size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Schedule</Heading>
        </HStack>
        <Button size="sm" colorPalette="blue" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} />
          <Text ml={1}>Add Event</Text>
        </Button>
      </HStack>

      {/* Add Event Form */}
      {showForm && (
        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <VStack align="stretch" gap={3}>
            <HStack>
              {(['concert', 'release', 'tour'] as EventType[]).map(t => (
                <Button
                  key={t}
                  size="xs"
                  variant={form.event_type === t ? 'solid' : 'outline'}
                  colorPalette={EVENT_COLORS[t]}
                  onClick={() => setForm({ ...form, event_type: t })}
                  textTransform="capitalize"
                >
                  {t}
                </Button>
              ))}
            </HStack>
            <Grid templateColumns="1fr 1fr" gap={2}>
              <Input size="sm" placeholder="Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              <Input size="sm" placeholder="Artist" value={form.artist} onChange={e => setForm({ ...form, artist: e.target.value })} />
              <Input size="sm" placeholder="Venue" value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} />
              <Input size="sm" placeholder="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
              <Input size="sm" type="datetime-local" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              <Input size="sm" placeholder="URL (ticket link, etc.)" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
            </Grid>
            <Input size="sm" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            <HStack>
              <Button size="sm" colorPalette="blue" onClick={handleSubmit} disabled={saving || !form.title || !form.date}>
                {saving ? 'Saving...' : 'Add Event'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </HStack>
          </VStack>
        </Box>
      )}

      {/* Upcoming Events */}
      {data && data.upcoming.length > 0 ? (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Upcoming</Heading>
          <VStack align="stretch" gap={2}>
            {data.upcoming.map(event => (
              <EventCard key={event.id} event={event} onDelete={handleDelete} />
            ))}
          </VStack>
        </Box>
      ) : (
        <Box p={6} textAlign="center" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <Calendar size={32} color="var(--muted-text)" style={{ margin: '0 auto 8px' }} />
          <Text color="var(--muted-text)" fontSize="sm">
            No upcoming events. Add concerts, album releases, or tours you're looking forward to.
          </Text>
        </Box>
      )}

      {/* Past Events */}
      {data && data.past.length > 0 && (
        <Box>
          <Heading size="sm" color="var(--muted-text)" mb={3}>Recently Past</Heading>
          <VStack align="stretch" gap={2} opacity={0.7}>
            {data.past.map(event => (
              <EventCard key={event.id} event={event} onDelete={handleDelete} isPast />
            ))}
          </VStack>
        </Box>
      )}
    </VStack>
  );
};

const EventCard: React.FC<{ event: MusicEvent; onDelete: (id: number) => void; isPast?: boolean }> = ({ event, onDelete, isPast }) => {
  const days = daysUntil(event.date);

  return (
    <HStack
      p={3}
      bg="var(--card-bg)"
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      gap={3}
      _hover={{ borderColor: 'var(--icon-color)' }}
    >
      <Box
        w="40px" h="40px" borderRadius="md"
        bg={`var(--chakra-colors-${EVENT_COLORS[event.event_type]}-100)`}
        display="flex" alignItems="center" justifyContent="center"
        flexShrink={0}
      >
        {EVENT_ICONS[event.event_type]}
      </Box>
      <Box flex={1} minW={0}>
        <HStack gap={2} mb="2px">
          <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{event.title}</Text>
          <Badge colorPalette={EVENT_COLORS[event.event_type]} fontSize="2xs" textTransform="capitalize">
            {event.event_type}
          </Badge>
        </HStack>
        <HStack gap={3} flexWrap="wrap">
          {event.artist && <Text fontSize="xs" color="var(--muted-text)">{event.artist}</Text>}
          {event.venue && <Text fontSize="xs" color="var(--muted-text)">📍 {event.venue}{event.city ? `, ${event.city}` : ''}</Text>}
        </HStack>
        <HStack gap={2} mt="2px">
          <Text fontSize="xs" color="var(--muted-text)">{formatDate(event.date)}</Text>
          {!isPast && days >= 0 && (
            <Badge colorPalette={days <= 7 ? 'orange' : 'gray'} fontSize="2xs">
              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
            </Badge>
          )}
        </HStack>
        {event.notes && <Text fontSize="2xs" color="var(--muted-text)" mt={1} lineClamp={1}>{event.notes}</Text>}
      </Box>
      <HStack gap={1}>
        {event.url && (
          <Button size="xs" variant="ghost" p={1} minW="auto" h="auto" as="a" href={event.url} target="_blank" rel="noopener">
            <ExternalLink size={12} />
          </Button>
        )}
        <Button size="xs" variant="ghost" p={1} minW="auto" h="auto" colorPalette="red" onClick={() => onDelete(event.id)}>
          <Trash2 size={12} />
        </Button>
      </HStack>
    </HStack>
  );
};

export default MusicSchedule;
