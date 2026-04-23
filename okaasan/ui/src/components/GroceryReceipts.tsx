import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    VStack,
    HStack,
    Text,
    Button,
    Input,
    Textarea,
    Heading,
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

const ReceiptIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2L7.5 3.5L6 2v14H3v3c0 1.66 1.34 3 3 3h12c1.66 0 3-1.34 3-3V2l-1.5 1.5zM15 20H6c-.55 0-1-.45-1-1v-1h10v2zm4-1c0 .55-.45 1-1 1s-1-.45-1-1V5H8v10H7V4h11v15z" />
        <path d="M9 7h6v1H9zm0 2h6v1H9zm0 2h4v1H9z" />
    </svg>
);

const PasteIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 2h-4.18C14.4.84 13.3 0 12 0S9.6.84 9.18 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z" />
    </svg>
);

const CloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
);

interface GroceryItem {
    name: string;
    price: number;
    quantity: number;
    unit: string;
    category?: string;
}

interface GroceryReceipt {
    id?: string;
    storeName: string;
    purchaseDate: string;
    totalAmount: number;
    items: GroceryItem[];
    notes?: string;
}

const COMMON_UNITS = [
    'piece', 'g', 'kg', 'mg', 'ml', 'l', 'cl', 'cup', 'tbsp', 'tsp',
    'oz', 'lb', 'fl oz', 'pint', 'quart', 'gallon', 'cm3', 'box', 'bag', 'can'
];

const COMMON_CATEGORIES = [
    'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry',
    'Frozen', 'Beverages', 'Snacks', 'Health & Beauty', 'Household', 'Other'
];

const GroceryReceipts: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pastedText, setPastedText] = useState('');

    // Receipt form state
    const [storeName, setStoreName] = useState('');
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<GroceryItem[]>([
        { name: '', price: 0, quantity: 1, unit: 'piece', category: '' }
    ]);

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

    const addItem = () => {
        setItems([...items, { name: '', price: 0, quantity: 1, unit: 'piece', category: '' }]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const updateItem = (index: number, field: keyof GroceryItem, value: string | number) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };
        setItems(updated);
    };

    const calculateTotal = () => {
        return items.reduce((total, item) => total + (item.price || 0), 0);
    };

    // Receipt text parsing functions
    const parseReceiptText = (text: string) => {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        let parsedData = {
            storeName: '',
            purchaseDate: '',
            items: [] as GroceryItem[],
            totalAmount: 0
        };

        // Common store patterns (English and French)
        const storePatterns = [
            /walmart/i, /target/i, /kroger/i, /safeway/i, /costco/i, /sams club/i,
            /whole foods/i, /trader joe/i, /aldi/i, /publix/i, /wegmans/i, /meijer/i,
            /king soopers/i, /fred meyer/i, /smith/i, /food lion/i, /giant/i,
            /stop.*shop/i, /hannaford/i, /harris teeter/i,
            // French Canadian stores
            /metro/i, /marche/i, /alimentation/i, /super.?c/i, /couche.?tard/i,
            /provigo/i, /maxi/i, /loblaws/i, /no.?frills/i, /pharmaprix/i,
            /jean.?coutu/i, /costco/i, /walmart/i
        ];

        // Date patterns (various formats including French)
        const datePatterns = [
            /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
            /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/,
            /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i,
            /(\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i,
            // French date patterns
            /(jan|fév|mar|avr|mai|jun|jul|aoû|sep|oct|nov|déc)[a-z]*\s+\d{1,2},?\s+\d{4}/i,
            /(\d{1,2}\s+(jan|fév|mar|avr|mai|jun|jul|aoû|sep|oct|nov|déc)[a-z]*\s+\d{4})/i,
            // Receipt timestamp format DD/MM/YY
            /(\d{2}\/\d{2}\/\d{2})/
        ];

        // Price patterns (item with price) - updated for French Canadian format
        const itemPricePatterns = [
            /^(.+?)\s+(\$?\d+[.,]\d{2})$/,  // Standard format: ITEM NAME   $9.99
            /^(.+?)\s+(\d+[.,]\d{2})$/,     // Without $: ITEM NAME   9.99
            /^\s*(.+?)\s+(\d+[.,]\d{2})\s*$/, // With extra spaces
        ];

        // Total patterns (English and French)
        const totalPatterns = [
            /total[:\s]*\$?(\d+[.,]\d{2})/i,
            /amount[:\s]*\$?(\d+[.,]\d{2})/i,
            /balance[:\s]*\$?(\d+[.,]\d{2})/i,
            // French patterns
            /sous.?total[:\s]*(\d+[.,]\d{2})/i,
            /montant[:\s]*(\d+[.,]\d{2})/i
        ];

        // Parse store name (usually in first few lines)
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const line = lines[i];
            for (const pattern of storePatterns) {
                if (pattern.test(line)) {
                    parsedData.storeName = line;
                    break;
                }
            }
            if (parsedData.storeName) break;
        }

        // Parse date
        for (const line of lines) {
            for (const pattern of datePatterns) {
                const match = line.match(pattern);
                if (match) {
                    parsedData.purchaseDate = formatDateForInput(match[1] || match[0]);
                    break;
                }
            }
            if (parsedData.purchaseDate) break;
        }

        // Parse items and prices
        for (const line of lines) {
            // Skip common non-item lines (English and French)
            if (line.match(/(thank you|receipt|store|address|phone|total|subtotal|tax|cash|card|change|merci|adresse|téléphone|tel|programme|numéro|points|solde|ouvert|opinion|gagner|copie|client|datetime|compte|mastercard|approuvee|conservez)/i)) {
                continue;
            }

            // Try each price pattern
            let itemMatch = null;
            for (const pattern of itemPricePatterns) {
                itemMatch = line.match(pattern);
                if (itemMatch) break;
            }

            if (itemMatch) {
                const itemName = itemMatch[1].trim();
                const priceStr = itemMatch[2].replace(/[$\s]/g, '').replace(',', '.');
                const price = parseFloat(priceStr);

                if (itemName.length > 2 && price > 0) {
                    parsedData.items.push({
                        name: itemName,
                        price: price,
                        quantity: 1,
                        unit: 'piece',
                        category: ''
                    });
                }
            }
        }

        // Parse total
        for (const line of lines) {
            for (const pattern of totalPatterns) {
                const match = line.match(pattern);
                if (match) {
                    const totalStr = match[1].replace(',', '.');
                    parsedData.totalAmount = parseFloat(totalStr);
                    break;
                }
            }
            if (parsedData.totalAmount) break;
        }

        return parsedData;
    };

    const formatDateForInput = (dateStr: string): string => {
        try {
            // Handle DD/MM/YY format (common in receipts)
            const ddmmyy = dateStr.match(/(\d{2})\/(\d{2})\/(\d{2})/);
            if (ddmmyy) {
                const day = ddmmyy[1];
                const month = ddmmyy[2];
                let year = ddmmyy[3];
                // Assume 20XX for years 00-30, 19XX for years 31-99
                if (parseInt(year) <= 30) {
                    year = '20' + year;
                } else {
                    year = '19' + year;
                }
                // Convert DD/MM/YYYY to YYYY-MM-DD for input field
                return `${year}-${month}-${day}`;
            }

            // Handle other date formats
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
            return date.toISOString().split('T')[0];
        } catch {
            return new Date().toISOString().split('T')[0];
        }
    };

    const handlePasteReceipt = () => {
        if (!pastedText.trim()) {
            showMessage('Please paste receipt text first', 'error');
            return;
        }

        try {
            const parsed = parseReceiptText(pastedText);

            // Update form with parsed data
            if (parsed.storeName) setStoreName(parsed.storeName);
            if (parsed.purchaseDate) setPurchaseDate(parsed.purchaseDate);
            if (parsed.items.length > 0) setItems(parsed.items);

            setShowPasteModal(false);
            setPastedText('');

            showMessage(`Parsed ${parsed.items.length} items from receipt!`, 'success');
        } catch (error) {
            console.error('Error parsing receipt:', error);
            showMessage('Failed to parse receipt. Please check the format.', 'error');
        }
    };

    const validateForm = () => {
        if (!storeName.trim()) return 'Store name is required';
        if (!purchaseDate) return 'Purchase date is required';
        if (items.some(item => !item.name.trim())) return 'All items must have a name';
        if (items.some(item => item.price < 0)) return 'Item prices cannot be negative';
        if (items.some(item => item.quantity <= 0)) return 'Item quantities must be greater than 0';
        return null;
    };

    const handleSubmit = async () => {
        const error = validateForm();
        if (error) {
            showMessage(error, 'error');
            return;
        }

        setLoading(true);
        try {
            const receiptData: GroceryReceipt = {
                storeName: storeName.trim(),
                purchaseDate,
                totalAmount: calculateTotal(),
                items: items.map(item => ({
                    name: item.name.trim(),
                    price: item.price,
                    quantity: item.quantity,
                    unit: item.unit,
                    category: item.category || 'Other'
                })),
                notes: notes.trim()
            };

            // TODO: Implement API endpoint for saving grocery receipts
            console.log('Receipt data to save:', receiptData);

            showMessage(`Receipt from ${storeName} saved successfully!`, 'success');

            // Clear form after successful save
            setTimeout(() => {
                clearForm();
            }, 1500);
        } catch (error) {
            console.error('Error saving receipt:', error);
            showMessage('Failed to save receipt. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const clearForm = () => {
        setStoreName('');
        setPurchaseDate(new Date().toISOString().split('T')[0]);
        setNotes('');
        setItems([{ name: '', price: 0, quantity: 1, unit: 'piece', category: '' }]);
        setMessage(null);
    };

    const totalAmount = calculateTotal();

    return (
        <Box p={6} maxW="5xl" mx="auto">
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
                            <ReceiptIcon />
                            <Heading size="lg">Add Grocery Receipt</Heading>
                        </Flex>
                        <Button
                            onClick={() => setShowPasteModal(true)}
                            colorScheme="purple"
                            variant="outline"
                            size="md"
                        >
                            <PasteIcon /> Paste Receipt
                        </Button>
                    </Flex>
                    <Text color="gray.600">
                        Enter your grocery receipt details manually or paste receipt text to auto-populate.
                    </Text>
                </Box>

                {/* Receipt Information */}
                <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                    <Heading size="md" mb={4}>Receipt Information</Heading>
                    <Grid templateColumns="repeat(auto-fit, minmax(250px, 1fr))" gap={4}>
                        <Box>
                            <Text mb={2} fontWeight="semibold">Store Name *</Text>
                            <Input
                                value={storeName}
                                onChange={(e) => setStoreName(e.target.value)}
                                placeholder="e.g., Walmart, Target, Kroger"
                                size="lg"
                                required
                            />
                        </Box>

                        <Box>
                            <Text mb={2} fontWeight="semibold">Purchase Date *</Text>
                            <Input
                                type="date"
                                value={purchaseDate}
                                onChange={(e) => setPurchaseDate(e.target.value)}
                                size="lg"
                                required
                            />
                        </Box>

                        <Box>
                            <Text mb={2} fontWeight="semibold">Total Amount</Text>
                            <Input
                                value={`$${totalAmount.toFixed(2)}`}
                                readOnly
                                bg="gray.50"
                                size="lg"
                                fontWeight="bold"
                                color="green.600"
                            />
                        </Box>
                    </Grid>

                    <Box mt={4}>
                        <Text mb={2} fontWeight="semibold">Notes (Optional)</Text>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any additional notes about this shopping trip..."
                            rows={2}
                        />
                    </Box>
                </Box>

                {/* Items */}
                <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                    <HStack justify="space-between" mb={4}>
                        <Heading size="md">Items ({items.length})</Heading>
                        <Button onClick={addItem} colorScheme="green" size="sm">
                            <AddIcon /> Add Item
                        </Button>
                    </HStack>

                    <VStack gap={3} align="stretch">
                        {/* Header Row */}
                        <Grid templateColumns="2fr 80px 80px 100px 120px 40px" gap={3} alignItems="center">
                            <Text fontSize="sm" fontWeight="semibold" color="gray.600">Item Name</Text>
                            <Text fontSize="sm" fontWeight="semibold" color="gray.600">Price</Text>
                            <Text fontSize="sm" fontWeight="semibold" color="gray.600">Qty</Text>
                            <Text fontSize="sm" fontWeight="semibold" color="gray.600">Unit</Text>
                            <Text fontSize="sm" fontWeight="semibold" color="gray.600">Category</Text>
                            <Text fontSize="sm" fontWeight="semibold" color="gray.600"></Text>
                        </Grid>

                        {items.map((item, index) => (
                            <Grid key={index} templateColumns="2fr 80px 80px 100px 120px 40px" gap={3} alignItems="center" p={3} bg="bg" borderRadius="md">
                                <Box>
                                    <Input
                                        value={item.name}
                                        onChange={(e) => updateItem(index, 'name', e.target.value)}
                                        placeholder="e.g., Bananas, Milk, Bread"
                                        list={`items-${index}`}
                                        size="sm"
                                    />
                                    <datalist id={`items-${index}`}>
                                        {availableIngredients.map(ing => (
                                            <option key={ing.id} value={ing.name} />
                                        ))}
                                    </datalist>
                                </Box>

                                <Box>
                                    <Input
                                        type="number"
                                        value={item.price}
                                        onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value) || 0)}
                                        min={0}
                                        step={0.01}
                                        size="sm"
                                        placeholder="0.00"
                                    />
                                </Box>

                                <Box>
                                    <Input
                                        type="number"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                                        min={0.01}
                                        step={0.1}
                                        size="sm"
                                    />
                                </Box>

                                <Box>
                                    <select
                                        value={item.unit}
                                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '6px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            borderRadius: '4px',
                                            backgroundColor: 'var(--chakra-colors-bg)',
                                            fontSize: '14px'
                                        }}
                                    >
                                        {COMMON_UNITS.map(unit => (
                                            <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                    </select>
                                </Box>

                                <Box>
                                    <select
                                        value={item.category}
                                        onChange={(e) => updateItem(index, 'category', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '6px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            borderRadius: '4px',
                                            backgroundColor: 'var(--chakra-colors-bg)',
                                            fontSize: '14px'
                                        }}
                                    >
                                        <option value="">Select...</option>
                                        {COMMON_CATEGORIES.map(category => (
                                            <option key={category} value={category}>{category}</option>
                                        ))}
                                    </select>
                                </Box>

                                <IconButton
                                    aria-label="Remove item"
                                    onClick={() => removeItem(index)}
                                    colorScheme="red"
                                    variant="ghost"
                                    size="sm"
                                    disabled={items.length === 1}
                                >
                                    <DeleteIcon />
                                </IconButton>
                            </Grid>
                        ))}

                        {/* Total Row */}
                        <Box mt={4} p={4} bg="bg" borderRadius="md" border="1px solid" borderColor="blue.200">
                            <HStack justify="space-between">
                                <Text fontSize="lg" fontWeight="semibold">Total Receipt Amount:</Text>
                                <Text fontSize="xl" fontWeight="bold" color="green.600">
                                    ${totalAmount.toFixed(2)}
                                </Text>
                            </HStack>
                        </Box>
                    </VStack>
                </Box>

                {/* Action Buttons */}
                <HStack justify="space-between" pt={4}>
                    <Button variant="outline" onClick={clearForm} size="lg">
                        Clear Form
                    </Button>
                    <HStack>
                        <Button variant="ghost" onClick={() => navigate('/planning')} size="lg">
                            Cancel
                        </Button>
                        <Button
                            colorScheme="blue"
                            onClick={handleSubmit}
                            disabled={loading}
                            size="lg"
                        >
                            {loading ? 'Saving Receipt...' : 'Save Receipt'}
                        </Button>
                    </HStack>
                </HStack>

                {/* Development Notice */}
                <Box p={4} bg="orange.50" borderRadius="md" borderLeft="4px solid" borderColor="orange.400">
                    <Text fontWeight="medium" color="orange.800" mb={2}>
                        🚧 Development Feature
                    </Text>
                    <Text fontSize="sm" color="orange.700">
                        This is a new feature for tracking grocery receipts.
                        Currently, data is logged to console. Database integration coming soon!
                    </Text>
                </Box>
            </VStack>

            {/* Paste Receipt Modal */}
            {showPasteModal && (
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
                        maxW="600px"
                        width="100%"
                        maxH="80vh"
                        overflowY="auto"
                    >
                        <VStack gap={4} align="stretch">
                            <Flex justify="space-between" align="center">
                                <Heading size="md">Paste Receipt Text</Heading>
                                <IconButton
                                    aria-label="Close modal"
                                    onClick={() => {
                                        setShowPasteModal(false);
                                        setPastedText('');
                                    }}
                                    variant="ghost"
                                    size="sm"
                                >
                                    <CloseIcon />
                                </IconButton>
                            </Flex>

                            <Box>
                                <Text mb={3} fontSize="sm" color="gray.600">
                                    Copy and paste the text from your email receipt or scan the text from a paper receipt.
                                    The system will automatically try to extract store name, date, items, and prices.
                                </Text>

                                <Box p={3} bg="blue.50" borderRadius="md" mb={3}>
                                    <Text fontSize="sm" fontWeight="semibold" color="blue.800" mb={1}>
                                        💡 Tips for better parsing:
                                    </Text>
                                    <Text fontSize="xs" color="blue.700">
                                        • Include the store name and date if possible<br />
                                        • Make sure items and prices are on the same line<br />
                                        • Remove extra formatting if items aren't parsing correctly
                                    </Text>
                                </Box>

                                <Textarea
                                    value={pastedText}
                                    onChange={(e) => setPastedText(e.target.value)}
                                    placeholder="Paste your receipt text here...

Examples:

English:
WALMART SUPERCENTER
12/15/2023
BANANAS                 $2.48
MILK GALLON            $3.99
TOTAL                  $6.47

French Canadian:
Marche Alimentation Domaine Inc.
30/08/2025
SIMPLY JUS REF.1                9.99
NATUROEUF OEUF G                8.89
TOTAL                          18.88"
                                    rows={15}
                                    fontSize="sm"
                                    fontFamily="monospace"
                                />
                            </Box>

                            <HStack justify="space-between" pt={2}>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowPasteModal(false);
                                        setPastedText('');
                                    }}
                                >
                                    Cancel
                                </Button>
                                <HStack>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setPastedText('')}
                                        disabled={!pastedText.trim()}
                                    >
                                        Clear
                                    </Button>
                                    <Button
                                        colorScheme="purple"
                                        onClick={handlePasteReceipt}
                                        disabled={!pastedText.trim()}
                                    >
                                        Parse Receipt
                                    </Button>
                                </HStack>
                            </HStack>
                        </VStack>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default GroceryReceipts;