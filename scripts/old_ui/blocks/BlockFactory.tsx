import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps, BlockEditorProps } from './BlockTypes';
import { HeadingBlock } from './HeadingBlock';
import { ParagraphBlock } from './ParagraphBlock';
import { TextBlock } from './TextBlock';
import { ImageBlock } from './ImageBlock';
import { CodeBlock } from './CodeBlock';
import { VideoBlock } from './VideoBlock';
import { AudioBlock } from './AudioBlock';
import { ListBlock } from './ListBlock';
import { LayoutBlock } from './LayoutBlock';
import { LatexBlock } from './LatexBlock';
import { MermaidBlock } from './MermaidBlock';
import { ReferenceBlock } from './ReferenceBlock';
import { FootnoteBlock } from './FootnoteBlock';
import { TableOfContentsBlock } from './TableOfContentsBlock';
import { SpreadsheetBlock } from './SpreadsheetBlock';
import { VegaPlotBlock } from './VegaPlotBlock';
import { AccordionBlock } from './AccordionBlock';
import { AlertBlock } from './AlertBlock';
import { BibliographyBlock } from './BibliographyBlock';
import { FootnotesBlock } from './FootnotesBlock';
import { TableBlock } from './TableBlock';
import { TimelineBlock } from './TimelineBlock';
import { DefinitionBlock } from './DefinitionBlock';
import { GlossaryBlock } from './GlossaryBlock';
import { TheoremBlock } from './TheoremBlock';
import { CitationBlock } from './CitationBlock';
import { ButtonBlock } from './ButtonBlock';
import { ToggleBlock } from './ToggleBlock';
import { DiffBlock } from './DiffBlock';
import { EmbedBlock } from './EmbedBlock';
import { GalleryBlock } from './GalleryBlock';
import { QuizBlock } from './QuizBlock';
import { FormBlock } from './FormBlock';
import { CLIBlock } from './CLIBlock';
import { FileTreeBlock } from './FileTreeBlock';
import { IframeBlock } from './IframeBlock';
import { SlideshowBlock } from './SlideshowBlock';
import { AnimationBlock } from './AnimationBlock';
import { DataStructureBlock } from './DataStructureBlock';
import { SandboxBlock } from './SandboxBlock';
import { Model3DBlock } from './Model3DBlock';
import { TraceBlock } from './TraceBlock';
import { WorkflowBlock } from './WorkflowBlock';
import { ConstraintBlock } from './ConstraintBlock';
import { ASTBlock } from './ASTBlock';
import { BNFBlock } from './BNFBlock';
import { GraphBlock } from './GraphBlock';
import { BlocklyBlock } from './BlocklyBlock';
import { ElectricalDiagramBlock } from './ElectricalDiagramBlock';
import { DrawingBlock } from './DrawingBlock';
import { MarkdownEditorBlock } from './MarkdownEditorBlock';

// Import editors
import { HeadingBlockEditor } from './HeadingBlockEditor';
import { ParagraphBlockEditor } from './ParagraphBlockEditor';
import { TextBlockEditor } from './TextBlockEditor';
import { ImageBlockEditor } from './ImageBlockEditor';
import { CodeBlockEditor } from './CodeBlockEditor';
import { MediaBlockEditor } from './MediaBlockEditor';
import { ListBlockEditor } from './ListBlockEditor';
import { LayoutBlockEditor } from './LayoutBlockEditor';
import { LatexBlockEditor } from './LatexBlockEditor';
import { MermaidBlockEditor } from './MermaidBlockEditor';
import { ReferenceBlockEditor } from './ReferenceBlockEditor';
import { FootnoteBlockEditor } from './FootnoteBlockEditor';
import { TableOfContentsBlockEditor } from './TableOfContentsBlockEditor';
import { SpreadsheetBlockEditor } from './SpreadsheetBlockEditor';
import { VegaPlotBlockEditor } from './VegaPlotBlockEditor';
import { AccordionBlockEditor } from './AccordionBlockEditor';
import { AlertBlockEditor } from './AlertBlockEditor';
import { BibliographyBlockEditor } from './BibliographyBlockEditor';
import { FootnotesBlockEditor } from './FootnotesBlockEditor';
import { TableBlockEditor } from './TableBlockEditor';
import { TimelineBlockEditor } from './TimelineBlockEditor';
import { DefinitionBlockEditor } from './DefinitionBlockEditor';
import { GlossaryBlockEditor } from './GlossaryBlockEditor';
import { TheoremBlockEditor } from './TheoremBlockEditor';
import { CitationBlockEditor } from './CitationBlockEditor';
import { ButtonBlockEditor } from './ButtonBlockEditor';
import { ToggleBlockEditor } from './ToggleBlockEditor';
import { DiffBlockEditor } from './DiffBlockEditor';
import { EmbedBlockEditor } from './EmbedBlockEditor';
import { GalleryBlockEditor } from './GalleryBlockEditor';
import { QuizBlockEditor } from './QuizBlockEditor';
import { FormBlockEditor } from './FormBlockEditor';
import { CLIBlockEditor } from './CLIBlockEditor';
import { FileTreeBlockEditor } from './FileTreeBlockEditor';
import { IframeBlockEditor } from './IframeBlockEditor';
import { SlideshowBlockEditor } from './SlideshowBlockEditor';
import { AnimationBlockEditor } from './AnimationBlockEditor';
import { DataStructureBlockEditor } from './DataStructureBlockEditor';
import { SandboxBlockEditor } from './SandboxBlockEditor';
import { Model3DBlockEditor } from './Model3DBlockEditor';
import { TraceBlockEditor } from './TraceBlockEditor';
import { WorkflowBlockEditor } from './WorkflowBlockEditor';
import { ConstraintBlockEditor } from './ConstraintBlockEditor';
import { ASTBlockEditor } from './ASTBlockEditor';
import { BNFBlockEditor } from './BNFBlockEditor';
import { GraphBlockEditor } from './GraphBlockEditor';
import { BlocklyBlockEditor } from './BlocklyBlockEditor';
import { ElectricalDiagramBlockEditor } from './ElectricalDiagramBlockEditor';
import { DrawingBlockEditor } from './DrawingBlockEditor';
import { MarkdownEditorBlockEditor } from './MarkdownEditorBlockEditor';

/**
 * Block factory that maps block kinds to their corresponding components and editors
 */
class BlockFactoryClass {
    private blockMap: Map<string, React.FC<BlockComponentProps>>;
    private editorMap: Map<string, React.FC<BlockEditorProps>>;

    constructor() {
        this.blockMap = new Map();
        this.editorMap = new Map();
        this.registerDefaultBlocks();
    }

    /**
     * Register all default block types
     */
    private registerDefaultBlocks() {
        this.register('heading', HeadingBlock, HeadingBlockEditor);
        this.register('paragraph', ParagraphBlock, ParagraphBlockEditor);
        this.register('text', TextBlock, TextBlockEditor);
        this.register('image', ImageBlock, ImageBlockEditor);
        this.register('code', CodeBlock, CodeBlockEditor);
        this.register('video', VideoBlock, MediaBlockEditor);
        this.register('audio', AudioBlock, MediaBlockEditor);
        this.register('list', ListBlock, ListBlockEditor);
        this.register('layout', LayoutBlock, LayoutBlockEditor);
        this.register('latex', LatexBlock, LatexBlockEditor);
        this.register('mermaid', MermaidBlock, MermaidBlockEditor);
        this.register('reference', ReferenceBlock, ReferenceBlockEditor);
        this.register('footnote', FootnoteBlock, FootnoteBlockEditor);
        this.register('toc', TableOfContentsBlock, TableOfContentsBlockEditor);
        this.register('spreadsheet', SpreadsheetBlock, SpreadsheetBlockEditor);
        this.register('plot', VegaPlotBlock, VegaPlotBlockEditor);
        this.register('accordion', AccordionBlock, AccordionBlockEditor);
        this.register('alert', AlertBlock, AlertBlockEditor);
        this.register('bibliography', BibliographyBlock, BibliographyBlockEditor);
        this.register('footnotes', FootnotesBlock, FootnotesBlockEditor);
        this.register('table', TableBlock, TableBlockEditor);
        this.register('timeline', TimelineBlock, TimelineBlockEditor);
        this.register('definition', DefinitionBlock, DefinitionBlockEditor);
        this.register('glossary', GlossaryBlock, GlossaryBlockEditor);
        this.register('theorem', TheoremBlock, TheoremBlockEditor);
        this.register('citation', CitationBlock, CitationBlockEditor);
        this.register('button', ButtonBlock, ButtonBlockEditor);
        this.register('toggle', ToggleBlock, ToggleBlockEditor);
        this.register('diff', DiffBlock, DiffBlockEditor);
        this.register('embed', EmbedBlock, EmbedBlockEditor);
        this.register('gallery', GalleryBlock, GalleryBlockEditor);
        this.register('quiz', QuizBlock, QuizBlockEditor);
        this.register('form', FormBlock, FormBlockEditor);
        this.register('cli', CLIBlock, CLIBlockEditor);
        this.register('filetree', FileTreeBlock, FileTreeBlockEditor);
        this.register('iframe', IframeBlock, IframeBlockEditor);
        this.register('slideshow', SlideshowBlock, SlideshowBlockEditor);
        this.register('animation', AnimationBlock, AnimationBlockEditor);
        this.register('datastructure', DataStructureBlock, DataStructureBlockEditor);
        this.register('sandbox', SandboxBlock, SandboxBlockEditor);
        this.register('model3d', Model3DBlock, Model3DBlockEditor);
        this.register('trace', TraceBlock, TraceBlockEditor);
        this.register('workflow', WorkflowBlock, WorkflowBlockEditor);
        this.register('constraint', ConstraintBlock, ConstraintBlockEditor);
        this.register('ast', ASTBlock, ASTBlockEditor);
        this.register('bnf', BNFBlock, BNFBlockEditor);
        this.register('graph', GraphBlock, GraphBlockEditor);
        this.register('blockly', BlocklyBlock, BlocklyBlockEditor);
        this.register('electrical', ElectricalDiagramBlock, ElectricalDiagramBlockEditor);
        this.register('drawing', DrawingBlock, DrawingBlockEditor);
        this.register('markdown', MarkdownEditorBlock, MarkdownEditorBlockEditor);
    }

    /**
     * Register a new block type with its component and optional editor
     */
    public register(
        kind: string,
        component: React.FC<BlockComponentProps>,
        editor?: React.FC<BlockEditorProps>
    ) {
        this.blockMap.set(kind, component);
        if (editor) {
            this.editorMap.set(kind, editor);
        }
    }

    /**
     * Get the component for a given block kind
     */
    public getComponent(kind: string): React.FC<BlockComponentProps> | undefined {
        return this.blockMap.get(kind);
    }

    /**
     * Get the editor component for a given block kind
     */
    public getEditor(kind: string): React.FC<BlockEditorProps> | undefined {
        return this.editorMap.get(kind);
    }

    /**
     * Check if a block kind is registered
     */
    public hasComponent(kind: string): boolean {
        return this.blockMap.has(kind);
    }

    /**
     * Check if a block kind has an editor
     */
    public hasEditor(kind: string): boolean {
        return this.editorMap.has(kind);
    }

    /**
     * Render a block using the factory
     */
    public render(props: BlockComponentProps): React.ReactElement {
        const { block } = props;
        const kind = block.kind || 'text';

        const Component = this.getComponent(kind);

        if (Component) {
            return <Component {...props} />;
        }

        // Fallback for unknown block types
        return (
            <Box mb={4} p={4} bg="yellow.50" borderRadius="md" borderLeft="4px solid" borderColor="yellow.400">
                <Text fontSize="sm" fontWeight="bold" color="yellow.800" mb={2}>
                    Unknown Block Type: {kind}
                </Text>
                <Text fontSize="xs" color="gray.600">
                    Block data: {JSON.stringify(block.data, null, 2)}
                </Text>
            </Box>
        );
    }

    /**
     * Render an editor for a block using the factory
     */
    public renderEditor(props: BlockEditorProps): React.ReactElement {
        const { block } = props;
        const kind = block.kind || 'text';

        const EditorComponent = this.getEditor(kind);

        if (EditorComponent) {
            return <EditorComponent {...props} />;
        }

        // Fallback for blocks without editors
        return (
            <Text fontSize="sm" color="gray.500">
                No editor available for this block type
            </Text>
        );
    }

    /**
     * Get all registered block kinds
     */
    public getRegisteredKinds(): string[] {
        return Array.from(this.blockMap.keys());
    }
}

// Export a singleton instance
export const BlockFactory = new BlockFactoryClass();

// Export React component wrappers for convenience
export const BlockRenderer: React.FC<BlockComponentProps> = (props) => {
    return BlockFactory.render(props);
};

export const BlockEditorRenderer: React.FC<BlockEditorProps> = (props) => {
    return BlockFactory.renderEditor(props);
};

