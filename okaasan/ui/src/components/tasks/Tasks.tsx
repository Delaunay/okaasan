import React, { useState, useEffect, useCallback } from 'react';
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
import { useParams, useNavigate } from 'react-router-dom';
import { recipeAPI } from '../../services/api';
import type { Task, TaskPeriodicity } from '../../services/type';
import { DEFAULT_TASK_TAGS } from '../../services/type';
import { ChevronLeft, Plus, X } from 'lucide-react';

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

const EMPTY_FORM: Partial<Task> = {
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
};

export function taskToFormData(task: Task): Partial<Task> {
    return {
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
        id: task.id,
        parent_id: task.parent_id,
        root_id: task.root_id,
    };
}

// ── Task Form Modal ─────────────────────────────────────────

export function TaskFormModal({
    formData,
    setFormData,
    onSave,
    onCancel,
    onDelete,
    isEditing,
    availableTags,
}: {
    formData: Partial<Task>;
    setFormData: (d: Partial<Task>) => void;
    onSave: (e: React.FormEvent) => void;
    onCancel: () => void;
    onDelete?: () => void;
    isEditing: boolean;
    availableTags: string[];
}) {
    return (
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
            onClick={onCancel}
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
                            {isEditing ? 'Edit Task' : 'New Task'}
                        </Text>
                        <Button size="sm" variant="ghost" onClick={onCancel}>
                            <X size={18} />
                        </Button>
                    </HStack>

                    <form onSubmit={onSave}>
                        <VStack gap={4} align="stretch">
                            <Box>
                                <Text fontSize="sm" fontWeight="medium" mb={1}>Title *</Text>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Task title"
                                    required
                                    autoFocus
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
                                    <Text fontSize="sm" fontWeight="medium" mb={1}>Priority</Text>
                                    <Input
                                        type="number"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                                        placeholder="0"
                                    />
                                </Box>
                            </HStack>

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

                            <HStack gap={4}>
                                <Box flex={1}>
                                    <Text fontSize="sm" fontWeight="medium" mb={1}>Time Estimate (min)</Text>
                                    <Input
                                        type="number"
                                        value={formData.time_estimate ?? ''}
                                        onChange={(e) => setFormData({ ...formData, time_estimate: e.target.value ? Number(e.target.value) : undefined })}
                                        placeholder="minutes"
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

                            <Box>
                                <Text fontSize="sm" fontWeight="medium" mb={2}>Status & Properties</Text>
                                <HStack gap={4}>
                                    <HStack gap={2} align="center">
                                        <input
                                            type="checkbox"
                                            checked={formData.done || false}
                                            onChange={(e) => setFormData({ ...formData, done: e.target.checked })}
                                            style={{ width: '16px', height: '16px', accentColor: '#f56500' }}
                                        />
                                        <Text fontSize="sm">Completed</Text>
                                    </HStack>
                                    <HStack gap={2} align="center">
                                        <input
                                            type="checkbox"
                                            checked={formData.template || false}
                                            onChange={(e) => setFormData({ ...formData, template: e.target.checked })}
                                            style={{ width: '16px', height: '16px', accentColor: '#3182CE' }}
                                        />
                                        <Text fontSize="sm">Template</Text>
                                    </HStack>
                                    <HStack gap={2} align="center">
                                        <input
                                            type="checkbox"
                                            checked={formData.active !== false}
                                            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                            style={{ width: '16px', height: '16px', accentColor: formData.active !== false ? '#38A169' : '#E53E3E' }}
                                        />
                                        <Text fontSize="sm">Active</Text>
                                    </HStack>
                                </HStack>
                            </Box>

                            <HStack gap={3} justify="space-between" pt={2}>
                                {isEditing && onDelete && (
                                    <Button variant="outline" colorScheme="red" onClick={onDelete}>
                                        Delete
                                    </Button>
                                )}
                                <HStack gap={3} ml="auto">
                                    <Button onClick={onCancel} variant="outline">
                                        Cancel
                                    </Button>
                                    <Button type="submit" colorScheme="orange">
                                        {isEditing ? 'Save Changes' : 'Create'}
                                    </Button>
                                </HStack>
                            </HStack>
                        </VStack>
                    </form>
                </VStack>
            </Box>
        </Box>
    );
}

// ── Main Tasks Component ────────────────────────────────────

const Tasks: React.FC = () => {
    const { taskId } = useParams<{ taskId: string }>();
    const navigate = useNavigate();

    const [tasks, setTasks] = useState<Task[]>([]);
    const [taskTree, setTaskTree] = useState<TaskNode[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([...DEFAULT_TASK_TAGS]);
    const [actionableOnly, setActionableOnly] = useState(true);

    // Modal state: null = closed, task with id = editing, task without id = creating
    const [modalTask, setModalTask] = useState<{ data: Partial<Task>; parentId?: number; isEditing: boolean } | null>(null);

    const focusedTaskId = taskId ? Number(taskId) : null;

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
    }, [tasks, focusedTaskId, actionableOnly]);

    const fetchTasks = async () => {
        try {
            const data = await recipeAPI.getTasks();
            setTasks(data);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    };

    const buildTaskTree = useCallback(() => {
        const sortByPriority = (items: Task[]): Task[] =>
            [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        const filterActionable = (task: Task): Task | null => {
            const children = (task.children || [])
                .map(filterActionable)
                .filter((c): c is Task => c !== null);

            if (task.done && children.length === 0) return null;
            return { ...task, children };
        };

        const convert = (task: Task, level: number): TaskNode => ({
            task,
            children: sortByPriority(task.children || []).map(c => convert(c, level + 1)),
            level,
        });

        let roots = tasks;
        if (focusedTaskId) {
            const findTask = (list: Task[]): Task | null => {
                for (const t of list) {
                    if (t.id === focusedTaskId) return t;
                    if (t.children) {
                        const found = findTask(t.children);
                        if (found) return found;
                    }
                }
                return null;
            };
            const focused = findTask(tasks);
            roots = focused ? [focused] : tasks;
        }

        if (actionableOnly) {
            roots = roots.map(filterActionable).filter((r): r is Task => r !== null);
        }

        setTaskTree(sortByPriority(roots).map(t => convert(t, 0)));
    }, [tasks, focusedTaskId, actionableOnly]);

    // ── Modal helpers ───────────────────────────────────────

    const openCreateModal = (parentId?: number) => {
        setModalTask({
            data: { ...EMPTY_FORM },
            parentId,
            isEditing: false,
        });
    };

    const openEditModal = (task: Task) => {
        setModalTask({
            data: {
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
                id: task.id,
                parent_id: task.parent_id,
                root_id: task.root_id,
            },
            isEditing: true,
        });
    };

    const closeModal = () => setModalTask(null);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modalTask) return;

        try {
            const { data, parentId, isEditing } = modalTask;

            if (isEditing && data.id) {
                await recipeAPI.updateTask(data.id, data);
            } else {
                const parentTask = parentId ? findTaskById(tasks, parentId) : null;
                const rootId = parentTask?.root_id || parentTask?.id;

                await recipeAPI.createTask({
                    ...data,
                    done: false,
                    template: false,
                    recuring: data.recuring || false,
                    active: true,
                    priority: data.priority || 0,
                    tag: data.tag,
                    periodicity: data.periodicity,
                    time_estimate: data.time_estimate,
                    parent_id: parentId,
                    root_id: rootId,
                } as Omit<Task, 'id'>);
            }

            fetchTasks();
            closeModal();
        } catch (error) {
            console.error('Error saving task:', error);
        }
    };

    const handleDelete = async () => {
        if (!modalTask?.data.id) return;
        try {
            await recipeAPI.deleteTask(modalTask.data.id);
            fetchTasks();
            closeModal();
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    const handleTaskToggle = async (task: Task) => {
        try {
            await recipeAPI.updateTask(task.id!, { ...task, done: !task.done });
            fetchTasks();
        } catch (error) {
            console.error('Error toggling task:', error);
        }
    };

    // ── Reorder helpers ─────────────────────────────────────

    const getSiblings = (task: Task): TaskNode[] => {
        if (!task.parent_id && !focusedTaskId) return taskTree;
        const findParentNode = (nodes: TaskNode[]): TaskNode | null => {
            for (const n of nodes) {
                if (n.task.id === task.parent_id || (focusedTaskId && !task.parent_id && n.task.id === focusedTaskId)) {
                    return n;
                }
                const found = findParentNode(n.children);
                if (found) return found;
            }
            return null;
        };
        if (task.parent_id) {
            const parent = findParentNode(taskTree);
            return parent?.children || [];
        }
        return taskTree;
    };

    const handleMoveUp = async (task: Task) => {
        const siblings = getSiblings(task);
        const idx = siblings.findIndex(n => n.task.id === task.id);
        if (idx <= 0) return;

        const above = siblings[idx - 1].task;
        const newPriority = (above.priority ?? 0) + 1;
        try {
            await recipeAPI.updateTask(task.id!, { priority: newPriority });
            fetchTasks();
        } catch (error) {
            console.error('Error moving task:', error);
        }
    };

    const handleMoveDown = async (task: Task) => {
        const siblings = getSiblings(task);
        const idx = siblings.findIndex(n => n.task.id === task.id);
        if (idx < 0 || idx >= siblings.length - 1) return;

        const below = siblings[idx + 1].task;
        const newPriority = (below.priority ?? 0) - 1;
        try {
            await recipeAPI.updateTask(task.id!, { priority: newPriority });
            fetchTasks();
        } catch (error) {
            console.error('Error moving task:', error);
        }
    };

    // ── Navigate into subtree ───────────────────────────────

    const navigateToTask = (taskId: number) => {
        navigate(`/tasks/${taskId}`);
    };

    const navigateUp = () => {
        if (!focusedTaskId) return;
        const focused = findTaskById(tasks, focusedTaskId);
        if (focused?.parent_id) {
            navigate(`/tasks/${focused.parent_id}`);
        } else {
            navigate('/tasks');
        }
    };

    // ── Breadcrumb ──────────────────────────────────────────

    const getBreadcrumb = (): { id: number; title: string }[] => {
        if (!focusedTaskId) return [];
        const path: { id: number; title: string }[] = [];
        const walk = (list: Task[]): boolean => {
            for (const t of list) {
                if (t.id === focusedTaskId) {
                    path.push({ id: t.id!, title: t.title });
                    return true;
                }
                if (t.children) {
                    path.push({ id: t.id!, title: t.title });
                    if (walk(t.children)) return true;
                    path.pop();
                }
            }
            return false;
        };
        walk(tasks);
        return path;
    };

    // ── Render ──────────────────────────────────────────────

    const border = 'var(--border-color)';
    const cardBg = 'var(--card-bg)';
    const mutedText = 'var(--muted-text)';

    const renderActionButtons = (task: Task) => (
        <HStack gap={1} flexShrink={0}>
            <Button
                size="xs" variant="ghost"
                onClick={() => handleMoveUp(task)}
                color={mutedText}
                _hover={{ bg: 'bg.subtle', color: 'fg' }}
                p={0} minW={6} h={6}
            >
                ↑
            </Button>
            <Button
                size="xs" variant="ghost"
                onClick={() => handleMoveDown(task)}
                color={mutedText}
                _hover={{ bg: 'bg.subtle', color: 'fg' }}
                p={0} minW={6} h={6}
            >
                ↓
            </Button>
            <Button
                size="xs" variant="ghost"
                onClick={() => openEditModal(task)}
                color={mutedText}
                _hover={{ bg: 'bg.subtle', color: 'fg' }}
                fontSize="2xs"
            >
                Edit
            </Button>
            <Button
                size="xs" variant="ghost"
                onClick={() => openCreateModal(task.id!)}
                color="orange.400"
                _hover={{ bg: 'orange.50', color: 'orange.600' }}
                p={0} minW={6} h={6}
            >
                <Plus size={14} />
            </Button>
        </HStack>
    );

    const renderChildRow = (node: TaskNode) => {
        const { task } = node;
        const hasChildren = node.children.length > 0;
        const indent = (node.level) * 6;

        return (
            <Box key={`task-${task.id}`}>
                <Flex
                    py={1}
                    px={3}
                    pl={`${12 + indent}px`}
                    align="center"
                    gap={2}
                    style={{ opacity: task.done ? 0.5 : 1 }}
                    _hover={{ bg: 'bg.subtle' }}
                    borderRadius="sm"
                >
                    <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => handleTaskToggle(task)}
                        style={{ width: '15px', height: '15px', accentColor: '#f56500', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <Flex
                        flex={1} align="center" gap={2} cursor="pointer"
                        onClick={() => hasChildren ? navigateToTask(task.id!) : openEditModal(task)}
                        minW={0}
                    >
                        <Text
                            fontSize="sm"
                            style={{ textDecoration: task.done ? 'line-through' : 'none' }}
                            overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap"
                        >
                            {task.title}
                        </Text>
                        {(task.tag || []).map(t => (
                            <Box
                                key={t} px={1.5} py={0} borderRadius="full"
                                fontSize="2xs" fontWeight="medium"
                                bg={TAG_COLORS[t]?.bg || 'gray.100'}
                                color={TAG_COLORS[t]?.color || 'gray.600'}
                                border="1px solid"
                                borderColor={TAG_COLORS[t]?.border || 'gray.200'}
                                flexShrink={0}
                            >
                                {t}
                            </Box>
                        ))}
                    </Flex>
                    {renderActionButtons(task)}
                </Flex>

                {hasChildren && (
                    <Box pl={2} ml={`${12 + indent}px`} borderLeft="1px solid" borderColor={border}>
                        {node.children.map(child => renderChildRow(child))}
                    </Box>
                )}
            </Box>
        );
    };

    const renderRootTask = (node: TaskNode) => {
        const { task } = node;
        const hasChildren = node.children.length > 0;

        return (
            <Box
                key={`task-${task.id}`}
                bg={cardBg}
                borderRadius="md"
                border="1px solid"
                borderColor={border}
                overflow="hidden"
            >
                <Flex
                    p={3}
                    align="center"
                    gap={3}
                    style={{ opacity: task.done ? 0.5 : 1 }}
                    _hover={{ bg: 'bg.subtle' }}
                >
                    <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => handleTaskToggle(task)}
                        style={{ width: '18px', height: '18px', accentColor: '#f56500', cursor: 'pointer', flexShrink: 0, marginTop: '1px' }}
                    />
                    <Flex
                        flex={1} align="center" gap={2} cursor="pointer"
                        onClick={() => hasChildren ? navigateToTask(task.id!) : openEditModal(task)}
                        minW={0}
                    >
                        <Text fontWeight="semibold" fontSize="md"
                            style={{ textDecoration: task.done ? 'line-through' : 'none' }}
                            overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap"
                        >
                            {task.title}
                        </Text>
                        {(task.tag || []).map(t => (
                            <Box
                                key={t} px={2} py={0.5} borderRadius="full"
                                fontSize="xs" fontWeight="medium"
                                bg={TAG_COLORS[t]?.bg || 'gray.100'}
                                color={TAG_COLORS[t]?.color || 'gray.600'}
                                border="1px solid"
                                borderColor={TAG_COLORS[t]?.border || 'gray.200'}
                                flexShrink={0}
                            >
                                {t}
                            </Box>
                        ))}
                        {task.recuring && task.periodicity && (
                            <Text fontSize="xs" color="purple.500" fontWeight="medium" flexShrink={0}>
                                {task.periodicity.charAt(0).toUpperCase() + task.periodicity.slice(1)}
                            </Text>
                        )}
                    </Flex>
                    {renderActionButtons(task)}
                </Flex>

                {hasChildren && (
                    <Box borderTop="1px solid" borderColor={border} py={1}>
                        {node.children.map(child => renderChildRow(child))}
                    </Box>
                )}
            </Box>
        );
    };

    const breadcrumb = getBreadcrumb();

    return (
        <Box p={6}>
            {/* Header: title + new task button */}
            <Flex mb={4} align="center" gap={3}>
                {focusedTaskId && (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={navigateUp}
                        p={1}
                        minW={0}
                        color="gray.500"
                    >
                        <ChevronLeft size={20} />
                    </Button>
                )}

                <Flex flex={1} align="center" gap={2} minW={0}>
                    {!focusedTaskId && (
                        <Text fontSize="2xl" fontWeight="bold" color="orange.500">
                            Tasks
                        </Text>
                    )}
                    {focusedTaskId && breadcrumb.length > 0 && (
                        <Flex align="center" gap={1} overflow="hidden">
                            {breadcrumb.map((crumb, i) => (
                                <React.Fragment key={crumb.id}>
                                    {i > 0 && <Text color="gray.400" mx={1}>/</Text>}
                                    <Text
                                        fontSize={i === breadcrumb.length - 1 ? 'xl' : 'md'}
                                        fontWeight={i === breadcrumb.length - 1 ? 'bold' : 'medium'}
                                        color={i === breadcrumb.length - 1 ? 'orange.500' : 'gray.500'}
                                        cursor={i < breadcrumb.length - 1 ? 'pointer' : 'default'}
                                        _hover={i < breadcrumb.length - 1 ? { color: 'orange.400' } : {}}
                                        onClick={() => {
                                            if (i < breadcrumb.length - 1) navigateToTask(crumb.id);
                                        }}
                                        overflow="hidden"
                                        textOverflow="ellipsis"
                                        whiteSpace="nowrap"
                                    >
                                        {crumb.title}
                                    </Text>
                                </React.Fragment>
                            ))}
                        </Flex>
                    )}
                </Flex>

                <HStack gap={2}>
                    <Button
                        size="sm"
                        variant={actionableOnly ? 'solid' : 'outline'}
                        colorScheme={actionableOnly ? 'orange' : 'gray'}
                        onClick={() => setActionableOnly(!actionableOnly)}
                        fontWeight="medium"
                    >
                        {actionableOnly ? 'Actionable' : 'All'}
                    </Button>
                    <Button
                        size="sm"
                        colorScheme="orange"
                        onClick={() => openCreateModal(focusedTaskId || undefined)}
                    >
                        <Plus size={16} />
                        <Box ml={1}>New Task</Box>
                    </Button>
                </HStack>
            </Flex>

            {/* Task list */}
            <VStack align="stretch" gap={4}>
                {taskTree.length === 0 && (
                    <Box p={8} textAlign="center">
                        <Text color={mutedText}>No tasks yet. Create one to get started.</Text>
                    </Box>
                )}
                {taskTree.map(node => renderRootTask(node))}
            </VStack>

            {/* Modal */}
            {modalTask && (
                <TaskFormModal
                    formData={modalTask.data}
                    setFormData={(d) => setModalTask({ ...modalTask, data: d })}
                    onSave={handleSave}
                    onCancel={closeModal}
                    onDelete={modalTask.isEditing ? handleDelete : undefined}
                    isEditing={modalTask.isEditing}
                    availableTags={availableTags}
                />
            )}
        </Box>
    );
};

function findTaskById(tasks: Task[], id: number): Task | null {
    for (const task of tasks) {
        if (task.id === id) return task;
        if (task.children) {
            const found = findTaskById(task.children, id);
            if (found) return found;
        }
    }
    return null;
}

export default Tasks;
