import React from 'react';
import { ArticleBlock } from '../../ui/src/services/type';

/**
 * Common props interface for all block components
 */
export interface BlockComponentProps {
    block: ArticleBlock;
    readonly: boolean;
    onUpdate?: (block: ArticleBlock) => void;
    level?: number;

    // For nested blocks and interaction
    onHoverChange?: (blockId: number | undefined, isHovering: boolean) => void;
    hoveredBlockId?: number;
    onDragStart?: (blockId: number | undefined) => void;
    onDragEnd?: () => void;
    onDrop?: (targetBlockId: number | undefined, position: 'before' | 'after') => void;
    draggedBlockId?: number | undefined;

    // All blocks in the article (for cross-referencing)
    allBlocks?: ArticleBlock[];
}

/**
 * Props for block editor components (used in settings modal)
 */
export interface BlockEditorProps {
    block: ArticleBlock;
    onChange: (key: string, value: any) => void;
    allBlocks?: ArticleBlock[]; // For cross-referencing other blocks
}

/**
 * Base class/interface for block renderers
 */
export interface BlockRenderer {
    canHandle(blockKind: string): boolean;
    render(props: BlockComponentProps): React.ReactElement;
}

