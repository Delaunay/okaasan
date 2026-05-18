import React, { useEffect, useRef, useCallback } from 'react';
import { Box, Flex, HStack, Text, Button } from '@chakra-ui/react';
import { X, Maximize, Save } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface Game {
  id: number;
  title: string;
  platform: string;
  file_id?: number;
}

interface GamesPlayerProps {
  game: Game;
  loadStateId?: number;
  onClose: () => void;
}

const PLATFORM_TO_CORE: Record<string, string> = {
  NES: 'nes',
  SNES: 'snes',
  N64: 'n64',
  GBA: 'gba',
  GBC: 'gbc',
  GB: 'gb',
  Genesis: 'segaMD',
  'Mega Drive': 'segaMD',
  PS1: 'psx',
  'Master System': 'segaMS',
  'Game Gear': 'segaGG',
  Atari2600: 'atari2600',
  NDS: 'nds',
};

const GamesPlayer: React.FC<GamesPlayerProps> = ({ game, loadStateId, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const handleSaveState = useCallback(async () => {
    try {
      await recipeAPI.request(`/games/${game.id}/save-state`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, [game.id]);

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const win = window as any;
    const core = PLATFORM_TO_CORE[game.platform] || game.platform.toLowerCase();

    win.EJS_player = '#game';
    win.EJS_core = core;
    win.EJS_gameUrl = `/api/games/play/${game.file_id || game.id}`;
    win.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';

    if (loadStateId) {
      win.EJS_loadStateURL = `/api/games/${game.id}/save-states/${loadStateId}/data`;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.emulatorjs.org/stable/data/loader.js';
    script.async = true;
    document.body.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (scriptRef.current) {
        document.body.removeChild(scriptRef.current);
        scriptRef.current = null;
      }
      delete win.EJS_player;
      delete win.EJS_core;
      delete win.EJS_gameUrl;
      delete win.EJS_pathtodata;
      delete win.EJS_loadStateURL;
      delete win.EJS_emulator;
    };
  }, [game, loadStateId]);

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={9999}
      bg="black"
      display="flex"
      flexDirection="column"
    >
      <Flex
        px={4}
        py={2}
        bg="rgba(0,0,0,0.9)"
        borderBottom="1px solid"
        borderColor="whiteAlpha.200"
        align="center"
        justify="space-between"
        flexShrink={0}
      >
        <HStack gap={3}>
          <Text color="white" fontWeight="semibold" fontSize="sm">{game.title}</Text>
          <Text color="whiteAlpha.600" fontSize="xs">{game.platform}</Text>
        </HStack>
        <HStack gap={2}>
          <Button
            size="xs"
            variant="ghost"
            color="white"
            _hover={{ bg: 'whiteAlpha.200' }}
            onClick={handleSaveState}
            title="Save State"
          >
            <Save size={14} />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            color="white"
            _hover={{ bg: 'whiteAlpha.200' }}
            onClick={handleFullscreen}
            title="Fullscreen"
          >
            <Maximize size={14} />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            color="white"
            _hover={{ bg: 'red.500' }}
            onClick={onClose}
            title="Close (Escape)"
          >
            <X size={14} />
          </Button>
        </HStack>
      </Flex>

      <Box
        ref={containerRef}
        flex={1}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <div id="game" style={{ width: '100%', height: '100%' }} />
      </Box>
    </Box>
  );
};

export default GamesPlayer;
