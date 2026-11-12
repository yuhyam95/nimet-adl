const test = require('node:test');
const assert = require('node:assert/strict');

const { buildIncrementalStart, mapWithConcurrency } = require('../src/index.js').__test;

test('incremental sync starts one overlap window before the latest reading', () => {
    assert.equal(
        buildIncrementalStart('2026-11-09', '2026-11-11T12:00:00Z', null, 60),
        '2026-11-11T11:00:00.000Z'
    );
});

test('incremental sync does not go before the requested fallback range', () => {
    assert.equal(
        buildIncrementalStart('2026-11-09', '2026-10-26T13:20:00Z', null, 60),
        '2026-11-09T00:00:00.000Z'
    );
});

test('incremental sync respects a station collection start date', () => {
    assert.equal(
        buildIncrementalStart('2026-11-09', null, '2026-11-10T06:00:00Z', 60),
        '2026-11-10T06:00:00.000Z'
    );
});

test('station workers obey the configured concurrency limit', async () => {
    let active = 0;
    let maximumActive = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active -= 1;
    });
    assert.equal(maximumActive, 2);
});
