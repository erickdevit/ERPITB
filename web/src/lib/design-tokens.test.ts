/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeHexColor,
  getRelativeLuminance,
  getContrastWithWhite,
  applyBrandDesignTokens,
} from './design-tokens';

describe('Design Tokens & Brand Accent System', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.title = 'ERPITB';
  });

  it('normalizes 3-digit hex strings into 6-digit standard hex', () => {
    expect(normalizeHexColor('#028')).toBe('#002288');
    expect(normalizeHexColor('#fff')).toBe('#ffffff');
    expect(normalizeHexColor('#0284c7')).toBe('#0284c7');
  });

  it('calculates relative luminance and contrast ratio against white correctly', () => {
    // Pure black (#000000) has luminance ~0 and max contrast ~21:1
    expect(getContrastWithWhite('#000000')).toBeGreaterThan(15);
    // Pure white (#ffffff) has luminance 1 and contrast 1:1
    expect(getContrastWithWhite('#ffffff')).toBe(1);
    // Dark blue (#0284c7) has adequate contrast
    expect(getContrastWithWhite('#0284c7')).toBeGreaterThan(3);
  });

  it('applies brand design tokens to document root dynamically', () => {
    applyBrandDesignTokens('#1e293b', 'Instituto Transforma Brasil');

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--brand-accent')).toBe('#1e293b');
    expect(root.style.getPropertyValue('--brand-accent-text')).toBe('#FFFFFF');
    expect(root.style.getPropertyValue('--brand-accent-subtle')).toContain('#1e293b');
    expect(document.title).toBe('Instituto Transforma Brasil');
  });

  it('handles light colors by switching text to dark for high contrast readability', () => {
    applyBrandDesignTokens('#fef08a', 'ERP Amarelo'); // Light yellow

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--brand-accent')).toBe('#fef08a');
    expect(root.style.getPropertyValue('--brand-accent-text')).toBe('#0F172A'); // Dark text
  });

  it('accepts 3-digit hex and applies it to root properly', () => {
    applyBrandDesignTokens('#039');

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--brand-accent')).toBe('#003399');
  });

  it('safely ignores invalid hex colors without corrupting root styles', () => {
    applyBrandDesignTokens('invalid-color');
    expect(document.documentElement.style.getPropertyValue('--brand-accent')).toBe('');
  });
});
