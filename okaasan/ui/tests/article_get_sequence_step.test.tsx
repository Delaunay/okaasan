import { describe, it, expect, vi } from 'vitest';
import { ArticleInstance } from '../src/components/article/article';
import { ArticleBlock, BlockBase, BlockDef } from '../src/components/article/base';

// Mock dependencies
// We need a minimal implementation of ArticleBlock and BlockBase
// ArticleInstance._getSequenceStep mainly interacts with parent.def.children and target.def.sequence

describe('ArticleInstance._getSequenceStep', () => {

    // Helper to create a mock parent
    const createMockParent = (childrenDefs: any[] = [], childrenInstances: any[] = []): ArticleBlock => {
        return {
            def: {
                children: childrenDefs,
                // Other required properties mock
                id: 'parent-id',
                type: 'group',
                blocks: []
            },
            children: childrenInstances,
            getDefinitionChildren: () => childrenDefs,
            // Mock other required methods/props if necessary for the test context (though _getSequenceStep is static and focused)
            kind: 'group',
            listeners: new Set(),
            notify: vi.fn(),
            // ... partial mock casting
        } as unknown as ArticleBlock;
    };

    // Helper to create a mock target
    const createMockTarget = (sequence: number, id: string = 'target-id'): BlockBase => {
        return {
            def: {
                sequence: sequence,
                id: id,
                kind: 'text'
            },
            kind: 'text',
            // ... partial mock casting
        } as unknown as BlockBase;
    }

    const createMockInput = (): BlockBase => {
        return {
            kind: 'input',
            def: { kind: 'input' }
        } as unknown as BlockBase;
    }


    it('Scenario 1: Insert into empty parent (No target)', () => {
        const parent = createMockParent([], []);
        const newChildren: BlockDef[] = [{ kind: 'text' } as BlockDef]; // 1 new child

        const [insertIndex, start, end] = ArticleInstance._getSequenceStep(parent, null, 'after', newChildren);

        expect(insertIndex).toBe(0);
        expect(start).toBe(-1);
        // default end is newChildren.length
        expect(end).toBe(1);
    });

    it('Scenario 2: Insert into parent with existing children (No target) - Should go to start?', () => {
        // Looking at code: if target === null -> start = -1, end = newChildren.length, insertIndex = 0
        // It seems target === null implies insertion at the beginning?
        // Let's verify behavior. The code says:
        // if (target === null) { start = -1; end = newChildren.length; insertIndex = 0 }

        const existingChild = { sequence: 10 };
        const parent = createMockParent([existingChild], [{}]); // simplified
        const newChildren: BlockDef[] = [{ kind: 'text' } as BlockDef];

        const [insertIndex, start, end] = ArticleInstance._getSequenceStep(parent, null, 'after', newChildren);

        expect(insertIndex).toBe(0);
        expect(start).toBe(-1);
        expect(end).toBe(1);
    });

    it('Scenario 3: Insert after Input Block (Append to end)', () => {
        // if (target.kind === "input")
        const existingChildDef = { sequence: 100 };
        const parent = createMockParent([existingChildDef], [{}]);
        const target = createMockInput();
        const newChildren: BlockDef[] = [
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef
        ];

        const [insertIndex, start, end] = ArticleInstance._getSequenceStep(parent, target, 'after', newChildren);

        // Code: insertIndex = parent.def.children.length - 1  <-- Wait, input block implies append?
        // The code:
        // insertIndex = parent.def.children.length - 1
        // start = parent.def.children[insertIndex].sequence
        // end = start + newChildren.length

        // If parent has 1 child, length is 1. insertIndex = 0.
        // start = sequence of child 0 (100).
        // end = 100 + 1 = 101.

        expect(insertIndex).toBe(0); // This seems to assume input block is NOT in the definition list, but we are appending after the last real block?
        // Actually, if input block is passed, it usually means "add to the end" in some contexts,
        // but let's see how ArticleInstance uses it.
        // It uses `parent.def.children[insertIndex]`

        expect(start).toBe(100);
        expect(end).toBe(105);

        const step = (end - start) / (newChildren.length + 1)
        expect(start + step * 1).toBe(101)
        expect(start + step * 2).toBe(102)
        expect(start + step * 3).toBe(103)
        expect(start + step * 4).toBe(104)
    });

    it('Scenario 4: Insert After Target (Middle)', () => {
        // [A (seq 10), B (seq 20)]
        // Insert after A.

        const childA = { sequence: 10 };
        const childB = { sequence: 20 };
        const parentDef = [childA, childB];

        const targetA = createMockTarget(10, 'A');
        const targetB = createMockTarget(20, 'B');
        const parentInstanceChildren = [targetA, targetB];

        const parent = createMockParent(parentDef, parentInstanceChildren);

        const newChildren: BlockDef[] = [
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef
        ];

        // Target A, direction 'after'
        const [insertIndex, start, end] = ArticleInstance._getSequenceStep(parent, targetA, 'after', newChildren);

        // targetIndex = 0.
        // insertIndex = 0 + 1 = 1.
        // targetIndex + 1 (1) !== length (2).
        // start = target.def.sequence = 10.
        // end = siblings[targetIndex + 1].sequence = 20.

        expect(insertIndex).toBe(1);
        expect(start).toBe(10);
        expect(end).toBe(20);

        const step = (end - start) / (newChildren.length + 1)
        expect(start + step * 1).toBe(12)
        expect(start + step * 2).toBe(14)
        expect(start + step * 3).toBe(16)
        expect(start + step * 4).toBe(18)
    });

    it('Scenario 5: Insert After Target (Last)', () => {
        // [A (seq 10)]
        // Insert after A.

        const childA = { sequence: 10 };
        const parentDef = [childA];

        const targetA = createMockTarget(10, 'A');
        const parentInstanceChildren = [targetA];

        const parent = createMockParent(parentDef, parentInstanceChildren);

        const newChildren: BlockDef[] = [
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef
        ];

        const [insertIndex, start, end] = ArticleInstance._getSequenceStep(parent, targetA, 'after', newChildren);

        // targetIndex = 0.
        // insertIndex = 1.
        // targetIndex + 1 (1) === length (1).
        // start = 10.
        // end = start + newChildren.length + 1 = 10 + 1 + 1 = 12.

        expect(insertIndex).toBe(1);
        expect(start).toBe(10);
        expect(end).toBe(15);

        const step = (end - start) / (newChildren.length + 1)
        expect(start + step * 1).toBe(11)
        expect(start + step * 2).toBe(12)
        expect(start + step * 3).toBe(13)
        expect(start + step * 4).toBe(14)
    });

    it('Scenario 6: Insert Before Target (First)', () => {
        // [A (seq 10)]
        // Insert before A.

        const childA = { sequence: 10 };
        const parentDef = [childA];
        const targetA = createMockTarget(10, 'A');
        const parentInstanceChildren = [targetA];
        const parent = createMockParent(parentDef, parentInstanceChildren);

        const newChildren: BlockDef[] = [
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef
        ];
        const [insertIndex, start, end] = ArticleInstance._getSequenceStep(parent, targetA, 'before', newChildren);

        // targetIndex = 0.
        // insertIndex = 0.
        // targetIndex === 0.
        // end = target.def.sequence = 10.
        // start = end - (newChildren.length + 1) = 10 - 5 = 5.

        expect(insertIndex).toBe(0);
        expect(end).toBe(10);
        expect(start).toBe(5);

        const step = (end - start) / (newChildren.length + 1)
        expect(start + step * 1).toBe(6)
        expect(start + step * 2).toBe(7)
        expect(start + step * 3).toBe(8)
        expect(start + step * 4).toBe(9)
    });

    it('Scenario 7: Insert Before Target (Middle)', () => {
        // [A (seq 10), B (seq 20)]
        // Insert before B.

        const childA = { sequence: 10 };
        const childB = { sequence: 20 };
        const parentDef = [childA, childB];
        const targetA = createMockTarget(10, 'A');
        const targetB = createMockTarget(20, 'B');
        const parentInstanceChildren = [targetA, targetB];
        const parent = createMockParent(parentDef, parentInstanceChildren);

        const newChildren: BlockDef[] = [
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef, 
            { kind: 'text' } as BlockDef
        ];

        const [insertIndex, start, end] = ArticleInstance._getSequenceStep(parent, targetB, 'before', newChildren);

        // targetIndex = 1.
        // insertIndex = 1.
        //Else
        // start = siblings[targetIndex - 1].sequence = 10.
        // end = target.def.sequence = 20.

        expect(insertIndex).toBe(1);
        expect(start).toBe(10);
        expect(end).toBe(20);

        const step = (end - start) / (newChildren.length + 1)
        expect(start + step * 1).toBe(12)
        expect(start + step * 2).toBe(14)
        expect(start + step * 3).toBe(16)
        expect(start + step * 4).toBe(18)
    });

    it('Scenario 8: Target not found', () => {
        const parent = createMockParent([], []);
        const target = createMockTarget(10, 'missing');
        const newChildren: BlockDef[] = [];

        expect(() => {
            ArticleInstance._getSequenceStep(parent, target, 'after', newChildren);
        }).toThrow('Target block not found in parent');
    });

    it('Scenario 9: Logic Error (Start == End)', () => {
        // Simulating a case where start and end might collide due to bad sequence data
        // [A (seq 10), B (seq 10)] -> invalid state ideally, but possible

        const childA = { sequence: 10 };
        const childB = { sequence: 10 };
        const parentDef = [childA, childB];
        const targetA = createMockTarget(10, 'A');
        const targetB = createMockTarget(10, 'B');
        const parentInstanceChildren = [targetA, targetB];
        const parent = createMockParent(parentDef, parentInstanceChildren);

        const newChildren: BlockDef[] = []; // empty to make math tight? No, let's use 1 child
        // If we insert between A and B
        // start = 10, end = 10.

        // Mock console.log to avoid noise
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

        const [insertIndex, start, end] = ArticleInstance._getSequenceStep(parent, targetA, 'after', [{ kind: 'text' } as any]);

        expect(consoleSpy).toHaveBeenCalledWith('Logic Error');
        // after: end = start + 0.1
        expect(start).toBe(10);
        expect(end).toBeCloseTo(10.1);

        consoleSpy.mockRestore();
    });

});
