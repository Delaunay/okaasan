import React, { useState, useEffect } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Button,
    Input,
    Textarea,
    Heading,
    Badge,
    IconButton,
    Grid,
    Flex,
} from '@chakra-ui/react';
import { recipeAPI } from '../services/api';
import type { Ingredient } from '../services/type';

// Custom icon components
const DeleteIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
);

const AddIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
);

const EditIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
);

const PantryIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3 3h4v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V5h4l3-3zm0 2.83L10.83 6H8v13h8V6h-2.83L12 4.83zM10 8h4v1h-4V8zm0 2h4v1h-4v-1zm0 2h4v1h-4v-1z" />
    </svg>
);

const CloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
);

const WarningIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
);

interface PantryItem {
    id?: string;
    name: string;
    quantity: number;
    unit: string;
    location: string;
    category: string;
    expirationDate?: string;
    purchaseDate?: string;
    notes?: string;
    lowStockThreshold?: number;
}

const COMMON_UNITS = [
    'piece', 'g', 'kg', 'mg', 'ml', 'l', 'cl', 'cup', 'tbsp', 'tsp',
    'oz', 'lb', 'fl oz', 'pint', 'quart', 'gallon', 'cm3', 'box', 'bag', 'can', 'jar', 'bottle'
];

const PANTRY_LOCATIONS = [
    'Pantry', 'Refrigerator', 'Freezer', 'Spice Rack', 'Cupboard', 'Counter', 'Basement', 'Garage', 'Other'
];

const PANTRY_CATEGORIES = [
    'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry Staples',
    'Frozen', 'Beverages', 'Snacks', 'Spices & Seasonings', 'Condiments', 'Canned Goods', 'Other'
];

const Pantry: React.FC = () => {
    const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterLocation, setFilterLocation] = useState('');
    const [showExpiringSoon, setShowExpiringSoon] = useState(false);

    // Pantry items state
    const [pantryItems, setPantryItems] = useState<PantryItem[]>([
        // Sample data for demonstration
        {
            id: '1',
            name: 'Milk',
            quantity: 1,
            unit: 'l',
            location: 'Refrigerator',
            category: 'Dairy & Eggs',
            expirationDate: '2024-01-15',
            purchaseDate: '2024-01-10',
            lowStockThreshold: 1
        },
        {
            id: '2',
            name: 'Rice',
            quantity: 2.5,
            unit: 'kg',
            location: 'Pantry',
            category: 'Pantry Staples',
            lowStockThreshold: 1
        },
        {
            id: '3',
            name: 'Bananas',
            quantity: 6,
            unit: 'piece',
            location: 'Counter',
            category: 'Produce',
            expirationDate: '2024-01-12',
            lowStockThreshold: 3
        }
    ]);

    // Form state for add/edit modal
    const [formData, setFormData] = useState<PantryItem>({
        name: '',
        quantity: 1,
        unit: 'piece',
        location: 'Pantry',
        category: 'Other',
        expirationDate: '',
        purchaseDate: '',
        notes: '',
        lowStockThreshold: 1
    });

    // Load available ingredients for autocomplete
    useEffect(() => {
        const loadIngredients = async () => {
            try {
                const ingredientsData = await recipeAPI.getIngredients();
                setAvailableIngredients(ingredientsData);
            } catch (error) {
                console.error('Error loading ingredients:', error);
            }
        };
        loadIngredients();
    }, []);

    // Clear message after 5 seconds
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    const showMessage = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
    };

    const resetForm = () => {
        setFormData({
            name: '',
            quantity: 1,
            unit: 'piece',
            location: 'Pantry',
            category: 'Other',
            expirationDate: '',
            purchaseDate: '',
            notes: '',
            lowStockThreshold: 1
        });
    };

    const openAddModal = () => {
        resetForm();
        setEditingItem(null);
        setShowAddModal(true);
    };

    const openEditModal = (item: PantryItem) => {
        setFormData({ ...item });
        setEditingItem(item);
        setShowAddModal(true);
    };

    const closeModal = () => {
        setShowAddModal(false);
        setEditingItem(null);
        resetForm();
    };

    const handleSubmit = () => {
        if (!formData.name.trim()) {
            showMessage('Item name is required', 'error');
            return;
        }

        if (formData.quantity <= 0) {
            showMessage('Quantity must be greater than 0', 'error');
            return;
        }

        if (editingItem) {
            // Update existing item
            setPantryItems(items =>
                items.map(item =>
                    item.id === editingItem.id ? { ...formData, id: editingItem.id } : item
                )
            );
            showMessage(`${formData.name} updated successfully!`, 'success');
        } else {
            // Add new item
            const newItem: PantryItem = {
                ...formData,
                id: Date.now().toString()
            };
            setPantryItems(items => [...items, newItem]);
            showMessage(`${formData.name} added to pantry!`, 'success');
        }

        closeModal();
    };

    const deleteItem = (id: string) => {
        const item = pantryItems.find(item => item.id === id);
        if (item) {
            setPantryItems(items => items.filter(item => item.id !== id));
            showMessage(`${item.name} removed from pantry`, 'success');
        }
    };

    const updateQuantity = (id: string, newQuantity: number) => {
        if (newQuantity < 0) return;

        setPantryItems(items =>
            items.map(item =>
                item.id === id ? { ...item, quantity: newQuantity } : item
            )
        );
    };

    const getDaysUntilExpiration = (expirationDate: string): number => {
        const today = new Date();
        const expDate = new Date(expirationDate);
        const diffTime = expDate.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const getExpirationStatus = (expirationDate?: string) => {
        if (!expirationDate) return null;

        const days = getDaysUntilExpiration(expirationDate);

        if (days < 0) return { status: 'expired', color: 'red', text: `Expired ${Math.abs(days)} days ago` };
        if (days === 0) return { status: 'today', color: 'red', text: 'Expires today' };
        if (days <= 3) return { status: 'soon', color: 'orange', text: `Expires in ${days} days` };
        if (days <= 7) return { status: 'week', color: 'yellow', text: `Expires in ${days} days` };
        return { status: 'good', color: 'green', text: `Expires in ${days} days` };
    };

    const isLowStock = (item: PantryItem): boolean => {
        return item.lowStockThreshold ? item.quantity <= item.lowStockThreshold : false;
    };

    const filteredItems = pantryItems.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = !filterCategory || item.category === filterCategory;
        const matchesLocation = !filterLocation || item.location === filterLocation;

        if (showExpiringSoon) {
            const expStatus = getExpirationStatus(item.expirationDate);
            const isExpiring = expStatus && ['expired', 'today', 'soon'].includes(expStatus.status);
            return matchesSearch && matchesCategory && matchesLocation && isExpiring;
        }

        return matchesSearch && matchesCategory && matchesLocation;
    });

    const expiringSoonCount = pantryItems.filter(item => {
        const expStatus = getExpirationStatus(item.expirationDate);
        return expStatus && ['expired', 'today', 'soon'].includes(expStatus.status);
    }).length;

    const lowStockCount = pantryItems.filter(isLowStock).length;

    return (
        <Box p={6} maxW="7xl" mx="auto">
            {/* Message Display */}
            {message && (
                <Box
                    position="fixed"
                    top={4}
                    right={4}
                    zIndex={1001}
                    p={4}
                    borderRadius="md"
                    bg={message.type === 'success' ? 'green.500' : 'red.500'}
                    color="white"
                    boxShadow="lg"
                    maxW="400px"
                >
                    <Text fontWeight="medium">{message.text}</Text>
                </Box>
            )}

            <VStack gap={6} align="stretch">
                {/* Header */}
                <Box>
                    <Flex justify="space-between" align="center" mb={2}>
                        <Flex align="center" gap={3}>
                            <PantryIcon />
                            <Heading size="lg">Pantry Management</Heading>
                        </Flex>
                        <Button
                            onClick={openAddModal}
                            colorScheme="green"
                            size="md"
                        >
                            <AddIcon /> Add Item
                        </Button>
                    </Flex>
                    <Text color="gray.600">
                        Track your pantry inventory, expiration dates, and stock levels.
                    </Text>
                </Box>

                {/* Summary Cards */}
                <Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={4}>
                    <Box p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <VStack>
                            <Text fontSize="sm" color="gray.500">Total Items</Text>
                            <Text fontSize="2xl" fontWeight="bold">{pantryItems.length}</Text>
                        </VStack>
                    </Box>

                    <Box p={4} border="1px solid" borderColor="orange.200" borderRadius="md" bg="orange.50">
                        <VStack>
                            <Text fontSize="sm" color="orange.600">Low Stock</Text>
                            <Text fontSize="2xl" fontWeight="bold" color="orange.600">{lowStockCount}</Text>
                        </VStack>
                    </Box>

                    <Box p={4} border="1px solid" borderColor="red.200" borderRadius="md" bg="red.50">
                        <VStack>
                            <Text fontSize="sm" color="red.600">Expiring Soon</Text>
                            <Text fontSize="2xl" fontWeight="bold" color="red.600">{expiringSoonCount}</Text>
                        </VStack>
                    </Box>
                </Grid>

                {/* Filters */}
                <Box p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                    <Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={4} alignItems="end">
                        <Box>
                            <Text mb={2} fontSize="sm" fontWeight="semibold">Search Items</Text>
                            <Input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by name..."
                                size="sm"
                            />
                        </Box>

                        <Box>
                            <Text mb={2} fontSize="sm" fontWeight="semibold">Category</Text>
                            <select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '6px',
                                    border: '1px solid var(--chakra-colors-border)',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--chakra-colors-bg)',
                                    fontSize: '14px'
                                }}
                            >
                                <option value="">All Categories</option>
                                {PANTRY_CATEGORIES.map(category => (
                                    <option key={category} value={category}>{category}</option>
                                ))}
                            </select>
                        </Box>

                        <Box>
                            <Text mb={2} fontSize="sm" fontWeight="semibold">Location</Text>
                            <select
                                value={filterLocation}
                                onChange={(e) => setFilterLocation(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '6px',
                                    border: '1px solid var(--chakra-colors-border)',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--chakra-colors-bg)',
                                    fontSize: '14px'
                                }}
                            >
                                <option value="">All Locations</option>
                                {PANTRY_LOCATIONS.map(location => (
                                    <option key={location} value={location}>{location}</option>
                                ))}
                            </select>
                        </Box>

                        <Box>
                            <Button
                                size="sm"
                                colorScheme={showExpiringSoon ? "red" : "gray"}
                                variant={showExpiringSoon ? "solid" : "outline"}
                                onClick={() => setShowExpiringSoon(!showExpiringSoon)}
                            >
                                {showExpiringSoon ? "Show All" : "Expiring Soon"}
                            </Button>
                        </Box>
                    </Grid>
                </Box>

                {/* Items List */}
                <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                    <Heading size="md" mb={4}>
                        Pantry Items ({filteredItems.length})
                    </Heading>

                    {filteredItems.length === 0 ? (
                        <Box textAlign="center" py={8}>
                            <Text color="gray.500">No items found matching your filters.</Text>
                        </Box>
                    ) : (
                        <Grid templateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={4}>
                            {filteredItems.map(item => {
                                const expStatus = getExpirationStatus(item.expirationDate);
                                const lowStock = isLowStock(item);

                                return (
                                    <Box
                                        key={item.id}
                                        p={4}
                                        border="1px solid"
                                        borderColor="gray.200"
                                        borderRadius="md"
                                        bg="bg"
                                        _hover={{ bg: 'gray.100' }}
                                    >
                                        <VStack align="stretch" gap={3}>
                                            {/* Item Header */}
                                            <Flex justify="space-between" align="start">
                                                <VStack align="start" gap={1}>
                                                    <Text fontWeight="bold" fontSize="lg">{item.name}</Text>
                                                    <HStack gap={2}>
                                                        <Badge colorScheme="blue" size="sm">{item.category}</Badge>
                                                        <Badge colorScheme="purple" size="sm">{item.location}</Badge>
                                                    </HStack>
                                                </VStack>
                                                <HStack>
                                                    <IconButton
                                                        aria-label="Edit item"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => openEditModal(item)}
                                                    >
                                                        <EditIcon />
                                                    </IconButton>
                                                    <IconButton
                                                        aria-label="Delete item"
                                                        size="sm"
                                                        variant="ghost"
                                                        colorScheme="red"
                                                        onClick={() => deleteItem(item.id!)}
                                                    >
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </HStack>
                                            </Flex>

                                            {/* Quantity Controls */}
                                            <HStack justify="space-between" align="center">
                                                <Text fontSize="sm" color="gray.600">Quantity:</Text>
                                                <HStack>
                                                    <Button
                                                        size="xs"
                                                        onClick={() => updateQuantity(item.id!, item.quantity - 0.5)}
                                                        disabled={item.quantity <= 0.5}
                                                    >
                                                        -
                                                    </Button>
                                                    <Text fontWeight="bold" minW="60px" textAlign="center">
                                                        {item.quantity} {item.unit}
                                                    </Text>
                                                    <Button
                                                        size="xs"
                                                        onClick={() => updateQuantity(item.id!, item.quantity + 0.5)}
                                                    >
                                                        +
                                                    </Button>
                                                </HStack>
                                            </HStack>

                                            {/* Status Indicators */}
                                            <VStack align="stretch" gap={1}>
                                                {lowStock && (
                                                    <HStack>
                                                        <WarningIcon />
                                                        <Text fontSize="sm" color="orange.600" fontWeight="semibold">
                                                            Low Stock (≤ {item.lowStockThreshold})
                                                        </Text>
                                                    </HStack>
                                                )}

                                                {expStatus && (
                                                    <Text fontSize="sm" color={`${expStatus.color}.600`} fontWeight="semibold">
                                                        {expStatus.text}
                                                    </Text>
                                                )}
                                            </VStack>

                                            {/* Notes */}
                                            {item.notes && (
                                                <Text fontSize="sm" color="gray.600" fontStyle="italic">
                                                    {item.notes}
                                                </Text>
                                            )}
                                        </VStack>
                                    </Box>
                                );
                            })}
                        </Grid>
                    )}
                </Box>

                {/* Development Notice */}
                <Box p={4} bg="orange.50" borderRadius="md" borderLeft="4px solid" borderColor="orange.400">
                    <Text fontWeight="medium" color="orange.800" mb={2}>
                        🚧 Development Feature
                    </Text>
                    <Text fontSize="sm" color="orange.700">
                        This is a new pantry management feature. Currently using sample data.
                        Database integration and grocery receipt sync coming soon!
                    </Text>
                </Box>
            </VStack>

            {/* Add/Edit Item Modal */}
            {showAddModal && (
                <Box
                    position="fixed"
                    top={0}
                    left={0}
                    right={0}
                    bottom={0}
                    bg="blackAlpha.600"
                    zIndex={1000}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    p={4}
                >
                    <Box
                        bg="bg"
                        borderRadius="md"
                        p={6}
                        maxW="500px"
                        width="100%"
                        maxH="90vh"
                        overflowY="auto"
                    >
                        <VStack gap={4} align="stretch">
                            <Flex justify="space-between" align="center">
                                <Heading size="md">
                                    {editingItem ? 'Edit Item' : 'Add New Item'}
                                </Heading>
                                <IconButton
                                    aria-label="Close modal"
                                    onClick={closeModal}
                                    variant="ghost"
                                    size="sm"
                                >
                                    <CloseIcon />
                                </IconButton>
                            </Flex>

                            <Grid templateColumns="1fr" gap={4}>
                                <Box>
                                    <Text mb={2} fontWeight="semibold">Item Name *</Text>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g., Milk, Rice, Bananas"
                                        list="ingredients-list"
                                    />
                                    <datalist id="ingredients-list">
                                        {availableIngredients.map(ing => (
                                            <option key={ing.id} value={ing.name} />
                                        ))}
                                    </datalist>
                                </Box>

                                <Grid templateColumns="1fr 1fr" gap={3}>
                                    <Box>
                                        <Text mb={2} fontWeight="semibold">Quantity *</Text>
                                        <Input
                                            type="number"
                                            value={formData.quantity}
                                            onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 1 })}
                                            min={0.01}
                                            step={0.1}
                                        />
                                    </Box>

                                    <Box>
                                        <Text mb={2} fontWeight="semibold">Unit</Text>
                                        <select
                                            value={formData.unit}
                                            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                border: '1px solid var(--chakra-colors-border)',
                                                borderRadius: '4px',
                                                backgroundColor: 'var(--chakra-colors-bg)',
                                            }}
                                        >
                                            {COMMON_UNITS.map(unit => (
                                                <option key={unit} value={unit}>{unit}</option>
                                            ))}
                                        </select>
                                    </Box>
                                </Grid>

                                <Grid templateColumns="1fr 1fr" gap={3}>
                                    <Box>
                                        <Text mb={2} fontWeight="semibold">Location</Text>
                                        <select
                                            value={formData.location}
                                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                border: '1px solid var(--chakra-colors-border)',
                                                borderRadius: '4px',
                                                backgroundColor: 'var(--chakra-colors-bg)',
                                            }}
                                        >
                                            {PANTRY_LOCATIONS.map(location => (
                                                <option key={location} value={location}>{location}</option>
                                            ))}
                                        </select>
                                    </Box>

                                    <Box>
                                        <Text mb={2} fontWeight="semibold">Category</Text>
                                        <select
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                border: '1px solid var(--chakra-colors-border)',
                                                borderRadius: '4px',
                                                backgroundColor: 'var(--chakra-colors-bg)',
                                            }}
                                        >
                                            {PANTRY_CATEGORIES.map(category => (
                                                <option key={category} value={category}>{category}</option>
                                            ))}
                                        </select>
                                    </Box>
                                </Grid>

                                <Grid templateColumns="1fr 1fr" gap={3}>
                                    <Box>
                                        <Text mb={2} fontWeight="semibold">Expiration Date</Text>
                                        <Input
                                            type="date"
                                            value={formData.expirationDate}
                                            onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                                        />
                                    </Box>

                                    <Box>
                                        <Text mb={2} fontWeight="semibold">Low Stock Alert</Text>
                                        <Input
                                            type="number"
                                            value={formData.lowStockThreshold}
                                            onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseFloat(e.target.value) || 1 })}
                                            min={0}
                                            step={0.1}
                                            placeholder="Alert when ≤ this amount"
                                        />
                                    </Box>
                                </Grid>

                                <Box>
                                    <Text mb={2} fontWeight="semibold">Notes</Text>
                                    <Textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        placeholder="Optional notes about this item..."
                                        rows={2}
                                    />
                                </Box>
                            </Grid>

                            <HStack justify="space-between" pt={4}>
                                <Button variant="outline" onClick={closeModal}>
                                    Cancel
                                </Button>
                                <Button colorScheme="green" onClick={handleSubmit}>
                                    {editingItem ? 'Update Item' : 'Add Item'}
                                </Button>
                            </HStack>
                        </VStack>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default Pantry;