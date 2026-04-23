import React, { useEffect, useRef, useState } from 'react';
import { Box, VStack, Button, Spinner, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

// import type { WorkspaceSvg } from 'blockly/core'; // Type-only import
// import type { BlockDefinition } from 'blockly/core/blocks'; // Type-only import

import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import * as blocks from 'blockly/blocks';

import { buildToolboxFromBlocks } from './blockly/utils';

import { recipeAPI } from '../../ui/src/services/api';


export async function getDefaultContext() {
    const toolbox = buildToolboxFromBlocks(blocks);
    return {
        toolbox: toolbox,
        definitions: blocks
    }
}


export async function getPythonContext() {
    return {
        toolbox: await recipeAPI.getBlocklyToolbox(),
        definitions: await recipeAPI.getBlocklyDefinitions()
    }
}

export const BlocklyBlock: React.FC<BlockComponentProps> = ({ readonly: _readonly }) => {
    const blocklyDiv = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
    const isInitialized = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const height = 400;

    useEffect(() => {
        if (!blocklyDiv.current || isInitialized.current) return;

        const init = async () => {
            try {
                setIsLoading(true);
                setError(null);

                // Set locale - En is a default export with locale strings
                Blockly.setLocale(En as any);

                const { toolbox, definitions } = await getPythonContext();

                // Standard blocks are already loaded via import 'blockly/blocks'
                Blockly.defineBlocksWithJsonArray(definitions);

                // Inject workspace with the toolbox
                const workspace = Blockly.inject(
                    blocklyDiv.current!,
                    {
                        toolbox: toolbox
                    }
                );

                workspaceRef.current = workspace;
                isInitialized.current = true;
                setIsLoading(false);

                console.log('✓ Workspace initialized successfully');
            } catch (err) {
                console.error('❌ Error initializing Blockly workspace:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
                setIsLoading(false);
            }
        }

        const unmount = () => {
            if (workspaceRef.current && isInitialized.current) {
                console.log('🧹 Disposing workspace');
                workspaceRef.current.dispose();
                workspaceRef.current = null;
                isInitialized.current = false;
            }
        }

        init();

        return unmount;
    }, []); // Empty dependency array - only run once on mount

    const handleSaveWorkspace = () => {
        console.log('💾 Save button clicked!');
        console.log('workspaceRef.current:', workspaceRef.current);
        console.log('isInitialized.current:', isInitialized.current);

        if (!workspaceRef.current) {
            console.error('❌ No workspace available');
            return;
        }

        // Save workspace to JSON
        const json = Blockly.serialization.workspaces.save(workspaceRef.current);
        console.log(JSON.stringify(json));
    };

    return (
        <Box mb={4}>
            <VStack align="stretch" gap={2}>
                {/* Save Button */}
                <Box>
                    <Button
                        size="sm"
                        colorScheme="blue"
                        onClick={handleSaveWorkspace}
                        disabled={isLoading || !!error}
                    >
                        💾 Save Workspace to Console
                    </Button>
                </Box>

                {/* Error Message */}
                {error && (
                    <Box
                        p={3}
                        bg="red.50"
                        border="1px solid"
                        borderColor="red.200"
                        borderRadius="md"
                    >
                        <Text color="red.700" fontSize="sm">
                            ❌ Error: {error}
                        </Text>
                    </Box>
                )}

                {/* Blockly Workspace */}
                <Box
                    border="1px solid"
                    borderColor="gray.300"
                    borderRadius="md"
                    overflow="hidden"
                    position="relative"
                >
                    {isLoading && (
                        <Box
                            position="absolute"
                            top="50%"
                            left="50%"
                            transform="translate(-50%, -50%)"
                            zIndex={10}
                        >
                            <VStack>
                                <Spinner size="xl" color="blue.500" />
                                <Text fontSize="sm" color="gray.600">
                                    Loading Blockly workspace...
                                </Text>
                            </VStack>
                        </Box>
                    )}
                    <div
                        ref={blocklyDiv}
                        style={{
                            height: `${height}px`,
                            width: '100%',
                            opacity: isLoading ? 0.3 : 1
                        }}
                    />
                </Box>
            </VStack>
        </Box>
    );
};

