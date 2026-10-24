export function getRelativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return 0.5;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const [lr, lg, lb] = [r, g, b].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

export function getContrastWithWhite(hex: string): number {
  const l = getRelativeLuminance(hex);
  return Math.round(((1.0 + 0.05) / (l + 0.05)) * 100) / 100;
}

export function applyBrandDesignTokens(hexColor: string, appName?: string): void {
  if (!/^#[0-9a-fA-F]{6}$/.test(hexColor)) return;
  const contrastWithWhite = getContrastWithWhite(hexColor);
  const contrastText = contrastWithWhite >= 4.5 ? '#FFFFFF' : '#0F172A';

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.style.setProperty('--brand-accent', hexColor);
    root.style.setProperty('--color-accent', hexColor);
    root.style.setProperty('--brand-accent-text', contrastText);
    root.style.setProperty('--brand-accent-subtle', `${hexColor}1a`);
    root.style.setProperty('--brand-accent-hover', `${hexColor}e6`);
    if (appName) {
      document.title = appName;
    }
  }
}
