import { FC, useState, useCallback, useEffect, useRef } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Activity } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { isStaticMode } from '../../services/api';

interface TaskInfo {
  id: string;
  name: string;
  status: string;
  detail: string;
  started_at: string;
  last_activity: string;
  progress: number | null;
  error: string;
}

const STATUS_COLOR: Record<string, string> = {
  running: 'green.400',
  idle: 'gray.400',
  error: 'red.400',
  stopped: 'orange.400',
};

const StatusDot: FC<{ status: string }> = ({ status }) => (
  <Box
    w="8px"
    h="8px"
    borderRadius="full"
    bg={STATUS_COLOR[status] || 'gray.400'}
    flexShrink={0}
    style={status === 'running' ? { animation: 'pulse 2s ease-in-out infinite' } : undefined}
  />
);

const TaskStatusIndicator: FC = () => {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [expanded, setExpanded] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (isStaticMode() || fetched.current) return;
    fetched.current = true;
    fetch('/api/background-tasks')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.tasks)) setTasks(data.tasks);
      })
      .catch(() => {});
  }, []);

  useNotifications(useCallback((event) => {
    if (event.type !== 'task_status') return;
    if (Array.isArray((event as any).tasks)) {
      setTasks((event as any).tasks);
    }
  }, []));

  if (isStaticMode() || tasks.length === 0) return null;

  const activeCount = tasks.filter(t => t.status === 'running').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;

  const summaryColor = errorCount > 0 ? 'red.400' : activeCount > 0 ? 'green.400' : 'gray.400';
  const summaryText = errorCount > 0
    ? `${errorCount} error${errorCount > 1 ? 's' : ''}`
    : activeCount > 0
      ? `${activeCount} active`
      : 'All idle';

  return (
    <Box
      borderTop="1px solid var(--chakra-colors-border)"
      pt="0.5rem"
      pb="0.25rem"
      px="0.75rem"
    >
      <Flex
        align="center"
        gap={2}
        cursor="pointer"
        onClick={() => setExpanded(e => !e)}
        py="0.25rem"
        userSelect="none"
        _hover={{ opacity: 0.8 }}
      >
        <Activity size={14} style={{ opacity: activeCount > 0 ? 1 : 0.5 }} />
        <Text fontSize="xs" fontWeight="medium" flex={1}>
          Background Tasks
        </Text>
        <Box w="6px" h="6px" borderRadius="full" bg={summaryColor} />
        <Text fontSize="xs" color="fg.muted">
          {summaryText}
        </Text>
      </Flex>

      {expanded && (
        <Box mt={1} mb={1}>
          {tasks.map(task => (
            <Flex
              key={task.id}
              align="center"
              gap={2}
              py="3px"
              px="0.25rem"
            >
              <StatusDot status={task.status} />
              <Text fontSize="xs" flex={1} truncate>
                {task.name}
              </Text>
              <Text fontSize="2xs" color="fg.muted" truncate maxW="100px" textAlign="end">
                {task.status === 'error' ? task.error || 'Error' : task.detail || task.status}
              </Text>
            </Flex>
          ))}
        </Box>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </Box>
  );
};

export default TaskStatusIndicator;
