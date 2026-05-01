import React, { useState, useEffect } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Button,
    Input,
    Textarea,
    Flex,
} from '@chakra-ui/react';
import { recipeAPI } from '../../services/api';
import type { Task, TaskPeriodicity } from '../../services/type';
import { DEFAULT_TASK_TAGS } from '../../services/type';

const PERIODICITIES: { value: TaskPeriodicity; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Biweekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
];

const TAG_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    Work: { bg: 'blue.50', color: 'blue.700', border: 'blue.200' },
    Sport: { bg: 'green.50', color: 'green.700', border: 'green.200' },
    Free: { bg: 'purple.50', color: 'purple.700', border: 'purple.200' },
};

interface TaskNode {
    task: Task;
    children: TaskNode[];
    level: number;
}

const Tasks: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [taskTree, setTaskTree] = useState<TaskNode[]>([]);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [formData, setFormData] = useState<Partial<Task>>({
        title: '',
        description: '',
        datetime_deadline: '',
        priority: 0,
        price_budget: 0,
        price_real: 0,
        people_count: 1,
        tag: [],
        recuring: false,
        periodicity: undefined,
        time_estimate: undefined,
    });
    const [editingSubtasks, setEditingSubtasks] = useState<Map<number, Task[]>>(new Map());
    const [availableTags, setAvailableTags] = useState<string[]>([...DEFAULT_TASK_TAGS]);

    useEffect(() => {
        fetchTasks();
        recipeAPI.getRoutineEvents('default', 'work')
            .then(events => {
                const titles = [...new Set(
                    events.map(e => e.title).filter(Boolean)
                        .map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
                )];
                if (titles.length > 0) setAvailableTags(titles);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        buildTaskTree();
    }, [tasks]);

    const fetchTasks = async () => {
        try {
            const tasksData = await recipeAPI.getTasks();
            console.log('Loaded tasks:', tasksData);
            setTasks(tasksData);
        } catch (error) {
            console.error('Error fetching tasks:', error);
            // For demo purposes, create some sample tasks
            setTasks(generateSampleTasks());
        }
    };

    const generateSampleTasks = (): Task[] => {
        return [
            {
                id: 1,
                title: 'Project Planning',
                description: 'Plan the entire project structure and timeline',
                datetime_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                done: false,
                price_budget: 1000,
                price_real: 0,
                people_count: 3,
                template: false,
                recuring: false,
                active: true,
            },
            {
                id: 2,
                title: 'Design System',
                description: 'Create and implement the design system',
                datetime_deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                done: false,
                price_budget: 500,
                price_real: 0,
                people_count: 2,
                template: false,
                recuring: false,
                active: true,
            },
            {
                id: 3,
                title: 'Code Review',
                description: 'Review all code changes and provide feedback',
                datetime_deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                done: true,
                price_budget: 200,
                price_real: 150,
                people_count: 1,
                template: false,
                recuring: false,
                active: true,
            }
        ];
    };

    const buildTaskTree = () => {
        // Convert hierarchical Task objects to TaskNode objects
        const convertToTaskNode = (task: Task, level: number): TaskNode => {
            return {
                task,
                children: (task.children || []).map(child => convertToTaskNode(child, level + 1)),
                level
            };
        };

        // Tasks from backend are already hierarchical with children
        // Just convert to TaskNode format
        const rootTasks = tasks.map(task => convertToTaskNode(task, 0));
        setTaskTree(rootTasks);
    };

    const calculateProgress = (taskNode: TaskNode): number => {
        if (taskNode.children.length === 0) {
            return taskNode.task.done ? 100 : 0;
        }

        const childProgress = taskNode.children.map(calculateProgress);
        const avgProgress = childProgress.reduce((sum, progress) => sum + progress, 0) / childProgress.length;

        // If the task itself is done, give it full credit
        if (taskNode.task.done) {
            return Math.max(avgProgress, 100);
        }

        return avgProgress;
    };

    const handleTaskToggle = async (task: Task) => {
        try {
            const updatedTask = { ...task, done: !task.done };
            await recipeAPI.updateTask(task.id!, updatedTask);
            fetchTasks();
        } catch (error) {
            console.error('Error updating task:', error);
        }
    };

    const handleCreateTask = () => {
        setEditingTask(null);
        setFormData({
            title: '',
            description: '',
            datetime_deadline: '',
            priority: 0,
            price_budget: 0,
            price_real: 0,
            people_count: 1,
            tag: [],
            recuring: false,
            periodicity: undefined,
            time_estimate: undefined,
        });
        setShowForm(true);
    };

    const handleEditTask = (task: Task) => {
        setEditingTask(task);
        setFormData({
            title: task.title,
            description: task.description || '',
            datetime_deadline: task.datetime_deadline ? task.datetime_deadline.slice(0, 16) : '',
            priority: task.priority || 0,
            price_budget: task.price_budget || 0,
            price_real: task.price_real || 0,
            people_count: task.people_count || 1,
            template: task.template || false,
            recuring: task.recuring || false,
            active: task.active !== false,
            done: task.done || false,
            tag: task.tag || [],
            periodicity: task.periodicity,
            time_estimate: task.time_estimate,
        });
        setShowEditModal(true);
    };

    const handleSaveTask = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingTask) {
                await recipeAPI.updateTask(editingTask.id!, formData);
            } else {
                await recipeAPI.createTask({
                    ...formData,
                    done: false,
                    template: false,
                    recuring: formData.recuring || false,
                    active: true,
                    priority: formData.priority || 0,
                    tag: formData.tag,
                    periodicity: formData.periodicity,
                    time_estimate: formData.time_estimate,
                } as Omit<Task, 'id'>);
            }

            fetchTasks();
            setShowForm(false);
            setShowEditModal(false);
            setEditingTask(null);
        } catch (error) {
            console.error('Error saving task:', error);
        }
    };

    const handleCancel = () => {
        setShowForm(false);
        setEditingTask(null);
    };

    const handleModalCancel = () => {
        setShowEditModal(false);
        setEditingTask(null);
    };

    const handleDeleteTask = async (task: Task) => {
        if (!task.id) return;
        try {
            await recipeAPI.deleteTask(task.id);
            fetchTasks();
            setShowEditModal(false);
            setEditingTask(null);
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };





    // Helper function to get all subtask nodes recursively
    const getAllSubtaskNodes = (node: TaskNode): TaskNode[] => {
        const result: TaskNode[] = [];
        node.children.forEach(child => {
            result.push(child);
            result.push(...getAllSubtaskNodes(child));
        });
        return result;
    };

    const handleSubtaskChange = (parentId: number, index: number, value: string) => {
        const currentSubtasks = editingSubtasks.get(parentId) || [];
        const updatedSubtasks = [...currentSubtasks];

        if (index >= updatedSubtasks.length) {
            // Add new subtask with default priority 0
            updatedSubtasks.push({
                id: -(Date.now() + index), // Temporary negative ID
                title: value,
                description: '',
                datetime_deadline: undefined,
                done: false,
                priority: 0, // Default priority is 0
                price_budget: 0,
                price_real: 0,
                people_count: 1,
                template: false,
                recuring: false,
                active: true,
            });
        } else {
            // Update existing subtask
            updatedSubtasks[index] = { ...updatedSubtasks[index], title: value };
        }

        editingSubtasks.set(parentId, updatedSubtasks);
        setEditingSubtasks(new Map(editingSubtasks));
    };

    const handleMoveUp = async (taskNode: TaskNode, currentIndex: number) => {
        if (currentIndex === 0) return; // Already at top, no task above

        const taskAbove = taskTree[currentIndex - 1];
        const newPriority = (taskAbove.task.priority ?? 0) + 1;

        console.log('Current task:', taskNode.task);
        console.log('Task above:', taskAbove.task);
        console.log('New priority calculated:', newPriority);

        // Update the current task's priority
        const updatedTask = {
            title: taskNode.task.title,
            description: taskNode.task.description,
            datetime_deadline: taskNode.task.datetime_deadline,
            done: taskNode.task.done,
            priority: newPriority,
            price_budget: taskNode.task.price_budget,
            price_real: taskNode.task.price_real,
            people_count: taskNode.task.people_count,
            template: taskNode.task.template,
            recuring: taskNode.task.recuring,
            active: taskNode.task.active,
        };
        console.log('Moving task up - sending data:', updatedTask);

        try {
            await recipeAPI.updateTask(taskNode.task.id!, updatedTask);
            fetchTasks(); // Refresh to get updated order
        } catch (error) {
            console.error('Error moving task up:', error);
        }
    };

    const handleMoveDown = async (taskNode: TaskNode, currentIndex: number) => {
        if (currentIndex === taskTree.length - 1) return; // Already at bottom, no task below

        const taskBelow = taskTree[currentIndex + 1];
        const newPriority = (taskBelow.task.priority ?? 0) - 1;

        // Update the current task's priority
        const updatedTask = {
            title: taskNode.task.title,
            description: taskNode.task.description,
            datetime_deadline: taskNode.task.datetime_deadline,
            done: taskNode.task.done,
            priority: newPriority,
            price_budget: taskNode.task.price_budget,
            price_real: taskNode.task.price_real,
            people_count: taskNode.task.people_count,
            template: taskNode.task.template,
            recuring: taskNode.task.recuring,
            active: taskNode.task.active,
        };
        console.log('Moving task down - sending data:', updatedTask);

        try {
            await recipeAPI.updateTask(taskNode.task.id!, updatedTask);
            fetchTasks(); // Refresh to get updated order
        } catch (error) {
            console.error('Error moving task down:', error);
        }
    };



    const handleSaveSubtasks = async (parentId: number) => {
        try {
            const subtasksToSave = editingSubtasks.get(parentId) || [];

            // Find the parent task to get its root_id
            const findTaskById = (tasks: Task[], id: number): Task | null => {
                for (const task of tasks) {
                    if (task.id === id) return task;
                    if (task.children) {
                        const found = findTaskById(task.children, id);
                        if (found) return found;
                    }
                }
                return null;
            };

            const parentTask = findTaskById(tasks, parentId);
            const rootId = parentTask?.root_id || parentTask?.id;

            for (const subtask of subtasksToSave) {
                if (subtask.title.trim()) {
                    // Create the subtask with parent_id and root_id
                    await recipeAPI.createTask({
                        title: subtask.title,
                        description: subtask.description || '',
                        datetime_deadline: subtask.datetime_deadline,
                        priority: subtask.priority || 0,
                        price_budget: subtask.price_budget || 0,
                        price_real: subtask.price_real || 0,
                        people_count: subtask.people_count || 1,
                        done: false,
                        template: false,
                        recuring: false,
                        active: true,
                        parent_id: parentId,
                        root_id: rootId,
                    });
                }
            }

            // Clear the editing state
            editingSubtasks.delete(parentId);
            setEditingSubtasks(new Map(editingSubtasks));

            // Refresh the task list
            fetchTasks();
        } catch (error) {
            console.error('Error saving subtasks:', error);
        }
    };

    const renderProgressBar = (value: number) => (
        <Box paddingBottom="10px">
            <Box
                position="relative"
                w="100%"
                bg="gray.200"
                borderRadius="full"
                h="16px"
                display="flex"
                alignItems="center"
                justifyContent="center"
            >
                <Box
                    bg="orange.500"
                    h="16px"
                    borderRadius="full"
                    w={`${value}%`}
                    transition="width 0.3s ease"
                    position="absolute"
                    left="0"
                    top="0"
                />
                <Text
                    fontSize="xs"
                    fontWeight="medium"
                    color="gray.700"
                    position="relative"
                    zIndex="1"
                >
                    {Math.round(value)}%
                </Text>
            </Box>
        </Box>
    );



    const renderTaskNodeContent = (taskNode: TaskNode, index?: number): React.ReactElement => {
        const hasSubtasks = taskNode.children.length > 0;
        const currentSubtasks = editingSubtasks.get(taskNode.task.id!) || [];
        const showSubtasks = taskNode.level < 3; // Show up to 3 levels always
        const isRootTask = taskNode.level === 0;

        return (
            <>
                {isRootTask && (
                    <Box
                        bg="bg"
                        borderRadius="md"
                        border="1px solid"
                        borderColor="gray.200"
                        overflow="hidden"
                    >
                        {/* Main task content */}
                        <Box
                            p={3}
                            style={{
                                textDecoration: taskNode.task.done ? 'line-through' : 'none',
                                opacity: taskNode.task.done ? 0.6 : 1,
                            }}
                        >
                            <HStack gap={3} align="flex-start">
                                <input
                                    type="checkbox"
                                    checked={taskNode.task.done}
                                    onChange={() => handleTaskToggle(taskNode.task)}
                                    style={{
                                        width: '18px',
                                        height: '18px',
                                        accentColor: '#f56500',
                                        cursor: 'pointer',
                                        marginTop: '6px'
                                    }}
                                />

                                <VStack gap={2} align="stretch" flex={1}>
                                    <HStack gap={3} align="center">
                                        <HStack gap={2} flex={1} align="center">
                                            <Text
                                                fontWeight="medium"
                                                fontSize="md"
                                            >
                                                {taskNode.task.title}
                                            </Text>
                                            {(taskNode.task.tag || []).map((t) => (
                                                <Box
                                                    key={t}
                                                    px={2}
                                                    py={0.5}
                                                    borderRadius="full"
                                                    fontSize="xs"
                                                    fontWeight="medium"
                                                    bg={TAG_COLORS[t]?.bg || 'gray.100'}
                                                    color={TAG_COLORS[t]?.color || 'gray.600'}
                                                    border="1px solid"
                                                    borderColor={TAG_COLORS[t]?.border || 'gray.200'}
                                                >
                                                    {t}
                                                </Box>
                                            ))}
                                            {taskNode.task.recuring && taskNode.task.periodicity && (
                                                <Text fontSize="xs" color="purple.500" fontWeight="medium">
                                                    {taskNode.task.periodicity.charAt(0).toUpperCase() + taskNode.task.periodicity.slice(1)}
                                                </Text>
                                            )}
                                        </HStack>

                                        <HStack gap={2}>
                                            {/* Up/Down buttons for root tasks */}
                                            {isRootTask && typeof index === 'number' && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleMoveUp(taskNode, index)}
                                                        disabled={index === 0}
                                                        fontSize="sm"
                                                        color="gray.500"
                                                        _hover={{ bg: 'gray.50' }}
                                                        title="Move up"
                                                    >
                                                        ↑
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleMoveDown(taskNode, index)}
                                                        disabled={index === taskTree.length - 1}
                                                        fontSize="sm"
                                                        color="gray.500"
                                                        _hover={{ bg: 'gray.50' }}
                                                        title="Move down"
                                                    >
                                                        ↓
                                                    </Button>
                                                </>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleEditTask(taskNode.task)}
                                                fontSize="sm"
                                                color="gray.500"
                                                _hover={{ bg: 'gray.50' }}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleSubtaskChange(taskNode.task.id!, currentSubtasks.length, '')}
                                                fontSize="lg"
                                                color="orange.500"
                                                _hover={{ bg: 'orange.50' }}
                                            >
                                                +
                                            </Button>
                                        </HStack>
                                    </HStack>

                                    {/* Subtask creation inputs - only shown when there are editing subtasks */}
                                    {currentSubtasks.length > 0 && (
                                        <VStack gap={2} align="stretch" ml={4}>
                                            {currentSubtasks.map((subtask, index) => (
                                                <HStack key={index} gap={2} align="center">
                                                    <Input
                                                        size="sm"
                                                        value={subtask.title}
                                                        onChange={(e) => handleSubtaskChange(taskNode.task.id!, index, e.target.value)}
                                                        placeholder="Enter subtask..."
                                                        autoFocus={index === currentSubtasks.length - 1}
                                                        flex={1}
                                                    />
                                                    <Button
                                                        size="sm"
                                                        colorScheme="orange"
                                                        onClick={() => handleSaveSubtasks(taskNode.task.id!)}
                                                        minW="auto"
                                                    >
                                                        Save
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            const updated = currentSubtasks.filter((_, i) => i !== index);
                                                            editingSubtasks.set(taskNode.task.id!, updated);
                                                            setEditingSubtasks(new Map(editingSubtasks));
                                                        }}
                                                        minW="auto"
                                                    >
                                                        ×
                                                    </Button>
                                                </HStack>
                                            ))}
                                        </VStack>
                                    )}
                                </VStack>
                            </HStack>
                        </Box>

                        {/* Render subtasks within the same box - compact style */}
                        {hasSubtasks && showSubtasks && (
                            <Box
                                bg="bg"
                                borderTop="1px solid"
                                borderColor="gray.200"
                            >
                                {taskNode.children.map((childNode) =>
                                    renderCompactSubtask(childNode)
                                )}
                            </Box>
                        )}
                    </Box>
                )}

                {/* For non-root tasks, render as compact subtasks */}
                {!isRootTask && renderCompactSubtask(taskNode)}
            </>
        );
    };

    const renderCompactSubtask = (taskNode: TaskNode): React.ReactElement => {
        const hasSubtasks = taskNode.children.length > 0;
        const showSubtasks = taskNode.level < 3;
        const indentLevel = taskNode.level; // Use actual level for proper indentation
        const currentSubtasks = editingSubtasks.get(taskNode.task.id!) || [];

        return (
            <Box key={`compact-${taskNode.task.id}`}>
                <Box
                    py={2}
                    px={3}
                    pl={3 + indentLevel * 24} // Indent based on actual level (24px per level)
                    borderBottom="1px solid"
                    borderColor="gray.100"
                    _last={{ borderBottom: 'none' }}
                    style={{
                        textDecoration: taskNode.task.done ? 'line-through' : 'none',
                        opacity: taskNode.task.done ? 0.6 : 1,
                    }}
                >
                    <HStack gap={2} align="center">
                        <input
                            type="checkbox"
                            checked={taskNode.task.done}
                            onChange={() => handleTaskToggle(taskNode.task)}
                            style={{
                                width: '16px',
                                height: '16px',
                                accentColor: '#f56500',
                                cursor: 'pointer'
                            }}
                        />
                        <HStack gap={1} flex={1} align="center">
                            <Text fontSize="sm">
                                {taskNode.task.title}
                            </Text>
                            {(taskNode.task.tag || []).map((t) => (
                                <Box
                                    key={t}
                                    px={1.5}
                                    py={0}
                                    borderRadius="full"
                                    fontSize="2xs"
                                    fontWeight="medium"
                                    bg={TAG_COLORS[t]?.bg || 'gray.100'}
                                    color={TAG_COLORS[t]?.color || 'gray.600'}
                                    border="1px solid"
                                    borderColor={TAG_COLORS[t]?.border || 'gray.200'}
                                >
                                    {t}
                                </Box>
                            ))}
                        </HStack>
                        <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleEditTask(taskNode.task)}
                            fontSize="2xs"
                            color="gray.500"
                            _hover={{ bg: 'gray.50' }}
                        >
                            Edit
                        </Button>
                        <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleSubtaskChange(taskNode.task.id!, currentSubtasks.length, '')}
                            fontSize="sm"
                            color="orange.500"
                            _hover={{ bg: 'orange.50' }}
                        >
                            +
                        </Button>
                    </HStack>

                    {/* Subtask creation inputs - only shown when there are editing subtasks */}
                    {currentSubtasks.length > 0 && (
                        <VStack gap={2} align="stretch" mt={2} pl={4}>
                            {currentSubtasks.map((subtask, index) => (
                                <HStack key={index} gap={2} align="center">
                                    <Input
                                        size="sm"
                                        value={subtask.title}
                                        onChange={(e) => handleSubtaskChange(taskNode.task.id!, index, e.target.value)}
                                        placeholder="Enter subtask..."
                                        autoFocus={index === currentSubtasks.length - 1}
                                        flex={1}
                                    />
                                    <Button
                                        size="xs"
                                        colorScheme="orange"
                                        onClick={() => handleSaveSubtasks(taskNode.task.id!)}
                                        minW="auto"
                                    >
                                        Save
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => {
                                            const updated = currentSubtasks.filter((_, i) => i !== index);
                                            editingSubtasks.set(taskNode.task.id!, updated);
                                            setEditingSubtasks(new Map(editingSubtasks));
                                        }}
                                        minW="auto"
                                    >
                                        ×
                                    </Button>
                                </HStack>
                            ))}
                        </VStack>
                    )}
                </Box>

                {/* Nested subtasks */}
                {hasSubtasks && showSubtasks && (
                    <>
                        {taskNode.children.map((childNode) =>
                            renderCompactSubtask(childNode)
                        )}
                    </>
                )}
            </Box>
        );
    };

    const overallProgress = taskTree.length > 0
        ? taskTree.reduce((sum, node) => sum + calculateProgress(node), 0) / taskTree.length
        : 0;

    return (
        <Box p={6}>
            <Flex mb={6} align="center">
                <VStack align="flex-start" gap={1}>
                    <Text fontSize="2xl" fontWeight="bold" color="orange.500">
                        Tasks
                    </Text>
                </VStack>
            </Flex>
            {renderProgressBar(overallProgress)}

            {/* Task Form */}
            {showForm && (
                <Box mb={6} p={4} bg="bg" borderRadius="md" border="1px solid" borderColor="gray.200">
                    <Text fontSize="lg" fontWeight="bold" mb={4}>
                        {editingTask ? 'Edit Task' : 'Create New Task'}
                    </Text>
                    <form onSubmit={handleSaveTask}>
                        <VStack gap={4} align="stretch">
                            <Box>
                                <Text fontSize="sm" fontWeight="medium" mb={1}>Title *</Text>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Task title"
                                    required
                                />
                            </Box>

                            <Box>
                                <Text fontSize="sm" fontWeight="medium" mb={1}>Description</Text>
                                <Textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Task description"
                                    rows={3}
                                />
                            </Box>

                            <HStack gap={4}>
                                <Box flex={1}>
                                    <Text fontSize="sm" fontWeight="medium" mb={1}>Deadline</Text>
                                    <Input
                                        type="datetime-local"
                                        value={formData.datetime_deadline}
                                        onChange={(e) => setFormData({ ...formData, datetime_deadline: e.target.value })}
                                    />
                                </Box>
                                <Box flex={1}>
                                    <Text fontSize="sm" fontWeight="medium" mb={1}>Budget</Text>
                                    <Input
                                        type="number"
                                        value={formData.price_budget}
                                        onChange={(e) => setFormData({ ...formData, price_budget: Number(e.target.value) })}
                                        placeholder="0"
                                    />
                                </Box>
                                <Box flex={1}>
                                    <Text fontSize="sm" fontWeight="medium" mb={1}>People Count</Text>
                                    <Input
                                        type="number"
                                        value={formData.people_count}
                                        onChange={(e) => setFormData({ ...formData, people_count: Number(e.target.value) })}
                                        placeholder="1"
                                        min={1}
                                    />
                                </Box>
                            </HStack>

                            <HStack gap={4}>
                                <Box flex={1}>
                                    <Text fontSize="sm" fontWeight="medium" mb={1}>Tags</Text>
                                    <HStack gap={2} flexWrap="wrap">
                                        {availableTags.map(tag => {
                                            const selected = (formData.tag || []).includes(tag);
                                            return (
                                                <Box
                                                    key={tag}
                                                    px={3}
                                                    py={1}
                                                    borderRadius="full"
                                                    fontSize="sm"
                                                    fontWeight="medium"
                                                    cursor="pointer"
                                                    bg={selected ? (TAG_COLORS[tag]?.bg || 'gray.200') : 'transparent'}
                                                    color={selected ? (TAG_COLORS[tag]?.color || 'gray.700') : 'gray.500'}
                                                    border="1px solid"
                                                    borderColor={selected ? (TAG_COLORS[tag]?.border || 'gray.300') : 'gray.300'}
                                                    onClick={() => {
                                                        const current = formData.tag || [];
                                                        const next = selected ? current.filter(t => t !== tag) : [...current, tag];
                                                        setFormData({ ...formData, tag: next });
                                                    }}
                                                >
                                                    {tag}
                                                </Box>
                                            );
                                        })}
                                    </HStack>
                                </Box>
                                <Box flex={1}>
                                    <Text fontSize="sm" fontWeight="medium" mb={1}>Time Estimate</Text>
                                    <Input
                                        type="number"
                                        value={formData.time_estimate ? formData.time_estimate / 60 : ''}
                                        onChange={(e) => setFormData({ ...formData, time_estimate: e.target.value ? Math.round(Number(e.target.value) * 60) : undefined })}
                                        placeholder="hours"
                                        step={0.5}
                                        min={0}
                                    />
                                </Box>
                            </HStack>

                            <HStack gap={4}>
                                <HStack gap={2} align="center">
                                    <input
                                        type="checkbox"
                                        checked={formData.recuring || false}
                                        onChange={(e) => setFormData({ ...formData, recuring: e.target.checked, periodicity: e.target.checked ? (formData.periodicity || 'weekly') : undefined })}
                                        style={{
                                            width: '16px',
                                            height: '16px',
                                            accentColor: '#805AD5'
                                        }}
                                    />
                                    <Text fontSize="sm" fontWeight="medium">Repeating</Text>
                                </HStack>
                                {formData.recuring && (
                                    <Box flex={1} maxW="200px">
                                        <select
                                            value={formData.periodicity || ''}
                                            onChange={(e) => setFormData({ ...formData, periodicity: (e.target.value || undefined) as Task['periodicity'] })}
                                            style={{
                                                padding: '8px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--chakra-colors-border)',
                                                width: '100%',
                                                backgroundColor: 'var(--chakra-colors-bg)',
                                            }}
                                        >
                                            <option value="">Select frequency</option>
                                            {PERIODICITIES.map(p => (
                                                <option key={p.value} value={p.value}>{p.label}</option>
                                            ))}
                                        </select>
                                    </Box>
                                )}
                            </HStack>

                            <HStack gap={4} justify="flex-end">
                                <Button onClick={handleCancel} variant="outline">
                                    Cancel
                                </Button>
                                <Button type="submit" colorScheme="orange">
                                    {editingTask ? 'Update' : 'Create'}
                                </Button>
                            </HStack>
                        </VStack>
                    </form>
                </Box>
            )}

            {/* Task List */}
            <ul style={{ padding: 0, margin: 0, listStyleType: 'none' }}>
                {taskTree.map((taskNode, index) => (
                    <li
                        key={taskNode.task.id}
                        style={{
                            listStyleType: 'none',
                            marginBottom: '12px',
                        }}
                    >
                        {renderTaskNodeContent(taskNode, index)}
                    </li>
                ))}
            </ul>

            {/* Always available empty task for quick creation */}
            <Box
                p={3}
                bg="bg"
                borderRadius="md"
                border="2px dashed"
                borderColor="gray.300"
                mt={4}
                cursor="pointer"
                onClick={handleCreateTask}
                style={{ transition: 'all 0.2s' }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--chakra-colors-orange-500)';
                    e.currentTarget.style.backgroundColor = 'var(--chakra-colors-orange-50)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--chakra-colors-border)';
                    e.currentTarget.style.backgroundColor = 'var(--chakra-colors-bg)';
                }}
            >
                <HStack gap={3} align="center">
                    <input
                        type="checkbox"
                        disabled
                        style={{
                            opacity: 0.5,
                            width: '18px',
                            height: '18px'
                        }}
                    />
                    <Text color="gray.500" fontStyle="italic">
                        Click here to add a new task...
                    </Text>
                </HStack>
            </Box>

            {/* Edit Task Modal */}
            {showEditModal && (
                <Box
                    position="fixed"
                    top="0"
                    left="0"
                    width="100vw"
                    height="100vh"
                    bg="blackAlpha.600"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    zIndex={1000}
                    onClick={handleModalCancel}
                >
                    <Box
                        bg="bg"
                        borderRadius="lg"
                        p={6}
                        maxWidth="600px"
                        width="90%"
                        maxHeight="80vh"
                        overflowY="auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <VStack gap={4} align="stretch">
                            <HStack justify="space-between">
                                <Text fontSize="xl" fontWeight="bold" color="orange.500">
                                    Edit Task
                                </Text>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleModalCancel}
                                >
                                    ×
                                </Button>
                            </HStack>

                            <form onSubmit={handleSaveTask}>
                                <VStack gap={4} align="stretch">
                                    {/* Title */}
                                    <Box>
                                        <Text fontSize="sm" fontWeight="medium" mb={1}>Title *</Text>
                                        <Input
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="Task title"
                                            required
                                        />
                                    </Box>

                                    {/* Description */}
                                    <Box>
                                        <Text fontSize="sm" fontWeight="medium" mb={1}>Description</Text>
                                        <Textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Task description"
                                            rows={3}
                                        />
                                    </Box>

                                    {/* Deadline and Priority Row */}
                                    <HStack gap={4}>
                                        <Box flex={1}>
                                            <Text fontSize="sm" fontWeight="medium" mb={1}>Deadline</Text>
                                            <Input
                                                type="datetime-local"
                                                value={formData.datetime_deadline}
                                                onChange={(e) => setFormData({ ...formData, datetime_deadline: e.target.value })}
                                            />
                                        </Box>
                                        <Box flex={1}>
                                            <Text fontSize="sm" fontWeight="medium" mb={1}>Priority</Text>
                                            <Input
                                                type="number"
                                                value={formData.priority}
                                                onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </Box>
                                    </HStack>

                                    {/* Budget and Actual Cost Row */}
                                    <HStack gap={4}>
                                        <Box flex={1}>
                                            <Text fontSize="sm" fontWeight="medium" mb={1}>Budget</Text>
                                            <Input
                                                type="number"
                                                value={formData.price_budget}
                                                onChange={(e) => setFormData({ ...formData, price_budget: Number(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </Box>
                                        <Box flex={1}>
                                            <Text fontSize="sm" fontWeight="medium" mb={1}>Actual Cost</Text>
                                            <Input
                                                type="number"
                                                value={formData.price_real}
                                                onChange={(e) => setFormData({ ...formData, price_real: Number(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </Box>
                                    </HStack>

                                    {/* People Count */}
                                    <Box>
                                        <Text fontSize="sm" fontWeight="medium" mb={1}>People Count</Text>
                                        <Input
                                            type="number"
                                            value={formData.people_count}
                                            onChange={(e) => setFormData({ ...formData, people_count: Number(e.target.value) })}
                                            placeholder="1"
                                            min={1}
                                        />
                                    </Box>

                                    {/* Tags */}
                                    <Box>
                                        <Text fontSize="sm" fontWeight="medium" mb={1}>Tags</Text>
                                        <HStack gap={2} flexWrap="wrap">
                                            {availableTags.map(tag => {
                                                const selected = (formData.tag || []).includes(tag);
                                                return (
                                                    <Box
                                                        key={tag}
                                                        px={3}
                                                        py={1}
                                                        borderRadius="full"
                                                        fontSize="sm"
                                                        fontWeight="medium"
                                                        cursor="pointer"
                                                        bg={selected ? (TAG_COLORS[tag]?.bg || 'gray.200') : 'transparent'}
                                                        color={selected ? (TAG_COLORS[tag]?.color || 'gray.700') : 'gray.500'}
                                                        border="1px solid"
                                                        borderColor={selected ? (TAG_COLORS[tag]?.border || 'gray.300') : 'gray.300'}
                                                        onClick={() => {
                                                            const current = formData.tag || [];
                                                            const next = selected ? current.filter(t => t !== tag) : [...current, tag];
                                                            setFormData({ ...formData, tag: next });
                                                        }}
                                                    >
                                                        {tag}
                                                    </Box>
                                                );
                                            })}
                                        </HStack>
                                    </Box>

                                    {/* Time Estimate, Periodicity */}
                                    <HStack gap={4}>
                                        <Box flex={1}>
                                            <Text fontSize="sm" fontWeight="medium" mb={1}>Time Estimate</Text>
                                            <Input
                                                type="number"
                                                value={formData.time_estimate ? formData.time_estimate / 60 : ''}
                                                onChange={(e) => setFormData({ ...formData, time_estimate: e.target.value ? Math.round(Number(e.target.value) * 60) : undefined })}
                                                placeholder="hours"
                                                step={0.5}
                                                min={0}
                                            />
                                        </Box>
                                        <Box flex={1}>
                                            <Text fontSize="sm" fontWeight="medium" mb={1}>Periodicity</Text>
                                            <select
                                                value={formData.periodicity || ''}
                                                onChange={(e) => {
                                                    const val = (e.target.value || undefined) as Task['periodicity'];
                                                    setFormData({ ...formData, periodicity: val, recuring: !!val });
                                                }}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--chakra-colors-border)',
                                                    width: '100%',
                                                    backgroundColor: 'var(--chakra-colors-bg)',
                                                }}
                                            >
                                                <option value="">Not repeating</option>
                                                {PERIODICITIES.map(p => (
                                                    <option key={p.value} value={p.value}>{p.label}</option>
                                                ))}
                                            </select>
                                        </Box>
                                    </HStack>

                                    {/* Status and Properties */}
                                    <Box>
                                        <Text fontSize="sm" fontWeight="medium" mb={2}>Status & Properties</Text>
                                        <HStack gap={4}>
                                            <HStack gap={2} align="center">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.done || false}
                                                    onChange={(e) => setFormData({ ...formData, done: e.target.checked })}
                                                    style={{
                                                        width: '16px',
                                                        height: '16px',
                                                        accentColor: '#f56500'
                                                    }}
                                                />
                                                <Text fontSize="sm">Completed</Text>
                                            </HStack>
                                            <HStack gap={2} align="center">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.template || false}
                                                    onChange={(e) => setFormData({ ...formData, template: e.target.checked })}
                                                    style={{
                                                        width: '16px',
                                                        height: '16px',
                                                        accentColor: '#3182CE'
                                                    }}
                                                />
                                                <Text fontSize="sm">Template</Text>
                                            </HStack>
                                            <HStack gap={2} align="center">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.active !== false}
                                                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                                    style={{
                                                        width: '16px',
                                                        height: '16px',
                                                        accentColor: formData.active !== false ? '#38A169' : '#E53E3E'
                                                    }}
                                                />
                                                <Text fontSize="sm">Active</Text>
                                            </HStack>
                                        </HStack>
                                    </Box>

                                    {/* Action Buttons */}
                                    <HStack gap={3} justify="space-between" pt={2}>
                                        {editingTask?.id && (
                                            <Button
                                                variant="outline"
                                                colorScheme="red"
                                                onClick={() => handleDeleteTask(editingTask)}
                                            >
                                                Delete
                                            </Button>
                                        )}
                                        <HStack gap={3} ml="auto">
                                            <Button onClick={handleModalCancel} variant="outline">
                                                Cancel
                                            </Button>
                                            <Button type="submit" colorScheme="orange">
                                                Save Changes
                                            </Button>
                                        </HStack>
                                    </HStack>
                                </VStack>
                            </form>
                        </VStack>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default Tasks;