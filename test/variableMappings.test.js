const test = require('node:test');
const assert = require('node:assert/strict');
const { applyConversionFormula, normalizeInternalField } = require('../src/utils/variableMappings.js');

test('applies supported conversion formulas without evaluating code', () => {
    assert.equal(applyConversionFormula(1000, 'x / 1000'), 1);
    assert.equal(applyConversionFormula(20, 'x * 9 / 5 + 32'), 68);
    assert.equal(applyConversionFormula(273.15, 'x - 273.15'), 0);
    assert.equal(applyConversionFormula(1, 'x + 2 * 3'), 7);
});

test('rejects executable or unsupported formulas', () => {
    assert.throws(() => applyConversionFormula(1, 'process.exit()'), /Unsupported conversion formula/);
    assert.throws(() => applyConversionFormula(1, 'x / 0'), /divide by zero/);
});

test('accepts database and application field naming conventions', () => {
    assert.equal(normalizeInternalField('air_temperature'), 'airTemperature');
    assert.equal(normalizeInternalField('airTemperature'), 'airTemperature');
});
