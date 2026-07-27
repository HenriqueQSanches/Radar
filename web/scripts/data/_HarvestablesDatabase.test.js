import { describe, test, expect, beforeEach } from 'vitest';
import { HarvestablesDatabase } from './HarvestablesDatabase.js';

describe('HarvestablesDatabase.getResourceTypeFromTypeNumber', () => {
    let db;

    beforeEach(() => {
        db = new HarvestablesDatabase();
    });

    // Real capture: a T5.1 Cedar wood node (confirmed against the in-game tooltip)
    // arrived with wire type 6, which the old range (ROCK 6-10) misclassified as Rock.
    test('classifies type 6 as WOOD, not ROCK', () => {
        expect(db.getResourceTypeFromTypeNumber(6)).toBe('WOOD');
    });

    test('still classifies the confirmed real-world anchors correctly', () => {
        expect(db.getResourceTypeFromTypeNumber(0)).toBe('WOOD');
        expect(db.getResourceTypeFromTypeNumber(7)).toBe('ROCK');
        expect(db.getResourceTypeFromTypeNumber(13)).toBe('FIBER');
        expect(db.getResourceTypeFromTypeNumber(27)).toBe('ORE');
    });

    test('rejects out-of-range type numbers', () => {
        expect(db.getResourceTypeFromTypeNumber(28)).toBeNull();
        expect(db.getResourceTypeFromTypeNumber(-1)).toBeNull();
    });
});
