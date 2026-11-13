import { describe, expect, it } from 'vitest';
import { DEFAULT_NUM_RUNS, assertProperty, fc } from './fast-check';

describe('test tooling smoke', () => {
  it('provides fake IndexedDB', () => {
    expect(typeof indexedDB.open).toBe('function');
  });

  it('has jsdom document', () => {
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
  });

  it('runs fast-check with the default run count', () => {
    let runs = 0;
    // Feature: awaaz-kit, Property 0: tooling smoke (not a Correctness Property)
    assertProperty(
      fc.property(fc.integer(), (n) => {
        runs++;
        return n + 0 === n;
      }),
    );
    expect(runs).toBe(DEFAULT_NUM_RUNS);
  });
});
