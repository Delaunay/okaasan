
import React, { useState, useRef, useEffect } from 'react';
import {
    Box,
    Heading,
    Input,
    Flex,
    Text,
    Button,
    Badge,
    IconButton,
    Portal,
} from '@chakra-ui/react';
import { Settings } from 'lucide-react';


import { BlockBase, newBlock, ArticleDef, BlockDef, PendingAction, InsertBlockGap, BlockPickerDialog } from './base'
import type {
    ActionDeleteBlock,
    ActionUpdateBlock,
    ActionReorderBlock,
    ActionInsertBlock,
    ActionBatch,
    ArticleBlock,
    ActionInsertBlockReply,
    ActionUpdateArticle,
    BlockTypeEntry,
} from './base'
import { recipeAPI, isStaticMode } from '../../services/api'
import { useColorModeValue } from '../ui/color-mode'
import { SubPageList } from './subpages'

import "./blocks/heading"
import "./blocks/paragraph"
import "./blocks/link"
import "./blocks/text"
import "./blocks/codespan"
import "./blocks/br"
import "./blocks/hr"
import "./blocks/html"
import "./blocks/checkbox"
import "./blocks/blockquote"
import "./blocks/tablecell"
import "./blocks/tablerow"
import "./blocks/list"
import "./blocks/item"
import "./blocks/layout"
import "./blocks/toc"
import "./blocks/code"
import "./blocks/image"
import "./blocks/video"
import "./blocks/audio"
import "./blocks/latex"
import "./blocks/mermaid"
import "./blocks/reference"
import "./blocks/footnote"
import "./blocks/bibliography"
import "./blocks/footnotes"
import "./blocks/spreadsheet"
import "./blocks/plot"
import "./blocks/table"
import "./blocks/timeline"
import "./blocks/accordion"
import "./blocks/alert"
import "./blocks/quiz"
import "./blocks/toggle"
import "./blocks/button"
import "./blocks/embed"
import "./blocks/form"
import "./blocks/gallery"
import "./blocks/slideshow"
import "./blocks/animation"
import "./blocks/iframe"
import "./blocks/model3d"
import "./blocks/diff"
import "./blocks/cli"
import "./blocks/sandbox"
import "./blocks/definition"
import "./blocks/glossary"
import "./blocks/theorem"
import "./blocks/citation"
import "./blocks/graph"
import "./blocks/blockly"
import "./blocks/electrical"
import "./blocks/drawing"
import "./blocks/workflow"
import "./blocks/constraint"
import "./blocks/filetree"
import "./blocks/datastructure"
import "./blocks/trace"
import "./blocks/ast"
import "./blocks/bnf"


function loadUncomittedChange(): ActionBatch {
    //return new Array<BlockUpdate>()
    let actions = JSON.parse(localStorage.getItem('articleBlockActions') || '[]');
    return { "actions": actions }
}

function savePendingChange(batch: ActionBatch) {
    //return new Array<BlockUpdate>()
    localStorage.setItem('articleBlockActions', JSON.stringify(batch["actions"]));
}

function _reconcileChildrenInsert(article: ArticleInstance, action: ActionInsertBlock, result: ActionInsertBlockReply, blocks: ArticleBlock[], depth: number = 0) {
    const nChildrenAction = action["children"].length
    const nChildrenResult = result["children"].length
    const nChilrenBlock = blocks.length

    if (nChildrenAction !== nChildrenResult && nChildrenAction !== nChilrenBlock) {
        console.log("ERROR MISSING CHILDREN", nChildrenAction, nChildrenResult, nChilrenBlock)
    }

    const count = Math.min(nChildrenAction, nChildrenResult, nChilrenBlock)

    for (let j = 0; j < count; j++) {
        let actionChild = action["children"][j]
        let updateChild = result["children"][j]
        let block = blocks[j]

        // Set the database id here
        block.def.id = updateChild["id"]

        if (actionChild.children?.length) {
            _reconcileChildrenInsert(article, actionChild, updateChild, block.children, depth + 1)
        }
    }
}

function blockUpdateReconciliation(article: ArticleInstance, queuedActions: PendingAction[], updateResult: []) {
    //
    // Reconcile server action with displayed info
    // This is mostly here to set the block id after blocks were inserted
    //
    const nUpdate = queuedActions.length
    const nResults = updateResult.length

    if (nUpdate !== nResults) {
        console.log("ERROR MISSING RESULTS", nUpdate, nResults)
    }

    const count = Math.min(nUpdate, nResults)

    for (let i = 0; i < count; i++) {
        let action = queuedActions[i].action
        let result = updateResult[i]

        // console.log("--- RECONCILE")
        // console.log(action)
        // console.log(result)
        // console.log(queuedActions[i].blocks)

        if (action["op"] !== result["action"]) {
            console.log("ERROR: Action mismatch")
            continue
        }

        if (action["op"] === "insert") {
            _reconcileChildrenInsert(article, action, result, queuedActions[i].blocks)
        }

        if (action["op"] === "reorder") {
            // Already reordered
        }

        if (action["op"] === "update") {
            // Already updated

        }

        if (action["op"] === "delete") {
            // Already deleted
        }
    }
}


function deepEquals(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

function blockDefinitionMerger(article: ArticleInstance, original: BlockBase, newer: BlockDef, depth: number = 0) {
    //
    // Merge a parsed block definition with the currently displayed block definition
    //
    //  This will create insert, update, delete action to be executed by the backend
    //
    const oldDefSnapshot = structuredClone(original.def);

    const keys = new Set([
        ...Object.keys(original.def),
        ...Object.keys(newer)
    ]);

    const skipKeys = new Set([
        "id", "page_id", "parent", "children", "parent_id",
        "sequence"
    ])

    let wasModified = false;

    for (const key of keys) {
        if (skipKeys.has(key))
            continue;

        // Only modify if the key exists in the newer definition;
        // keys only in the original (e.g. extension) are left as-is
        if (!(key in newer))
            continue;

        const oValue = original.def[key];
        const nValue = newer[key];

        // New field
        if (oValue === undefined && nValue !== undefined) {
            original.def[key] = nValue;
            wasModified = true;
        }
        // Deleted fields
        else if (nValue === undefined && oValue !== undefined) {
            original.def[key] = undefined;
            wasModified = true;
        }
        // Updated fields (deep compare for objects)
        else if (!deepEquals(oValue, nValue)) {
            original.def[key] = nValue;
            wasModified = true;
        }
    }

    const oChildrenCount = original.children?.length ?? 0;
    const nChildrenCount = newer.children?.length ?? 0;

    // Original has children
    if (oChildrenCount > 0) {
        // UPDATE: BOTH HAVE children
        if (nChildrenCount > 0) {
            const sharedCount = Math.min(oChildrenCount, nChildrenCount)

            // Merged shared children
            for (let i = 0; i < sharedCount; i++) {
                blockDefinitionMerger(article, original.children[i], newer.children[i], depth + 1)
            }

            // INSERT MISSING children
            if (nChildrenCount > oChildrenCount) {
                article.insertBlock(original, original.children[oChildrenCount - 1], 'after', newer.children.slice(sharedCount))
            }

            // DELETE extra children
            if (oChildrenCount > nChildrenCount) {
                const toDelete = original.children.slice(sharedCount);
                for (const child of toDelete) {
                    article.deleteBlock(child)
                }
            }

        }
        // DELETE all original children
        else {
            const toDelete = [...original.children];
            for (const child of toDelete) {
                article.deleteBlock(child)
            }
        }
    }
    // INSERT: Original DOes NOT have children but the node has children
    else if (nChildrenCount > 0) {
        article.insertBlock(original, null, 'after', newer.children)
    }

    if (wasModified) {
        article._updateBlock(original, original.def, oldDefSnapshot)
    }
}



export type EditTrigger = "hover" | "click";

export interface ArticleOptions {
    editTrigger: EditTrigger;
}

const defaultArticleOptions: ArticleOptions = {
    editTrigger: "click",
};

export class ArticleInstance implements ArticleBlock {
    // TODO: amek this a BlockBase too
    //
    // Change are appended to a changelist array
    // The change are saved to the browser cache
    // The changes are pushed to the server
    // browser cache is cleared on success
    //
    // We can reapply changelist in case of error or disconnect
    kind = "article"
    def: ArticleDef;
    children: Array<BlockBase>;
    listeners = new Set<() => void>();
    pendingChange: PendingAction[] = []
    article: ArticleInstance
    saveTimeoutRef: NodeJS.Timeout | null = null
    inputBlock: BlockBase
    options: ArticleOptions
    blockPickerCallback: ((entry: BlockTypeEntry) => void) | null = null

    openBlockPicker(onSelect: (entry: BlockTypeEntry) => void) {
        console.log("[Picker] opened");
        this.blockPickerCallback = onSelect;
        this.notify();
    }

    closeBlockPicker() {
        console.log("[Picker] closed");
        this.blockPickerCallback = null;
        this.notify();
    }

    // For connection loss and change batching
    // pendingChange: ActionBatch = loadUncomittedChange()

    // For undo support
    changeHistory: ActionBatch = { "actions": [] }

    notify() {
        for (const l of this.listeners) l();
    }
    constructor(article: ArticleDef, options?: Partial<ArticleOptions>) {
        this.options = { ...defaultArticleOptions, ...options }
        this.def = article
        this.children = this.def.blocks.map(child => newBlock(this, child, this))
        this.article = this
        this.inputBlock = newBlock(this, { kind: "input", data: { text: "" }, sequence: this.children.length }, this)

        // Extra block used for direct insertion
        //  This COULD be not correct because this block does not exist on the DB
        //  but as soon as something is written to it it should be inserted
        // this.children.push()

        // if pendingChange exist reapply them
    }

    public pushAction(pendingAction: PendingAction) {
        // The action is executed right away in the view
        console.log("DOING", pendingAction)
        pendingAction.doAction();

        // but batched for the server
        this.pendingChange.push(pendingAction)

        // Schedule auto-save after 2 seconds of inactivity
        this.scheduleAutoSave();
    }

    private scheduleAutoSave() {
        // Clear existing timeout
        if (this.saveTimeoutRef) {
            clearTimeout(this.saveTimeoutRef);
        }

        // Set new timeout to save after 2 seconds
        this.saveTimeoutRef = setTimeout(() => {
            this.persistServerChange().catch(error => {
                console.error('Auto-save failed:', error);
            });
            this.saveTimeoutRef = null;
        }, 2000);
    }

    public deleteBlock(blockTarget: BlockBase) {
        const parent = blockTarget.getParent() ?? this;
        const siblings = parent.children as BlockBase[];
        const siblingDefs = parent.getDefinitionChildren();

        const doAction = () => {
            const index = siblings.indexOf(blockTarget);
            if (index === -1) {
                console.warn("Block not found, cannot delete:", blockTarget);
                return;
            }
            siblings.splice(index, 1);

            if (siblingDefs) {
                const defIndex = siblingDefs.indexOf(blockTarget.def);
                if (defIndex !== -1) {
                    siblingDefs.splice(defIndex, 1);
                }
            }
            this.notify()
        }

        const undoAction = () => {
            const index = siblings.indexOf(blockTarget);
            if (index === -1) {
                siblings.push(blockTarget);
                if (siblingDefs) {
                    siblingDefs.push(blockTarget.def);
                }
            }
        }

        const remoteAction: ActionDeleteBlock = {
            op: "delete",
            index: siblings.indexOf(blockTarget),
            block_id: blockTarget.def.id
        }

        this.pushAction({
            action: remoteAction,
            doAction: doAction,
            undoAction: undoAction
        })
    }

    _updateBlock(blockTarget: BlockBase, newData: BlockDef, oldDefSnapshot?: BlockDef) {
        const oldDef = oldDefSnapshot ?? structuredClone(blockTarget.def);

        const doAction = () => {
            this.notify();
        }

        const undoAction = () => {
            blockTarget.def = oldDef
            blockTarget.children = blockTarget.def.children ? blockTarget.def.children.map(
                child => newBlock(blockTarget.article, child, blockTarget)) : [];
            this.notify();
        }

        const remoteAction: ActionUpdateBlock = {
            op: "update",
            id: blockTarget.def.id,
            block_def: newData,
        }

        this.pushAction({
            action: remoteAction,
            doAction: doAction,
            undoAction: undoAction
        })
    }


    updateBlock(blockTarget: BlockBase, newData: BlockDef) {
        // HERE we need to match current definition and the new definition
        // to output either update block action or insert block
        blockDefinitionMerger(this.article, blockTarget, newData)
    }

    reorderBlock(block: BlockBase, prev: BlockBase, next: BlockBase) {
        const previous = block.def.sequence
        const newsequence = (prev.def.sequence + next.def.sequence) / 2

        const previousParent = block.getParent()
        const previousIndex = previousParent.children.indexOf(block)

        // insert block between prev and next
        const doAction = () => {
            block.def.sequence = newsequence

            // Remove the item we want to move from its parent
            const item = previousParent.children.splice(previousIndex, 1)[0];

            // Insert the item we want to its new parent
            const newParent = prev.getParent()
            const ToIndex = newParent.children.indexOf(prev)
            newParent.children.splice(ToIndex + 1, 0, item);
        }

        // How to revert the action on the current view
        const undoAction = () => {
            // Remove the item from the new parent
            const newParent = prev.getParent()
            const fromIndex = newParent.children.indexOf(block)
            const item = newParent.children.splice(fromIndex, 1)[0];

            // Insert it pack to its old parent
            previousParent.children.splice(previousIndex, 0, item)
            block.def.sequence = previous
        }

        // How to make the server persist the action to the database
        const remoteAction: ActionReorderBlock = {
            op: "reorder",
            block_id: block.def.id,
            sequence: newsequence,
        }

        this.pushAction({
            action: remoteAction,
            doAction: doAction,
            undoAction: undoAction
        })
    }


    _fillMissingSequence(siblings: ArticleDef[]) {
        for (let i = 0; i < siblings.length; i++) {
            const child = siblings[i];
            if (typeof child.sequence !== "number") {
                // If no sequence, use current index + 1
                child.sequence = i + 1;
            }
        }

        let previous = -10000000;

        for (let i = 0; i < siblings.length; i++) {
            const child = siblings[i];
            console.log(child.sequence)

            if (child.sequence < previous) {
                console.log("BAD LOGIC")
            }
            previous = child.sequence
        }
    }


    getDefinitionChildren(): BlockDef[] {
        return this.def.blocks;
    }

    static _getSequenceStep(parent: ArticleBlock, target: BlockBase | null, direction: "after" | "before", newChildren: BlockDef[]) {
        //
        // returns a sequence of integer that will make the children rightly ordered
        //
        //  FIXME: The sequence number resets on nested sub-blocks so sub-blocks appear before their parents
        //  causing the tree rebuilding to run for more loops than necessary
        //  we need for force sub-blocks to always appear AFTER their parents, so their start sequence should be
        //  parent.sequence + 1. The end sequence does not matter as much
        //
        //
        //
        if (!Array.isArray(parent.def["children"])) {
            parent.def["children"] = [];
        }

        const siblings = parent.getDefinitionChildren();
        console.log("siblings", siblings)

        let start: number = 0;
        let end: number = newChildren.length;
        let insertIndex: number;

        if (siblings.length !== parent.children.length) {
            console.log("WARN children size mismatch — siblings (def):", siblings.length, "children (runtime):", parent.children.length, parent)
        }

        if (target === null) {
            start = -1
            end = newChildren.length
            insertIndex = 0
        }
        else if (target.kind === "input") {
            insertIndex = parent.def.children.length - 1
            start = parent.def.children[insertIndex].sequence
            end = start + newChildren.length + 1
        }
        else {
            let targetIndex = parent.children.indexOf(target);
            if (targetIndex === -1) {
                throw new Error("Target block not found in parent");
            }

            // Target exists in runtime children but def.children is empty or shorter.
            // Clamp targetIndex so we don't read past the end of siblings.
            const clampedIndex = Math.min(targetIndex, siblings.length - 1);

            if (direction === "after") {
                insertIndex = siblings.length === 0 ? 0 : clampedIndex + 1;

                if (siblings.length === 0 || clampedIndex + 1 >= siblings.length) {
                    start = target.def.sequence ?? targetIndex;
                    end = start + newChildren.length + 1;
                }
                else {
                    start = target.def.sequence;
                    end = siblings[clampedIndex + 1].sequence;
                }
            } else {
                insertIndex = siblings.length === 0 ? 0 : clampedIndex;

                if (siblings.length === 0 || clampedIndex <= 0) {
                    end = target.def.sequence ?? targetIndex;
                    start = end - (newChildren.length + 1);
                } else {
                    start = siblings[clampedIndex - 1].sequence;
                    end = target.def.sequence;
                }
            }
        }

        if (start === end) {
            console.log("Logic Error")
            if (direction === "after") {
                end = start + 0.1
            }
            if (direction === "before") {
                end = start - 0.1
            }
        }

        return [insertIndex, start, end]
    }


    static fixSequenceRecursively(obj: BlockDef) {
        if (obj.children) {
            for (let i = 0; i < obj.children.length; i++) {
                if (obj.children[i] !== undefined) {
                    obj.children[i].sequence = obj.sequence + i + 1
                    ArticleInstance.fixSequenceRecursively(obj.children[i]);
                }
            }
        }
    }

    //
    // Set sequence ID so the order is correct when the article is fetched back
    // It return an array operation (function) to be applied to the children array of the parent
    // to insert the new chilren in the right place
    //
    //  1. Sequence is set so database has the right order
    //  2. New block are inserted into the parent in the right order
    //  3. Update batch is sent to server
    //  4. Server replies with new id for the inserted blocks
    //
    getBlockInserter(parent: ArticleBlock, target: BlockBase | null, direction: "after" | "before", newChildren: BlockDef[]) {

        const [insertIndex, start, end] = ArticleInstance._getSequenceStep(parent, target, direction, newChildren)

        console.log("Sequence STEP", insertIndex, start, end)

        const step = (end - start) / (newChildren.length + 1)

        for (let i = 0; i < newChildren.length; i++) {
            newChildren[i].sequence = start + (i + 1) * step
            ArticleInstance.fixSequenceRecursively(newChildren[i])
        }

        const insert = () => {
            parent.getDefinitionChildren().splice(insertIndex, 0, ...newChildren);
        }

        const fetch = (array: ArticleBlock[]) => {
            const blocksSlice = array.slice(insertIndex, insertIndex + newChildren.length);
            return blocksSlice;
        };

        const remove = (array: ArticleBlock[]) => {
            const blocksSlice = array.splice(insertIndex, newChildren.length);
            return blocksSlice;
        };

        return [insert, fetch, remove]
    }

    insertBlock(parent: ArticleBlock, target: BlockBase | null, direction: "after" | "before", newChildren: BlockDef[]) {
        if (newChildren === undefined || newChildren.length <= 0) {
            return
        }

        const oldDef = parent.def
        let futureAction: PendingAction = {
            action: undefined,
            doAction: undefined,
            undoAction: undefined,
            blocks: []
        }

        console.log("BEFORE", newChildren)
        let [insertFn, fetchFn, removeFn] = this.getBlockInserter(parent, target, direction, newChildren)
        console.log("AFTER", newChildren)

        // How to execute the action on the current view
        const doAction = () => {
            // Fix the sequence so the blocks are in the right order
            // and insert the new children to the definition
            const oldCount = parent.children.length
            const oldCountDef = parent.def["children"]
            insertFn()

            const newCount = parent.children.length
            const newCountDef = parent.def["children"]

            console.log(newChildren)
            console.log(oldCount, newCount)
            console.log(oldCountDef, newCountDef)

            parent.children = parent.getDefinitionChildren().map(child => newBlock(this, child, parent))
            console.log(parent.children.length)
            console.log(parent)

            // Fetch the inserted blocks so we can populate the ID frm the database
            // const startCount = insertIndex + 1
            futureAction.blocks = fetchFn(parent.children)
            // console.log(futureAction.blocks)
            // console.log(startCount, startCount + newChildren.length)
            // console.log(parent.children.length)
            parent.notify()
        }

        // How to revert the action on the current view
        const undoAction = () => {
            parent.def = oldDef
            removeFn(parent.children);
            parent.notify()
        }

        function getParentId() {
            // If parent is an ArticleInstance, return null
            if (parent instanceof ArticleInstance) {
                return null
            }

            // Otherwise return its id
            return parent?.def?.id ?? null
        }

        // How to make the server persist the action to the database
        const remoteAction: ActionInsertBlock = {
            op: "insert",
            page_id: this.def.id,
            parent: getParentId(),
            children: newChildren
        }

        futureAction.action = remoteAction
        futureAction.doAction = doAction
        futureAction.undoAction = undoAction

        console.log("Action was generated")
        this.pushAction(futureAction)
    }

    getArticlePath(): string {
        const current = this.def;
        const top = current.top_level_article;

        if (!top || top.id === current.id) {
            return current.title;
        }

        const path = this._findPathInTree(current.children || [], current.id, [top.title]);
        return path ? path.join('/') : `${top.title}/${current.title}`;
    }

    private _findPathInTree(children: ArticleDef[], targetId: number, currentPath: string[]): string[] | null {
        for (const child of children) {
            if (child.id === targetId) {
                return [...currentPath, child.title];
            }
            if (child.children && child.children.length > 0) {
                const result = this._findPathInTree(child.children as ArticleDef[], targetId, [...currentPath, child.title]);
                if (result) return result;
            }
        }
        return null;
    }

    getParentId() {
        return null;
    }
    getParent(): null | ArticleBlock {
        return null;
    }

    getChildren(): ArticleBlock[] {
        return this.children
    }

    saveUncomittedChange() {
        // savePendingChange(this.pendingChange)
    }

    public fetchReferenceByID(blockID: string | number): BlockBase {
        for (const block of this.children) {
            if (block.def.id === blockID) {
                return block;
            }
        }
        throw new Error(`Block with id ${blockID} not found`);
    }

    updateTitle(newTitle: string) {
        const oldTitle = this.def.title;

        const doAction = () => { this.def.title = newTitle; this.notify(); }
        const undoAction = () => { this.def.title = oldTitle; this.notify(); }

        this.pushAction({
            action: { op: "update_article", title: newTitle } as ActionUpdateArticle,
            doAction,
            undoAction,
        })
    }

    updatePublic(value: boolean) {
        const oldValue = this.def.public;

        const doAction = () => { this.def.public = value; this.notify(); }
        const undoAction = () => { this.def.public = oldValue; this.notify(); }

        this.pushAction({
            action: { op: "update_article", public: value } as ActionUpdateArticle,
            doAction,
            undoAction,
        })
    }

    updateArticleKind(kind: string) {
        const oldKind = this.def.article_kind;

        const doAction = () => { this.def.article_kind = kind; this.notify(); }
        const undoAction = () => { this.def.article_kind = oldKind; this.notify(); }

        this.pushAction({
            action: { op: "update_article", article_kind: kind } as ActionUpdateArticle,
            doAction,
            undoAction,
        })
    }

    async persistServerChange() {
        if (this.pendingChange.length === 0) {
            return;
        }

        try {
            // Extract actions from pending changes
            const queuedChange = [...this.pendingChange];
            this.pendingChange = [];

            // Filter out article updates from block updates
            const blockActions = queuedChange.filter(p => p.action.op !== "update_article").map(pending => pending.action);
            const articleActions = queuedChange.filter(p => p.action.op === "update_article").map(pending => pending.action as ActionUpdateArticle);

            const promises = [];

            if (blockActions.length > 0) {
                // Make request to the server for blocks
                promises.push(recipeAPI.updateBlocksBatch(blockActions)
                    .then(updateResult => {
                        // Filter queuedChange to only include block actions for reconciliation
                        const blockQueuedChange = queuedChange.filter(p => p.action.op !== "update_article");
                        blockUpdateReconciliation(this, blockQueuedChange, updateResult);
                    }));
            }

            if (articleActions.length > 0) {
                const merged: Partial<ActionUpdateArticle> = {};
                for (const action of articleActions) {
                    if (action.title !== undefined) merged.title = action.title;
                    if (action.public !== undefined) merged.public = action.public;
                    if (action.article_kind !== undefined) merged.article_kind = action.article_kind;
                }
                promises.push(recipeAPI.updateArticle(this.def.id, merged));
            }

            await Promise.all(promises);

            // On success, clear the pending changes
            // this.changeHistory["actions"].push(...this.pendingChange);
            this.saveUncomittedChange();
        } catch (error) {
            console.error('Failed to persist changes:', error);
            // On error, keep pending changes for retry
            // FIXME: This logic is slightly flawed if partial success, but good enough for now
            throw error;
        }
    }

    react() {
        return ArticleView({ article: this })
    }
}


interface ArticleProps {
    article: ArticleDef
    options?: Partial<ArticleOptions>
}


import { VegaProvider } from '../../contexts/VegaContext';

const ARTICLE_KINDS = ["", "blog", "tutorial", "project-log", "note", "recipe"];

const TitleDisplay: React.FC<{ article: ArticleInstance }> = ({ article }) => {
    if (isStaticMode()) {
        return <Heading mb={4}>{article.def.title}</Heading>;
    }

    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [text, setText] = useState(article.def.title);
    const [isPublic, setIsPublic] = useState(article.def.public ?? false);
    const [kind, setKind] = useState(article.def.article_kind ?? "");
    const [gearOpen, setGearOpen] = useState(false);
    const [gearPos, setGearPos] = useState<{ x: number; y: number } | null>(null);
    const gearRef = useRef<HTMLButtonElement | null>(null);

    const editTrigger = article.options?.editTrigger ?? "click";
    const editing = editTrigger === "hover"
        ? hovered || focused
        : focused;

    const hoverBg = useColorModeValue("blackAlpha.50", "whiteAlpha.50");
    const showHoverHint = hovered && !editing;
    const panelBg = useColorModeValue("white", "gray.800");
    const panelBorder = useColorModeValue("gray.200", "gray.600");

    useEffect(() => {
        setText(article.def.title);
    }, [article.def.title]);

    useEffect(() => {
        document.title = article.def.title || "Untitled";
    }, [article.def.title]);

    useEffect(() => {
        setIsPublic(article.def.public ?? false);
    }, [article.def.public]);

    useEffect(() => {
        setKind(article.def.article_kind ?? "");
    }, [article.def.article_kind]);

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
        article.updateTitle(e.target.value);
    };

    const handleGearClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (gearRef.current) {
            const rect = gearRef.current.getBoundingClientRect();
            setGearPos({ x: rect.left, y: rect.bottom + 4 });
        }
        setGearOpen(v => !v);
    };

    const handlePublicToggle = () => {
        const value = !isPublic;
        setIsPublic(value);
        article.updatePublic(value);
    };

    const handleKindChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setKind(value);
        article.updateArticleKind(value);
    };

    return (
        <Box mb={4}>
            <Flex
                align="center"
                gap={2}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={(e) => { e.stopPropagation(); setFocused(true); }}
                onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setFocused(false);
                    }
                }}
                tabIndex={0}
                cursor={!editing && editTrigger === "click" ? "pointer" : undefined}
                bg={showHoverHint ? hoverBg : undefined}
                borderRadius={showHoverHint ? "md" : undefined}
                outline={focused ? "2px solid" : "none"}
                outlineColor="blue.500"
                transition="background 0.15s ease"
            >
                {editing ? (
                    <Input
                        value={text}
                        onChange={onChange}
                        autoFocus
                        size="lg"
                        fontWeight="bold"
                        fontSize="3xl"
                        flex="1"
                    />
                ) : (
                    <Heading flex="1">{article.def.title}</Heading>
                )}

                <Badge
                    colorScheme={isPublic ? "green" : "gray"}
                    variant="subtle"
                    fontSize="xs"
                    flexShrink={0}
                >
                    {isPublic ? "published" : "draft"}
                </Badge>

                <IconButton
                    ref={gearRef}
                    aria-label="Article settings"
                    size="sm"
                    variant="ghost"
                    onClick={handleGearClick}
                    flexShrink={0}
                >
                    <Settings size={16} />
                </IconButton>
            </Flex>

            {gearOpen && gearPos && (
                <Portal>
                    <Box
                        position="fixed"
                        inset="0"
                        onClick={() => setGearOpen(false)}
                        zIndex={100}
                    />
                    <Box
                        position="fixed"
                        top={`${gearPos.y}px`}
                        left={`${gearPos.x}px`}
                        bg={panelBg}
                        border="1px solid"
                        borderColor={panelBorder}
                        borderRadius="md"
                        boxShadow="md"
                        p={4}
                        width="220px"
                        zIndex={101}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Text fontWeight="semibold" fontSize="sm" mb={3}>Article settings</Text>

                        <Flex align="center" justify="space-between" mb={3}>
                            <Text fontSize="sm">Visibility</Text>
                            <Button
                                size="xs"
                                colorScheme={isPublic ? "green" : "gray"}
                                variant={isPublic ? "solid" : "outline"}
                                onClick={handlePublicToggle}
                            >
                                {isPublic ? "Published" : "Draft"}
                            </Button>
                        </Flex>

                        <Box>
                            <Text fontSize="sm" mb={1}>Kind</Text>
                            <select
                                value={kind}
                                onChange={handleKindChange}
                                style={{ width: "100%", fontSize: "0.875rem", padding: "4px 6px", borderRadius: "4px", border: "1px solid #CBD5E0" }}
                            >
                                {ARTICLE_KINDS.map(k => (
                                    <option key={k} value={k}>{k || "— none —"}</option>
                                ))}
                            </select>
                        </Box>
                    </Box>
                </Portal>
            )}
        </Box>
    );
}

const Article: React.FC<ArticleProps> = ({ article, options }) => {
    const instanceRef = useRef<ArticleInstance | null>(null);

    if (!instanceRef.current) {
        instanceRef.current = new ArticleInstance(article, options);
    }

    return (
        <VegaProvider>
            <ArticleView article={instanceRef.current} />
        </VegaProvider>
    );
}

export default Article;


function renderSortedBySequence(items: BlockBase[]): any {
    return items
        //   .sort((a, b) => {
        //     const seqA = a.getSequence();
        //     const seqB = b.getSequence();

        //     // Compare numbers if both are numbers
        //     if (typeof seqA === 'number' && typeof seqB === 'number') {
        //       return seqA - seqB;
        //     }

        //     // Otherwise, compare as strings
        //     return String(seqA).localeCompare(String(seqB));
        //   })
        .map(item => item.react());
}



const ArticleView: React.FC<{ article: ArticleInstance }> = ({ article }) => {
    const [, setTick] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState("Text");

    useEffect(() => {
        const rerender = () => {
            console.log("Re render", article.children)
            setTick(t => t + 1);
        }
        article.listeners.add(rerender);
        return () => {
            article.listeners.delete(rerender);
            if (article.saveTimeoutRef) {
                clearTimeout(article.saveTimeoutRef);
                article.saveTimeoutRef = null;
            }
        };
    }, [article]);

    return (
        <Flex gap={6} align="start" overflowX="auto" width="100%">
            <Box flex="1" minW="0">
                <TitleDisplay article={article} />
                <InsertBlockGap article={article} after={null} />
                {article.children.map((block) => (
                    <React.Fragment key={block.key}>
                        <Box mb="12px">
                            {block.react()}
                        </Box>
                        <InsertBlockGap article={article} after={block} />
                    </React.Fragment>
                ))}
                {article.inputBlock.react()}
            </Box>

            <Box width="300px" flexShrink={0} pl={4} borderLeft="1px solid" borderColor="gray.100">
                <SubPageList articleDef={article.def} />
            </Box>

            <BlockPickerDialog
                open={!!article.blockPickerCallback}
                onOpenChange={(open) => { if (!open) article.closeBlockPicker(); }}
                onSelect={(entry) => {
                    console.log("[Picker] selected:", entry.kind, entry);
                    const cb = article.blockPickerCallback;
                    article.closeBlockPicker();
                    cb?.(entry);
                }}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
            />
        </Flex>
    );
};
