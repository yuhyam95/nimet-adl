const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeCollection } = require('../src/services/tahmo.js');

test('TAHMO defaults provider option objects to the raw collection', () => {
    assert.equal(normalizeCollection({ timezone: 'Africa/Lagos' }), 'raw');
});

test('TAHMO preserves an explicitly selected collection', () => {
    assert.equal(normalizeCollection('hourly'), 'hourly');
});

test('TAHMO defaults blank collection names to raw', () => {
    assert.equal(normalizeCollection('  '), 'raw');
});
