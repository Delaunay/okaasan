import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Input,
  VStack,
  HStack,
  Text,
  Heading,
} from '@chakra-ui/react';
import { TelegramStorage, TelegramClient } from '../services/telegram';

interface TelegramSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TelegramSettings: React.FC<TelegramSettingsProps> = ({ isOpen, onClose }) => {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isInteractiveMode, setIsInteractiveMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadExistingCredentials();
      setIsInteractiveMode(TelegramClient.isInteractiveModeRunning());
    }
  }, [isOpen]);

  const showMessage = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadExistingCredentials = () => {
    const credentials = TelegramStorage.loadCredentials();
    if (credentials) {
      setBotToken(credentials.botToken);
      setChatId(credentials.chatId);
      setHasCredentials(true);
    } else {
      setBotToken('');
      setChatId('');
      setHasCredentials(false);
    }
  };

  const handleSave = async () => {
    if (!TelegramStorage.validateCredentials({ botToken, chatId })) {
      showMessage('Please check your bot token and chat ID format', 'error');
      return;
    }

    setIsLoading(true);
    try {
      TelegramStorage.saveCredentials({ botToken, chatId });
      setHasCredentials(true);
      showMessage('Telegram credentials have been saved locally', 'success');
    } catch (error) {
      showMessage('Failed to save credentials', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    if (!hasCredentials && !TelegramStorage.validateCredentials({ botToken, chatId })) {
      showMessage('Please save valid credentials before testing', 'error');
      return;
    }

    setIsTesting(true);
    try {
      // Save temporarily for testing if not already saved
      if (!hasCredentials) {
        TelegramStorage.saveCredentials({ botToken, chatId });
      }

      const isConnected = await TelegramClient.testConnection();
      if (isConnected) {
        await TelegramClient.sendTextMessage('🧪 Test message from Recipe App - Telegram integration is working!');
        showMessage('Test successful! Check your Telegram chat for the test message', 'success');
        setHasCredentials(true);
      } else {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      console.error('Test failed:', error);
      showMessage(error instanceof Error ? error.message : 'Failed to send test message', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleClear = () => {
    TelegramStorage.clearCredentials();
    setBotToken('');
    setChatId('');
    setHasCredentials(false);
    showMessage('Telegram credentials have been removed', 'info');
  };

  const toggleInteractiveMode = () => {
    if (!hasCredentials) {
      showMessage('Please save credentials first', 'error');
      return;
    }

    if (isInteractiveMode) {
      TelegramClient.stopInteractiveMode();
      setIsInteractiveMode(false);
      showMessage('Interactive mode stopped', 'info');
    } else {
      TelegramClient.startInteractiveMode();
      setIsInteractiveMode(true);
      showMessage('Interactive mode started - buttons in Telegram will now work!', 'success');
    }
  };

  const handleClose = () => {
    // Reset form to saved state when closing
    loadExistingCredentials();
    setMessage(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="rgba(0, 0, 0, 0.6)"
      zIndex={1000}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        bg="bg"
        borderRadius="md"
        p={6}
        maxW="50%"
        w="90%"
        maxH="90%"
        overflowY="auto"
        boxShadow="xl"
      >
        <VStack gap={6} align="stretch">
          <HStack justify="space-between">
            <Heading size="lg">Telegram Bot Settings</Heading>
            <Button variant="ghost" onClick={handleClose}>
              ✕
            </Button>
          </HStack>

          {/* Security Notice */}
          <Box p={4} bg="orange.50" border="1px" borderColor="orange.200" borderRadius="md">
            <Text fontWeight="bold" color="orange.800" mb={2}>Security Notice</Text>
            <Text fontSize="sm" color="orange.700">
              Bot tokens are stored locally in your browser. Only use this in trusted environments.
            </Text>
          </Box>

          {/* Instructions */}
          <HStack justify="space-between" align="flex-start" >
            <Box>
              <Text fontSize="sm" color="gray.600" mb={4}>
                To use Telegram messaging, you need to create a bot and get your chat ID:
              </Text>

              <VStack align="start" gap={2} fontSize="sm">
                <Text fontWeight="semibold">1. Create a Bot:</Text>
                <Box ml={4}>
                  <Text>• Message @BotFather on Telegram</Text>
                  <Text>• Send /newbot and follow the instructions</Text>
                  <Text>• Copy the bot token (looks like: 123456789:ABCdef...)</Text>
                </Box>

                <Text fontWeight="semibold" mt={3}>2. Get Your Chat ID:</Text>
                <Box ml={4}>
                  <Text>• Message your new bot anything</Text>
                  <Text>• Visit: https://api.telegram.org/bot&lt;YOUR_BOT_TOKEN&gt;/getUpdates</Text>
                  <Text>• Find your chat ID in the response</Text>
                </Box>
              </VStack>
            </Box>

            <Box h="1px" bg="gray.200" />

            {/* Form */}
            <VStack gap={4} align="stretch">
              <Box>
                <Text fontWeight="semibold" mb={2}>Bot Token</Text>
                <Input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="123456789:ABCdefghijklmnopqrstuvwxyz"
                />
              </Box>

              <Box>
                <Text fontWeight="semibold" mb={2}>Chat ID</Text>
                <Input
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="123456789 or -123456789 for groups"
                />
              </Box>

              {hasCredentials && (
                <Box p={3} bg="green.50" border="1px" borderColor="green.200" borderRadius="md">
                  <Text fontSize="sm" color="green.800">Credentials are saved and ready to use</Text>
                </Box>
              )}

              {/* Interactive Mode Control */}
              {hasCredentials && (
                <Box p={4} bg="blue.50" border="1px" borderColor="blue.200" borderRadius="md">
                  <VStack gap={3} align="stretch">
                    <Text fontWeight="semibold" color="blue.800">Interactive Mode</Text>
                    <Text fontSize="sm" color="blue.700">
                      Enable this to make checklist buttons clickable in Telegram.
                      When enabled, users can click the ⬜/✅ buttons to toggle items.
                    </Text>
                    <HStack justify="space-between">
                      <Text fontSize="sm" fontWeight="medium">
                        Status: {isInteractiveMode ? '🟢 Running' : '🔴 Stopped'}
                      </Text>
                      <Button
                        size="sm"
                        colorScheme={isInteractiveMode ? 'red' : 'green'}
                        variant="outline"
                        onClick={toggleInteractiveMode}
                      >
                        {isInteractiveMode ? 'Stop Interactive Mode' : 'Start Interactive Mode'}
                      </Button>
                    </HStack>
                  </VStack>
                </Box>
              )}

              {message && (
                <Box
                  p={3}
                  bg={message.type === 'success' ? 'green.50' : message.type === 'error' ? 'red.50' : 'blue.50'}
                  border="1px"
                  borderColor={message.type === 'success' ? 'green.200' : message.type === 'error' ? 'red.200' : 'blue.200'}
                  borderRadius="md"
                >
                  <Text fontSize="sm" color={message.type === 'success' ? 'green.800' : message.type === 'error' ? 'red.800' : 'blue.800'}>
                    {message.text}
                  </Text>
                </Box>
              )}
            </VStack>
          </HStack>

          {/* Actions */}
          <HStack gap={3} justify="flex-end">
            {hasCredentials && (
              <Button variant="outline" colorScheme="red" onClick={handleClear}>
                Clear
              </Button>
            )}
            <Button
              colorScheme="blue"
              variant="outline"
              onClick={handleTest}
              disabled={isTesting}
            >
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </HStack>
        </VStack>
      </Box>
    </Box>
  );
};