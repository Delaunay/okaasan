import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  HStack,
  Box,
  Grid,
  Heading,
} from '@chakra-ui/react';
import { Button, CloseButton, Dialog, Portal } from "@chakra-ui/react";
import { IconButton, Flex } from "@chakra-ui/react";
import { Trash, GripVertical, Settings } from "lucide-react";
import { isStaticMode } from '../../services/api';
import { useColorModeValue } from '../ui/color-mode';
import { Textarea, Input } from '@chakra-ui/react';
import { parseMarkdown } from './markdown';
import {
  Stack,
  Field,
  NumberInput,
} from "@chakra-ui/react"
import type { ArticleInstance } from "./article"


export interface BlockDef {
  id: number;
  page_id: number;
  parent_id?: number;
  kind: string;
  data: any;
  extension: any;
  sequence: number;
  children?: Array<BlockDef>;
}

export interface ArticleDef {
  id: number;
  root_id: number;
  parent_id?: number;
  title: string;
  namespace: string;
  sequence: number;
  tags: any;
  extension: any;
  public?: boolean;
  article_kind?: string;
  blocks: Array<BlockDef>;
  children?: Array<ArticleDef>;
  top_level_article?: { id: number; title: string };
}

type BlockCtor = new (owner: ArticleInstance, def: BlockDef, parent?: ArticleBlock) => BlockBase;

class BlockRegistry {
  private static registry = new Map<string, BlockCtor>();

  static register(kind: string, ctor: BlockCtor) {
    if (this.registry.has(kind)) {
      console.warn(`Block kind "${kind}" already registered`);
    }
    this.registry.set(kind, ctor);
  }

  static create(owner: ArticleInstance, def: BlockDef, parent?: ArticleBlock): BlockBase {
    const ctor = this.registry.get(def.kind) ?? UnknownBlock;
    return new ctor(owner, def, parent);
  }
}

export function newBlock(owner: ArticleInstance, def: BlockDef, parent?: ArticleBlock): BlockBase {
  return BlockRegistry.create(owner, def, parent);
}


export interface BlockSetting {

}


interface BlockWrapperProps {
  block: BlockBase;
}

interface MarkdownEditorProps {
  block: BlockBase
}

const _objectIds = new WeakMap<object, number>();
let _nextId = 1;

export function getId(obj: object): number {
  if (!_objectIds.has(obj)) {
    _objectIds.set(obj, _nextId++);
  }
  return _objectIds.get(obj)!;
}


const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ block }) => {
  //
  // Markdown editor for node that are convertible to markdown
  // Allow us to insert new markdown nodes straight into the article
  // or update current nodes
  //
  const [markdown, setMarkdown] = useState(block.as_markdown(new MarkdownGeneratorContext()));
  const lineCount = markdown.split("\n").length || 1;
  const isEmpty = !markdown.trim();

  const updateBlock = (parsedDef) => {
    block.article.updateBlock(block, parsedDef)
    setMarkdown(block.as_markdown(new MarkdownGeneratorContext()))
  }

  const updateMarkdown = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMarkdown(e.target.value)
  }

  const updateBlocks = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const parsed = parseMarkdown(e.target.value);

    if (block.def.kind === "input") {
      const parent = block.getParent()
      const target = parent.children.at(-1) ?? null;
      block.article.insertBlock(parent, target, "after", [parsed])
      return
    }

    parsed.children = parsed.children.filter(child => child.kind !== "separator")

    // parseMarkdown wraps multiple top-level blocks in an item wrapper.
    // When the original block is NOT an item, we need to split:
    // update the original with the matching child, insert the rest as siblings.
    const isMultiBlockWrapper = parsed.kind === "item" &&
      Object.keys(parsed.data ?? {}).length === 0 &&
      parsed.children?.length > 1;

    if (isMultiBlockWrapper && block.def.kind !== "item") {
      const children = parsed.children;

      // Find the child that matches the original block's kind
      const matchIndex = children.findIndex(c => c.kind === block.def.kind);

      if (matchIndex !== -1) {
        updateBlock(children[matchIndex]);

        const parent = block.getParent();
        const blockId = block.def.id;

        const before = children.slice(0, matchIndex);
        if (before.length > 0) {
          block.article.insertBlock(parent, block, "before", before);
        }

        const after = children.slice(matchIndex + 1);
        if (after.length > 0) {
          const current = (parent.children as BlockBase[]).find(c => c.def.id === blockId) ?? block;
          block.article.insertBlock(parent, current, "after", after);
        }
      } else {
        updateBlock(children[0]);

        const rest = children.slice(1);
        if (rest.length > 0) {
          const parent = block.getParent();
          const blockId = block.def.id;
          const current = (parent.children as BlockBase[]).find(c => c.def.id === blockId) ?? block;
          block.article.insertBlock(parent, current, "after", rest);
        }
      }
      return;
    }

    updateBlock(parsed)
  }

  const openPicker = () => {
    block.article.openBlockPicker((entry: BlockTypeEntry) => {
      const newDef: BlockDef = {
        id: 0,
        page_id: block.article.def.id,
        parent_id: undefined,
        kind: entry.kind,
        data: { ...entry.defaultData },
        extension: null,
        sequence: 0,
        children: entry.defaultChildren ? structuredClone(entry.defaultChildren) : undefined,
      };

      console.log("[Picker/MarkdownEditor] inserting block:", entry.kind);
      console.log("[Picker/MarkdownEditor] newDef:", newDef);
      console.log("[Picker/MarkdownEditor] current block:", block.def.kind, "id:", block.def.id);

      if (block.def.kind === "input") {
        const parent = block.getParent();
        const target = parent.children.at(-1) ?? null;
        console.log("[Picker/MarkdownEditor] input mode — parent:", parent.def?.kind, "target:", target?.def?.kind, "parent.children:", parent.children.length);
        block.article.insertBlock(parent, target, "after", [newDef]);
      } else {
        const parent = block.getParent();
        console.log("[Picker/MarkdownEditor] replace mode — parent:", parent.def?.kind, "parent.children:", parent.children.length, "parent.def.children:", parent.def?.children?.length);
        block.article.insertBlock(parent, block, "after", [newDef]);
        block.article.deleteBlock(block);
      }
    });
  };

  return (
    <Flex align="center" gap={1}>
      <Textarea
        value={markdown}
        onChange={updateMarkdown}
        onBlur={updateBlocks}
        rows={lineCount}
        fontFamily="mono"
        placeholder="Type markdown here..."
        flex="1"
      />
      {isEmpty && (
        <IconButton
          size="xs"
          borderRadius="full"
          variant="outline"
          aria-label="Insert non-markdown block"
          onClick={openPicker}
          colorPalette="blue"
          flexShrink={0}
        >
          <span style={{ fontSize: "13px", lineHeight: 1, fontWeight: "bold" }}>+</span>
        </IconButton>
      )}
    </Flex>
  );
};

// ─── Block Picker Dialog (shared by MarkdownEditor and InsertBlockGap) ────────

interface BlockPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entry: BlockTypeEntry) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
}

export const BlockPickerDialog: React.FC<BlockPickerDialogProps> = ({
  open, onOpenChange, onSelect, selectedCategory, onCategoryChange,
}) => (
  <Dialog.Root
    open={open}
    onOpenChange={d => onOpenChange(d.open)}
    placement="center"
    motionPreset="slide-in-bottom"
  >
    <Portal>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="560px">
          <Dialog.Header>
            <Dialog.Title>Insert block</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body pb={6}>
            <Flex gap={2} mb={4} flexWrap="wrap">
              {BLOCK_CATEGORIES.map(cat => (
                <Box
                  key={cat}
                  as="button"
                  px={3}
                  py={1}
                  borderRadius="full"
                  fontSize="sm"
                  bg={selectedCategory === cat ? "blue.500" : "gray.100"}
                  color={selectedCategory === cat ? "white" : "gray.700"}
                  cursor="pointer"
                  onClick={() => onCategoryChange(cat)}
                  _hover={{ bg: selectedCategory === cat ? "blue.600" : "gray.200" }}
                >
                  {cat}
                </Box>
              ))}
            </Flex>
            <Grid templateColumns="repeat(3, 1fr)" gap={3}>
              {BLOCK_TYPES.filter(t => t.category === selectedCategory).map(entry => (
                <Box
                  key={entry.kind}
                  as="button"
                  p={3}
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="md"
                  textAlign="left"
                  cursor="pointer"
                  _hover={{ bg: "blue.50", borderColor: "blue.300" }}
                  onClick={() => onSelect(entry)}
                >
                  <Box fontWeight="semibold" fontSize="sm">{entry.label}</Box>
                  <Box fontSize="xs" color="gray.500">{entry.kind}</Box>
                </Box>
              ))}
            </Grid>
          </Dialog.Body>
          <Dialog.CloseTrigger asChild>
            <CloseButton size="sm" />
          </Dialog.CloseTrigger>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);



const BlockWrapper: React.FC<BlockWrapperProps> = ({ block }) => {
  if (isStaticMode()) {
    return <>{block.component("view")}</>;
  }

  //
  // This is the core wrapper
  // Every block gets wrapped with this component
  //  This allows for unified logic for
  //    Settings
  //    Drag and drop
  //    Delete
  //    Edit/View mode
  //
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const editTrigger = block.article.options?.editTrigger ?? "click";
  const is_md_ok = block.is_md_representable();
  const hoverBg = useColorModeValue("blackAlpha.50", "whiteAlpha.50");

  const editing = editTrigger === "hover"
    ? hovered || focused
    : focused;
  const mode = editing ? "edit" : "view";
  const showHoverHint = hovered && !editing && is_md_ok;

  const handleMouseOver = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    // Find the nearest .TOP_LEVEL_BLOCK ancestor (or self) of the hovered element.
    // If it's this wrapper, the mouse is over this block's own content → show icons.
    // If it's a child block, hide this block's icons.
    const nearest = (e.target as HTMLElement).closest('.TOP_LEVEL_BLOCK');
    setHovered(nearest === wrapperRef.current);
  }, []);

  return (
    <Box
      ref={wrapperRef}
      key={`bx-${block.key}`}
      data-block-id={block.def.id}
      pl="5px"
      pr="36px"
      py="5px"
      className="TOP_LEVEL_BLOCK"
      display="flex" flexDirection="column" flex="1" minH={0}
      onMouseOver={handleMouseOver}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation()
        setFocused(true)
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFocused(false)
        }
      }}
      tabIndex={0}
      position="relative"
      cursor={is_md_ok && !editing && editTrigger === "click" ? "pointer" : undefined}
      bg={showHoverHint ? hoverBg : undefined}
      borderRadius={showHoverHint ? "md" : undefined}
      outline={focused ? "2px solid" : "none"}
      outlineColor="blue.500"
      transition="background 0.15s ease"
      minHeight="2rem"
    >
      {/* Drag handle (left) */}
      <Box
        position="absolute"
        insetInlineStart="-20px"
        insetBlockStart="50%"
        transform="translateY(-50%)"
        opacity={hovered ? "1" : "0.1"}
        cursor="grab"
        transition="opacity 0.15s ease"
      >
        <GripVertical size={16} />
      </Box>

      {/* Config button (top-right) */}
      {block.has_settings() && (
        <Dialog.Root size="cover" placement="center" motionPreset="slide-in-bottom">
          <Dialog.Trigger asChild>
            <IconButton
              className="block-icon"
              position="absolute"
              insetBlockStart="0px"
              insetInlineEnd="4px"
              size="xs"
              variant="ghost"
              aria-label="Configure block"
              opacity={hovered ? 1 : 0}
              transition="opacity 0.15s ease"
              zIndex="1000"
            >
              <Settings size={14} />
            </IconButton>
          </Dialog.Trigger>
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content>
                <Dialog.Header>
                  <Dialog.Title>Dialog Title</Dialog.Title>
                </Dialog.Header>
                <Dialog.Body margin="10px">
                  {block.settingWithPreview()}
                </Dialog.Body>
                {/* <Dialog.Footer>
                    <Dialog.ActionTrigger asChild>
                      <Button variant="outline">Cancel</Button>
                    </Dialog.ActionTrigger>
                    <Button>Save</Button>
                  </Dialog.Footer> */}
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Dialog.CloseTrigger>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      )}

      {/* Delete button (bottom-right) */}
      <IconButton
        className="block-icon"
        position="absolute"
        bottom="4px"
        right="4px"
        size="xs"
        variant="ghost"
        aria-label="Delete block"
        opacity={hovered ? 1 : 0}
        transition="opacity 0.15s ease"
        zIndex="1000"
        onClick={() => {
          block.article.deleteBlock(block)
        }}
      >
        <Trash size={14} />
      </IconButton>

      {is_md_ok && mode === "edit" ?
        <MarkdownEditor key={`md-${block.key}`} block={block}></MarkdownEditor> : block.component(mode)}
    </Box>
  );
};

export class MarkdownGeneratorContext {
  level: number = 0

  constructor(lvl: number = 0) {
    this.level = lvl;
  }

  inc() {
    return new MarkdownGeneratorContext(this.level + 1);
  }
}

function _uniqueKey() {
  let counter = 0
  return function () {
    return counter++;
  }
}

let keyCounter = _uniqueKey()


export abstract class ArticleBlock {
  static kind: string;

  def: any = {}

  children: Array<ArticleBlock> = []

  article: any

  abstract notify(): void

  abstract getDefinitionChildren(): ArticleDef[]
}

export abstract class BlockBase implements ArticleBlock {
  static kind: string
  article: ArticleInstance;
  def: BlockDef;
  children: Array<BlockBase>;
  version: number = 0;
  edit: boolean = false;
  key: number = keyCounter();
  [key: string]: any; // allow arbitrary properties

  protected static register() {
    BlockRegistry.register(
      (this as typeof BlockBase).kind,
      this as unknown as BlockCtor
    );
  }

  getDefinitionChildren(): ArticleDef[] {
    return this.def.children;
  }

  public getSequence() {
    return this.def.sequence ?? this.def.id;
  }

  constructor(owner: ArticleInstance, block: BlockDef, parent?: BlockBase) {
    this.parent = parent
    this.article = owner;
    this.def = block;
    this.children = this.def.children ? this.def.children?.map(child => newBlock(this.article, child, this)) : [];
    this.version = 0

    if (this.def.sequence === undefined) {
      // console.log("UNDEFINED SEQUENCE", this)
    }
  }

  public getParent(): ArticleBlock {
    return this.parent
  }

  getParentId(): null | number {
    if (this.parent === this.article) {
      return null;
    }
    return this.parent.def.id
  }

  public getChildren(): ArticleBlock[] {
    return this.children;
  }

  notify() {
    this.article.notify();
  }

  set(props: Record<string, any>): this {
    for (const key in props) {
      this[key] = props[key];
    }
    return this;
  }

  component(mode: string): React.ReactNode {
    return (
      <Box
        padding="1px"
        margin="1px"
        border="1px solid"
        borderColor="gray.400"
      >
        {this.def.kind}
        {this.children.map(child => child.react())}
      </Box>
    )
  }

  inline(): React.ReactNode {
    return this.component("view")
  }

  react(): React.ReactNode {
    return <BlockWrapper key={`ev-${this.key}`} block={this}></BlockWrapper>
  }

  settingWithPreview(): React.ReactNode {
    return <Grid templateColumns="1fr 1fr" gap="6" w="100%" h="100%">
      <Box minW="0">
        <Heading>Preview</Heading>
        <Box minW="0" height="100%" border="1px solid">
          {this.react()}
        </Box>
      </Box>

      <Box minW="0">
        <Heading>Settings</Heading>
        {this.settingForm()}
      </Box>
    </Grid>
  }

  settingForm(): React.ReactNode {
    return <AutoBlockSettingsForm
      schema={this.settings()}
      values={this.def.data}
      onSubmit={(data) => {
        this.def.data = data;
        this.article._updateBlock(this, this.def);
      }} />
  }

  settings(): BlockSetting {
    return {}
  }

  has_settings(): boolean {
    // If the block is not md representable then for sure it will have a way to
    // configure it
    return !this.is_md_representable();
  }

  is_md_representable(): boolean {
    return true;
  }

  is_md_block(): boolean {
    return false;
  }

  as_markdown(ctx: MarkdownGeneratorContext): string {
    return ``
  }

  is_definition_same(other: BlockDef): boolean {
    console.log("CMP", this.def, other)

    if (this.kind != other.kind) {
      return false
    }

    return this.def == other
  }
}


export class UnknownBlock extends BlockBase {
  static kind = "unknown";

  static {
    this.register();
  }

  constructor(owner: ArticleInstance, def: BlockDef, parent?: BlockBase) {
    super(owner, def, parent);
    console.warn("Unknown block kind:", def.kind);
  }
}



type SettingsFormProps = {
  schema: BlockSetting
  values: Record<string, any>
  onSubmit: (values: Record<string, any>) => void
}

export function AutoBlockSettingsForm({
  schema,
  values,
  onSubmit,
}: SettingsFormProps) {
  const [state, setState] = useState(values)

  function update(key: string, value: any) {
    const next = { ...state, [key]: value };
    setState(next);
    onSubmit(next);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(state)
      }}
    >
      <Stack gap="4" width="100%">
        {Object.entries(schema).map(([key, def]) => {
          const label = key[0].toUpperCase() + key.slice(1)

          switch (def.type) {
            case "string":
              return (
                <Field.Root key={key}>
                  <Field.Label>{label}</Field.Label>
                  <Input
                    value={state[key] ?? ""}
                    onChange={(e) => update(key, e.target.value)}
                  />
                </Field.Root>
              )

            case "int":
              return (
                <Field.Root key={key}>
                  <Field.Label>{label}</Field.Label>
                  <NumberInput.Root
                    value={state[key] ?? ""}
                    onValueChange={(v) =>
                      update(key, v.valueAsNumber)
                    }
                  >
                    <NumberInput.Input />
                  </NumberInput.Root>
                </Field.Root>
              )

            case "select":
              return (
                <Field.Root key={key}>
                  <Field.Label>{label}</Field.Label>
                  <select
                    value={state[key] ?? ""}
                    onChange={(e) => update(key, e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0 0.75rem",
                      height: "2.5rem",
                      borderRadius: "var(--chakra-radii-md)",
                      border: "1px solid var(--chakra-colors-border)",
                      background: "var(--chakra-colors-bg)",
                      color: "inherit",
                      fontSize: "inherit",
                    }}
                  >
                    {(def.options ?? []).map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </Field.Root>
              )

            default:
              return null
          }
        })}

        <Button type="submit" alignSelf="flex-end">
          Save
        </Button>
      </Stack>
    </form>
  )
}




export interface Action {
  op: string
}

export interface ActionDeleteBlock extends Action {
  op: "delete"
  block_id: number
  index: number
}

export interface ActionUpdateBlock extends Action {
  op: "update"
  id: number
  block_def: BlockDef
}

export interface ActionReorderBlock extends Action {
  op: "reorder"
  block_id: number
  sequence: number
}

export interface ActionInsertBlock extends Action {
  op: "insert"
  page_id: number
  parent: number    // This is where we are going to insert
  children: BlockDef[]
}

export interface ActionUpdateArticle extends Action {
  op: "update_article"
  title?: string
  public?: boolean
  article_kind?: string
}


export interface ActionInsertBlockReplyChild {
  id: number;
  page_id: number;
  children: ActionInsertBlockReplyChild[]
}

export interface ActionInsertBlockReply {
  action: "insert"
  children: ActionInsertBlockReplyChild[]
}


export interface ActionBatch {
  actions: Action[]
}

export interface PendingAction {
  action: Action;
  doAction: () => void;
  undoAction: () => void;
  blocks?: ArticleBlock[];
}

// ─── Empty Block Placeholder ──────────────────────────────────────────────────

interface EmptyBlockPlaceholderProps {
  icon?: string;
  label: string;
  hint?: string;
}

export const EmptyBlockPlaceholder: React.FC<EmptyBlockPlaceholderProps> = ({ icon, label, hint }) => (
  <Flex
    direction="column"
    align="center"
    justify="center"
    minH="60px"
    py={4}
    px={6}
    border="2px dashed"
    borderColor="gray.300"
    borderRadius="md"
    color="gray.400"
    gap={1}
    _dark={{ borderColor: "gray.600", color: "gray.500" }}
  >
    {icon && <Box fontSize="2xl" lineHeight={1}>{icon}</Box>}
    <Box fontSize="sm" fontWeight="medium">{label}</Box>
    {hint && <Box fontSize="xs" fontStyle="italic">{hint}</Box>}
  </Flex>
);

// ─── Block Type Registry (for the insert picker) ─────────────────────────────

export interface BlockTypeEntry {
  kind: string;
  label: string;
  category: string;
  defaultData: any;
  defaultChildren?: BlockDef[];
}

const BLOCK_TYPES: BlockTypeEntry[] = [
  // Text
  { kind: "paragraph",  label: "Paragraph",   category: "Text",        defaultData: { text: "" } },
  { kind: "heading",    label: "Heading",      category: "Text",        defaultData: { level: 2, text: "Heading" } },
  { kind: "code",       label: "Code",         category: "Text",        defaultData: { code: "", language: "python" } },
  { kind: "blockquote", label: "Blockquote",   category: "Text",        defaultData: { text: "" } },
  { kind: "alert",      label: "Alert",        category: "Text",        defaultData: { type: "info", title: "Note", message: "" } },
  { kind: "latex",      label: "LaTeX",        category: "Text",        defaultData: { formula: "" } },
  // Data
  { kind: "table",      label: "Table",        category: "Data",        defaultData: { data: "[]", columns: [] } },
  { kind: "spreadsheet",label: "Spreadsheet",  category: "Data",        defaultData: { data: [["","",""],["","",""],["","",""]], headers: ["A","B","C"] } },
  { kind: "plot",       label: "Plot",         category: "Data",        defaultData: { spec: {} } },
  // Media
  { kind: "image",      label: "Image",        category: "Media",       defaultData: { url: "", alt: "" } },
  { kind: "video",      label: "Video",        category: "Media",       defaultData: { url: "" } },
  { kind: "audio",      label: "Audio",        category: "Media",       defaultData: { url: "" } },
  { kind: "gallery",    label: "Gallery",      category: "Media",       defaultData: { images: [] } },
  // Layout
  { kind: "layout",     label: "Layout",       category: "Layout",      defaultData: { layout: "column", column: 2 }, defaultChildren: [
    { id: 0, page_id: 0, kind: "item", data: {}, extension: null, sequence: 0, children: [] },
    { id: 0, page_id: 0, kind: "item", data: {}, extension: null, sequence: 1, children: [] },
  ] },
  { kind: "accordion",  label: "Accordion",    category: "Layout",      defaultData: { items: [{ title: "Section", content: "Content here" }] } },
  { kind: "toggle",     label: "Toggle",       category: "Layout",      defaultData: { title: "Details", content: "" } },
  { kind: "slideshow",  label: "Slideshow",    category: "Layout",      defaultData: { slides: [] } },
  // Interactive
  { kind: "quiz",       label: "Quiz",         category: "Interactive", defaultData: { question: "", choices: [] } },
  { kind: "form",       label: "Form",         category: "Interactive", defaultData: { fields: [] } },
  { kind: "button",     label: "Button",       category: "Interactive", defaultData: { label: "Click me", url: "" } },
  // Visual
  { kind: "mermaid",    label: "Mermaid",      category: "Visual",      defaultData: { diagram: "graph TD\n  A --> B" } },
  { kind: "timeline",   label: "Timeline",     category: "Visual",      defaultData: { events: [] } },
  { kind: "drawing",    label: "Drawing",      category: "Visual",      defaultData: {} },
  // Advanced
  { kind: "embed",      label: "Embed",        category: "Advanced",    defaultData: { url: "" } },
  { kind: "iframe",     label: "iFrame",       category: "Advanced",    defaultData: { url: "" } },
  { kind: "sandbox",    label: "Sandbox",      category: "Advanced",    defaultData: {} },
];

const BLOCK_CATEGORIES = Array.from(new Set(BLOCK_TYPES.map(t => t.category)));

// ─── InsertBlockGap ───────────────────────────────────────────────────────────

interface InsertBlockGapProps {
  article: ArticleInstance;
  after: BlockBase | null; // null = insert at start
}

export const InsertBlockGap: React.FC<InsertBlockGapProps> = ({ article, after }) => {
  if (isStaticMode()) {
    return null;
  }

  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    article.openBlockPicker((entry: BlockTypeEntry) => {
      const newDef: BlockDef = {
        id: 0,
        page_id: article.def.id,
        parent_id: undefined,
        kind: entry.kind,
        data: { ...entry.defaultData },
        extension: null,
        sequence: 0,
        children: entry.defaultChildren ? structuredClone(entry.defaultChildren) : undefined,
      };
      console.log("[Picker/Gap] inserting block:", entry.kind);
      console.log("[Picker/Gap] newDef:", newDef);
      console.log("[Picker/Gap] after:", after?.def?.kind, "id:", after?.def?.id);

      if (after === null) {
        const firstBlock = (article.children as BlockBase[])[0] ?? null;
        console.log("[Picker/Gap] insert at start — firstBlock:", firstBlock?.def?.kind);
        
        if (firstBlock) {
          article.insertBlock(article, firstBlock, "before", [newDef]);
        } else {
          article.insertBlock(article, null, "after", [newDef]);
        }
      } else {
        console.log("[Picker/Gap] insert after block — parent children:", article.children.length, "parent def.children:", article.def.blocks?.length);
        article.insertBlock(article, after, "after", [newDef]);
      }
    });
  };

  return (
    <Box position="relative" h="0" zIndex={20}>
      <Box
        position="absolute"
        left={0}
        right={0}
        top="-10px"
        bottom="-10px"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        cursor="default"
      />

      {hovered && (
        <Box
          position="absolute"
          left={0}
          right={0}
          top="-1px"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <Box h="2px" bg="blue.300" borderRadius="full" />
          <Flex
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            zIndex={21}
          >
            <IconButton
              size="2xs"
              borderRadius="full"
              variant="solid"
              aria-label="Insert block"
              onClick={handleClick}
              style={{ background: "#3182ce", color: "white" }}
            >
              <span style={{ fontSize: "13px", lineHeight: 1, fontWeight: "bold" }}>+</span>
            </IconButton>
          </Flex>
        </Box>
      )}
    </Box>
  );
};
