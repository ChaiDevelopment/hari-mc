import { normalizeIndonesianPhone } from './phone';

describe('normalizeIndonesianPhone', () => {
  it.each([
    ['081234567890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['+6281234567890', '+6281234567890'],
    ['0812 3456 7890', '+6281234567890'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeIndonesianPhone(input)).toBe(expected);
  });
});
