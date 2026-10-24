import { describe, expect, it } from 'vitest';
import {
  calculateContrastRatioAgainstWhite,
  calculateRelativeLuminance,
  sRgbChannelToLinear,
  validateWcagAaContrast,
} from '../src/branding';
import { AppError } from '../src/http';

describe('W3C WCAG 2.1 AA Contrast Algorithm', () => {
  it('correctly linearizes sRGB channels using IEC 61966-2-1 piecewise formula', () => {
    expect(sRgbChannelToLinear(0)).toBe(0);
    expect(sRgbChannelToLinear(255)).toBe(1);

    // Linear section (c <= 0.04045, where c = channel8 / 255)
    // 0.03 * 255 = 7.65
    expect(sRgbChannelToLinear(7.65)).toBeCloseTo(0.03 / 12.92, 5);

    // Exponential section (c > 0.04045)
    // 0.5 * 255 = 127.5
    expect(sRgbChannelToLinear(127.5)).toBeCloseTo(Math.pow((0.5 + 0.055) / 1.055, 2.4), 5);
  });

  it('computes relative luminance according to WCAG 2.1 definition', () => {
    // Pure black has luminance 0
    expect(calculateRelativeLuminance('#000000')).toBe(0);
    expect(calculateRelativeLuminance('#000')).toBe(0);

    // Pure white has luminance 1
    expect(calculateRelativeLuminance('#ffffff')).toBeCloseTo(1, 4);
    expect(calculateRelativeLuminance('#fff')).toBeCloseTo(1, 4);

    // Primary brand color (#102A43)
    const brandLuminance = calculateRelativeLuminance('#102A43');
    expect(brandLuminance).toBeGreaterThan(0);
    expect(brandLuminance).toBeLessThan(0.1);
  });

  it('computes contrast ratio against white (#FFFFFF)', () => {
    // Black against white: maximum contrast 21:1
    const blackRatio = calculateContrastRatioAgainstWhite('#000000');
    expect(blackRatio).toBeCloseTo(21.0, 1);

    // White against white: minimum contrast 1:1
    const whiteRatio = calculateContrastRatioAgainstWhite('#FFFFFF');
    expect(whiteRatio).toBeCloseTo(1.0, 1);

    // Official ITB Brand colors against white:
    // Navy #102A43 should have ratio > 10.0:1
    const navyRatio = calculateContrastRatioAgainstWhite('#102A43');
    expect(navyRatio).toBeGreaterThan(10.0);

    // Royal Blue #0055A5 should have ratio > 5.0:1
    const blueRatio = calculateContrastRatioAgainstWhite('#0055A5');
    expect(blueRatio).toBeGreaterThan(5.0);
  });

  it('validates WCAG 2.1 AA thresholds (3.0:1 for UI elements and 4.5:1 for text)', () => {
    // Valid colors pass without exception
    expect(() => validateWcagAaContrast('#102A43')).not.toThrow();
    expect(() => validateWcagAaContrast('#0055A5')).not.toThrow();
    expect(() => validateWcagAaContrast('#1E3A8A')).not.toThrow();

    // Invalid colors with low contrast fail
    expect(() => validateWcagAaContrast('#FFFFFF')).toThrowError(AppError);
    expect(() => validateWcagAaContrast('#F3F4F6')).toThrowError(AppError);
    expect(() => validateWcagAaContrast('#FEFEFE')).toThrowError(AppError);

    try {
      validateWcagAaContrast('#FFFFFF');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.status).toBe(400);
      expect(appErr.code).toBe('CONTRAST_ERROR');
      expect((appErr.details as any).contrastRatio).toBeDefined();
      expect((appErr.details as any).requiredMinimum).toBe(3.0);
    }
  });
});
