import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    Input,
    Textarea,
    VStack,
    HStack,
    Text,
    Heading,
} from '@chakra-ui/react';
import { recipeAPI } from '../services/api';
import type { Event } from '../services/type';
import { datetimeLocalToServer, serverToDatetimeLocal } from '../utils/dateUtils';

interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    event?: Event | null; // If provided, we're editing; if null/undefined, we're creating
    initialDate?: Date;
    initialTime?: string;
    onEventCreated?: (event: Event) => void;
    onEventUpdated?: (event: Event) => void;
    onEventDeleted?: (eventId: number) => void;
}

const EventModal: React.FC<EventModalProps> = ({
    isOpen,
    onClose,
    event,
    initialDate,
    initialTime,
    onEventCreated,
    onEventUpdated,
    onEventDeleted
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string>('');

    // Determine if we're editing or creating
    const isEditing = !!event;

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        datetime_start: '',
        datetime_end: '',
        location: '',
        color: '#3182CE',
        kind: 1,
        done: false,
        template: false,
        recuring: false,
        active: true
    });

    // Use utility function for consistent datetime formatting

    // Create initial form data for new events
    const createInitialFormData = () => {
        const now = initialDate || new Date();
        const startTime = initialTime || '09:00';
        const [hours, minutes] = startTime.split(':').map(Number);

        const startDateTime = new Date(now);
        startDateTime.setHours(hours, minutes, 0, 0);

        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(hours + 1, minutes, 0, 0); // Default 1 hour duration

        return {
            title: '',
            description: '',
            datetime_start: serverToDatetimeLocal(startDateTime.toISOString()),
            datetime_end: serverToDatetimeLocal(endDateTime.toISOString()),
            location: '',
            color: '#3182CE',
            kind: 1,
            done: false,
            template: false,
            recuring: false,
            active: true
        };
    };

    // Update form data when modal opens
    useEffect(() => {
        if (isOpen) {
            if (isEditing && event) {
                // Editing mode - populate with existing event data
                setFormData({
                    title: event.title || '',
                    description: event.description || '',
                    datetime_start: serverToDatetimeLocal(event.datetime_start),
                    datetime_end: serverToDatetimeLocal(event.datetime_end),
                    location: event.location || '',
                    color: event.color || '#3182CE',
                    kind: event.kind || 1,
                    done: event.done || false,
                    template: event.template || false,
                    recuring: event.recuring || false,
                    active: event.active !== false
                });
            } else {
                // Creating mode - use initial date/time
                setFormData(createInitialFormData());
            }
            setError('');
        }
    }, [isOpen, event, initialDate, initialTime, isEditing]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }));
    };

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title.trim()) {
            setError('Title is required');
            return;
        }

        if (isEditing && (!event || !event.id)) {
            setError('Event ID is missing');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // Convert datetime-local format to server format using utility function
            const eventData = {
                ...formData,
                datetime_start: datetimeLocalToServer(formData.datetime_start),
                datetime_end: datetimeLocalToServer(formData.datetime_end),
            };

            let resultEvent: Event;

            if (isEditing && event?.id) {
                // Update existing event
                resultEvent = await recipeAPI.updateEvent(event.id, eventData);
                if (onEventUpdated) {
                    onEventUpdated(resultEvent);
                }
            } else {
                // Create new event
                resultEvent = await recipeAPI.createEvent(eventData);
                if (onEventCreated) {
                    onEventCreated(resultEvent);
                }
            }

            onClose();
        } catch (error) {
            console.error(`Error ${isEditing ? 'updating' : 'creating'} event:`, error);
            setError(`Failed to ${isEditing ? 'update' : 'create'} event`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!isEditing || !event || !event.id) {
            setError('Cannot delete: Event ID is missing');
            return;
        }

        if (!window.confirm('Are you sure you want to delete this event?')) {
            return;
        }

        setIsDeleting(true);
        setError('');

        try {
            await recipeAPI.deleteEvent(event.id);

            if (onEventDeleted) {
                onEventDeleted(event.id);
            }

            onClose();
        } catch (error) {
            console.error('Error deleting event:', error);
            setError('Failed to delete event');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleClose = () => {
        setError('');
        onClose();
    };

    const colorOptions = [
        { value: '#3182CE', label: 'Blue' },
        { value: '#38A169', label: 'Green' },
        { value: '#D69E2E', label: 'Yellow' },
        { value: '#E53E3E', label: 'Red' },
        { value: '#805AD5', label: 'Purple' },
        { value: '#DD6B20', label: 'Orange' },
        { value: '#319795', label: 'Teal' },
        { value: '#718096', label: 'Gray' },
    ];

    if (!isOpen) return null;

    return (
        // Overlay
        <Box
            position="fixed"
            top="0"
            left="0"
            width="100vw"
            height="100vh"
            bg="rgba(0, 0, 0, 0.5)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={1000}
            onClick={handleClose}
        >
            {/* Modal Content */}
            <Box
                bg="bg"
                borderRadius="lg"
                boxShadow="xl"
                p={6}
                maxWidth="500px"
                width="90%"
                maxHeight="90vh"
                overflowY="auto"
                onClick={(e) => e.stopPropagation()}
            >
                <Heading size="lg" mb={6}>
                    {isEditing ? 'Edit Event' : 'Create New Event'}
                </Heading>

                {error && (
                    <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="md" p={3} mb={4}>
                        <Text color="red.600" fontSize="sm">{error}</Text>
                    </Box>
                )}

                <form onSubmit={handleSubmit}>
                    <VStack gap={4} align="stretch">
                        <Box>
                            <Text mb={2} fontWeight="medium">Title *</Text>
                            <Input
                                name="title"
                                value={formData.title}
                                onChange={handleInputChange}
                                placeholder="Event title"
                                required
                            />
                        </Box>

                        <Box>
                            <Text mb={2} fontWeight="medium">Description</Text>
                            <Textarea
                                name="description"
                                value={formData.description}
                                onChange={handleInputChange}
                                placeholder="Event description (optional)"
                                rows={3}
                            />
                        </Box>

                        <HStack gap={4}>
                            <Box flex="1">
                                <Text mb={2} fontWeight="medium">Start Time *</Text>
                                <Input
                                    name="datetime_start"
                                    type="datetime-local"
                                    value={formData.datetime_start}
                                    onChange={handleInputChange}
                                    required
                                />
                            </Box>

                            <Box flex="1">
                                <Text mb={2} fontWeight="medium">End Time *</Text>
                                <Input
                                    name="datetime_end"
                                    type="datetime-local"
                                    value={formData.datetime_end}
                                    onChange={handleInputChange}
                                    required
                                />
                            </Box>
                        </HStack>

                        <Box>
                            <Text mb={2} fontWeight="medium">Location</Text>
                            <Input
                                name="location"
                                value={formData.location}
                                onChange={handleInputChange}
                                placeholder="Event location (optional)"
                            />
                        </Box>

                        <Box>
                            <Text mb={2} fontWeight="medium">Color</Text>
                            <select
                                name="color"
                                value={formData.color}
                                onChange={handleSelectChange}
                                style={{
                                    padding: '8px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--chakra-colors-border)',
                                    width: '100%'
                                }}
                            >
                                {colorOptions.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </Box>
                    </VStack>

                    <HStack gap={3} mt={6} justify="space-between">
                        {/* Delete button - only show when editing */}
                        {isEditing ? (
                            <Button
                                colorScheme="red"
                                variant="outline"
                                onClick={handleDelete}
                                loading={isDeleting}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete'}
                            </Button>
                        ) : (
                            <Box /> // Empty space to maintain layout
                        )}

                        <HStack gap={3}>
                            <Button variant="ghost" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                colorScheme="blue"
                                type="submit"
                                loading={isLoading}
                            >
                                {isLoading
                                    ? (isEditing ? 'Updating...' : 'Creating...')
                                    : (isEditing ? 'Update Event' : 'Create Event')
                                }
                            </Button>
                        </HStack>
                    </HStack>
                </form>
            </Box>
        </Box>
    );
};

export default EventModal;