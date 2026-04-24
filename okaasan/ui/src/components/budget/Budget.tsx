import React, { useState, useEffect } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Button,
    Input,
    Heading,
    Badge,
    IconButton,
    Grid,
    Flex,
} from '@chakra-ui/react';

// Custom Progress Bar Component
const ProgressBar: React.FC<{ value: number; colorScheme?: string; size?: string }> = ({
    value,
    colorScheme = 'blue',
    size = 'md'
}) => {
    const height = size === 'sm' ? '4px' : size === 'md' ? '8px' : '12px';
    const clampedValue = Math.min(Math.max(value, 0), 100);

    const getColor = () => {
        switch (colorScheme) {
            case 'green': return '#38A169';
            case 'red': return '#E53E3E';
            case 'orange': return '#DD6B20';
            case 'blue': return '#3182CE';
            case 'purple': return '#805AD5';
            default: return '#3182CE';
        }
    };

    return (
        <Box
            width="100%"
            height={height}
            bg="gray.200"
            borderRadius="full"
            overflow="hidden"
        >
            <Box
                height="100%"
                width={`${clampedValue}%`}
                bg={getColor()}
                transition="width 0.3s ease"
            />
        </Box>
    );
};

// Custom icon components
const BudgetIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z" />
    </svg>
);



const EditIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
);

const CloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
);

interface BudgetCategory {
    name: string;
    budgeted: number;
    spent: number;
    color: string;
}

interface SpendingEntry {
    id: string;
    date: string;
    store: string;
    category: string;
    amount: number;
    items: number;
}

interface MonthlyBudget {
    month: string;
    totalBudget: number;
    totalSpent: number;
    categories: BudgetCategory[];
}

const Budget: React.FC = () => {
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [showBudgetModal, setShowBudgetModal] = useState(false);

    // Sample data - in real app, this would come from API/database
    const [currentBudget, setCurrentBudget] = useState<MonthlyBudget>({
        month: 'January 2024',
        totalBudget: 600,
        totalSpent: 387.45,
        categories: [
            { name: 'Produce', budgeted: 150, spent: 89.32, color: 'green' },
            { name: 'Meat & Seafood', budgeted: 120, spent: 98.76, color: 'red' },
            { name: 'Dairy & Eggs', budgeted: 80, spent: 45.23, color: 'blue' },
            { name: 'Pantry Staples', budgeted: 100, spent: 67.89, color: 'purple' },
            { name: 'Frozen', budgeted: 60, spent: 34.12, color: 'cyan' },
            { name: 'Beverages', budgeted: 50, spent: 28.45, color: 'orange' },
            { name: 'Snacks', budgeted: 40, spent: 23.68, color: 'pink' }
        ]
    });

    const [recentSpending] = useState<SpendingEntry[]>([
        { id: '1', date: '2024-01-15', store: 'Metro', category: 'Produce', amount: 23.45, items: 8 },
        { id: '2', date: '2024-01-14', store: 'Walmart', category: 'Pantry Staples', amount: 45.67, items: 12 },
        { id: '3', date: '2024-01-12', store: 'Costco', category: 'Meat & Seafood', amount: 89.23, items: 6 },
        { id: '4', date: '2024-01-10', store: 'Metro', category: 'Dairy & Eggs', amount: 18.99, items: 4 },
        { id: '5', date: '2024-01-08', store: 'Provigo', category: 'Frozen', amount: 34.12, items: 7 }
    ]);

    const [weeklySpending] = useState([
        { week: 'Week 1', amount: 125.34 },
        { week: 'Week 2', amount: 98.76 },
        { week: 'Week 3', amount: 163.35 },
        { week: 'Current', amount: 87.45 }
    ]);

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

    const getBudgetStatus = (budgeted: number, spent: number) => {
        const percentage = (spent / budgeted) * 100;
        if (percentage >= 100) return { status: 'over', color: 'red' };
        if (percentage >= 80) return { status: 'warning', color: 'orange' };
        return { status: 'good', color: 'green' };
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-CA', {
            style: 'currency',
            currency: 'CAD'
        }).format(amount);
    };

    const getSpendingByStore = () => {
        const storeSpending = recentSpending.reduce((acc, entry) => {
            acc[entry.store] = (acc[entry.store] || 0) + entry.amount;
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(storeSpending)
            .map(([store, amount]) => ({ store, amount }))
            .sort((a, b) => b.amount - a.amount);
    };

    const getAverageWeeklySpending = () => {
        const total = weeklySpending.reduce((sum, week) => sum + week.amount, 0);
        return total / weeklySpending.length;
    };

    const remainingBudget = currentBudget.totalBudget - currentBudget.totalSpent;
    const budgetPercentage = (currentBudget.totalSpent / currentBudget.totalBudget) * 100;
    const storeSpending = getSpendingByStore();
    const avgWeeklySpending = getAverageWeeklySpending();

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
                            <BudgetIcon />
                            <Heading size="lg">Food Budget</Heading>
                        </Flex>
                        <HStack>
                            <Button
                                variant="outline"
                                size="md"
                                onClick={() => setShowBudgetModal(true)}
                            >
                                <EditIcon /> Edit Budget
                            </Button>
                        </HStack>
                    </Flex>
                    <Text color="gray.600">
                        Track and visualize your food spending across categories and time periods.
                    </Text>
                </Box>

                {/* Budget Overview */}
                <Grid templateColumns="repeat(auto-fit, minmax(250px, 1fr))" gap={4}>
                    <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <VStack align="stretch" gap={3}>
                            <Text fontSize="sm" color="gray.500">Monthly Budget</Text>
                            <Text fontSize="3xl" fontWeight="bold" color="blue.600">
                                {formatCurrency(currentBudget.totalBudget)}
                            </Text>
                            <Text fontSize="sm" color="gray.600">{currentBudget.month}</Text>
                        </VStack>
                    </Box>

                    <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <VStack align="stretch" gap={3}>
                            <Text fontSize="sm" color="gray.500">Total Spent</Text>
                            <Text fontSize="3xl" fontWeight="bold" color="green.600">
                                {formatCurrency(currentBudget.totalSpent)}
                            </Text>
                            <ProgressBar
                                value={budgetPercentage}
                                colorScheme={budgetPercentage > 80 ? 'red' : budgetPercentage > 60 ? 'orange' : 'green'}
                                size="sm"
                            />
                            <Text fontSize="xs" color="gray.500">
                                {budgetPercentage.toFixed(1)}% of budget used
                            </Text>
                        </VStack>
                    </Box>

                    <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <VStack align="stretch" gap={3}>
                            <Text fontSize="sm" color="gray.500">Remaining</Text>
                            <Text
                                fontSize="3xl"
                                fontWeight="bold"
                                color={remainingBudget < 0 ? 'red.600' : 'orange.600'}
                            >
                                {formatCurrency(remainingBudget)}
                            </Text>
                            <Text fontSize="sm" color="gray.600">
                                {remainingBudget < 0 ? 'Over budget' : 'Left to spend'}
                            </Text>
                        </VStack>
                    </Box>

                    <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <VStack align="stretch" gap={3}>
                            <Text fontSize="sm" color="gray.500">Weekly Average</Text>
                            <Text fontSize="3xl" fontWeight="bold" color="purple.600">
                                {formatCurrency(avgWeeklySpending)}
                            </Text>
                            <Text fontSize="sm" color="gray.600">
                                Based on last 4 weeks
                            </Text>
                        </VStack>
                    </Box>
                </Grid>

                {/* Category Breakdown */}
                <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                    <Heading size="md" mb={4}>Spending by Category</Heading>
                    <VStack gap={4} align="stretch">
                        {currentBudget.categories.map((category, index) => {
                            const status = getBudgetStatus(category.budgeted, category.spent);
                            const percentage = (category.spent / category.budgeted) * 100;

                            return (
                                <Box key={index} p={4} bg="bg" borderRadius="md">
                                    <Flex justify="space-between" align="center" mb={2}>
                                        <Text fontWeight="semibold">{category.name}</Text>
                                        <HStack>
                                            <Text fontSize="sm" color="gray.600">
                                                {formatCurrency(category.spent)} / {formatCurrency(category.budgeted)}
                                            </Text>
                                            <Badge colorScheme={status.color} size="sm">
                                                {percentage.toFixed(0)}%
                                            </Badge>
                                        </HStack>
                                    </Flex>
                                    <ProgressBar
                                        value={Math.min(percentage, 100)}
                                        colorScheme={status.color}
                                        size="md"
                                    />
                                    {percentage > 100 && (
                                        <Text fontSize="xs" color="red.600" mt={1}>
                                            Over budget by {formatCurrency(category.spent - category.budgeted)}
                                        </Text>
                                    )}
                                </Box>
                            );
                        })}
                    </VStack>
                </Box>

                <Grid templateColumns="repeat(auto-fit, minmax(400px, 1fr))" gap={6}>
                    {/* Weekly Spending Trend */}
                    <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <Heading size="md" mb={4}>Weekly Spending Trend</Heading>
                        <VStack gap={3} align="stretch">
                            {weeklySpending.map((week, index) => {
                                const maxAmount = Math.max(...weeklySpending.map(w => w.amount));
                                const percentage = (week.amount / maxAmount) * 100;

                                return (
                                    <Box key={index}>
                                        <Flex justify="space-between" align="center" mb={1}>
                                            <Text fontSize="sm" fontWeight="semibold">{week.week}</Text>
                                            <Text fontSize="sm" color="gray.600">
                                                {formatCurrency(week.amount)}
                                            </Text>
                                        </Flex>
                                        <ProgressBar
                                            value={percentage}
                                            colorScheme="blue"
                                            size="sm"
                                        />
                                    </Box>
                                );
                            })}
                        </VStack>
                    </Box>

                    {/* Spending by Store */}
                    <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <Heading size="md" mb={4}>Spending by Store</Heading>
                        <VStack gap={3} align="stretch">
                            {storeSpending.map((store, index) => {
                                const maxAmount = Math.max(...storeSpending.map(s => s.amount));
                                const percentage = (store.amount / maxAmount) * 100;

                                return (
                                    <Box key={index}>
                                        <Flex justify="space-between" align="center" mb={1}>
                                            <Text fontSize="sm" fontWeight="semibold">{store.store}</Text>
                                            <Text fontSize="sm" color="gray.600">
                                                {formatCurrency(store.amount)}
                                            </Text>
                                        </Flex>
                                        <ProgressBar
                                            value={percentage}
                                            colorScheme="green"
                                            size="sm"
                                        />
                                    </Box>
                                );
                            })}
                        </VStack>
                    </Box>
                </Grid>

                {/* Recent Transactions */}
                <Box p={6} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                    <Heading size="md" mb={4}>Recent Transactions</Heading>
                    <VStack gap={2} align="stretch">
                        {recentSpending.map((entry) => (
                            <Box key={entry.id} p={3} bg="bg" borderRadius="md">
                                <Flex justify="space-between" align="center">
                                    <HStack gap={4}>
                                        <VStack align="start" gap={0}>
                                            <Text fontWeight="semibold">{entry.store}</Text>
                                            <Text fontSize="sm" color="gray.600">{entry.date}</Text>
                                        </VStack>
                                        <Badge colorScheme="blue" size="sm">{entry.category}</Badge>
                                        <Text fontSize="sm" color="gray.600">{entry.items} items</Text>
                                    </HStack>
                                    <Text fontWeight="bold" fontSize="lg">
                                        {formatCurrency(entry.amount)}
                                    </Text>
                                </Flex>
                            </Box>
                        ))}
                    </VStack>
                </Box>

                {/* Development Notice */}
                <Box p={4} bg="orange.50" borderRadius="md" borderLeft="4px solid" borderColor="orange.400">
                    <Text fontWeight="medium" color="orange.800" mb={2}>
                        🚧 Development Feature
                    </Text>
                    <Text fontSize="sm" color="orange.700">
                        This budget tracking feature uses sample data. Integration with grocery receipts
                        and real spending data coming soon!
                    </Text>
                </Box>
            </VStack>

            {/* Edit Budget Modal */}
            {showBudgetModal && (
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
                                <Heading size="md">Edit Monthly Budget</Heading>
                                <IconButton
                                    aria-label="Close modal"
                                    onClick={() => setShowBudgetModal(false)}
                                    variant="ghost"
                                    size="sm"
                                >
                                    <CloseIcon />
                                </IconButton>
                            </Flex>

                            <Box>
                                <Text mb={2} fontWeight="semibold">Total Monthly Budget</Text>
                                <Input
                                    type="number"
                                    value={currentBudget.totalBudget}
                                    onChange={(e) => setCurrentBudget({
                                        ...currentBudget,
                                        totalBudget: parseFloat(e.target.value) || 0
                                    })}
                                    min={0}
                                    step={10}
                                />
                            </Box>

                            <Box>
                                <Text mb={3} fontWeight="semibold">Category Budgets</Text>
                                <VStack gap={3} align="stretch">
                                    {currentBudget.categories.map((category, index) => (
                                        <HStack key={index}>
                                            <Text minW="120px" fontSize="sm">{category.name}</Text>
                                            <Input
                                                type="number"
                                                value={category.budgeted}
                                                onChange={(e) => {
                                                    const newCategories = [...currentBudget.categories];
                                                    newCategories[index].budgeted = parseFloat(e.target.value) || 0;
                                                    setCurrentBudget({
                                                        ...currentBudget,
                                                        categories: newCategories
                                                    });
                                                }}
                                                min={0}
                                                step={5}
                                                size="sm"
                                            />
                                        </HStack>
                                    ))}
                                </VStack>
                            </Box>

                            <HStack justify="space-between" pt={4}>
                                <Button variant="outline" onClick={() => setShowBudgetModal(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    colorScheme="blue"
                                    onClick={() => {
                                        setShowBudgetModal(false);
                                        showMessage('Budget updated successfully!', 'success');
                                    }}
                                >
                                    Save Changes
                                </Button>
                            </HStack>
                        </VStack>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default Budget;