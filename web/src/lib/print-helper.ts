import { useEffect } from 'react';

const DEFAULT_APP_TITLE = 'opschool';

/**
 * Formats a descriptive document title suitable for browser "Save as PDF" filenames.
 * Replaces characters that are invalid in Windows/macOS/Linux filenames while keeping
 * readable spaces, hyphens, accents, and alphanumeric characters.
 */
export function formatPrintDocumentTitle(parts: Array<string | number | null | undefined>): string {
  const cleaned = parts
    .map((part) => String(part ?? '').trim())
    .filter((part) => part.length > 0 && part !== '—' && part !== '-')
    .join(' - ')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || DEFAULT_APP_TITLE;
}

/**
 * Sets `document.title` to the descriptive document name before invoking `window.print()`,
 * ensuring that "Save as PDF" in the browser print dialog defaults to the specific document name
 * instead of the generic application name ("opschool").
 */
export function printWithDocumentTitle(documentTitle: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const targetTitle = formatPrintDocumentTitle([documentTitle]);
  const previousTitle = document.title || DEFAULT_APP_TITLE;
  document.title = targetTitle;

  const restoreTitle = () => {
    window.removeEventListener('afterprint', restoreTitle);
    if (document.title === targetTitle) {
      document.title = previousTitle;
    }
  };

  window.addEventListener('afterprint', restoreTitle);
  window.print();
}

/**
 * React hook that keeps `document.title` synchronized with the active printable document
 * while mounted (so both clicking "Imprimir" and pressing Ctrl+P use the document's name).
 */
export function usePrintDocumentTitle(
  documentTitle: string | null | undefined,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !documentTitle || typeof document === 'undefined') return;

    const targetTitle = formatPrintDocumentTitle([documentTitle]);
    const previousTitle = document.title || DEFAULT_APP_TITLE;
    document.title = targetTitle;

    const handleBeforePrint = () => {
      document.title = targetTitle;
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      if (document.title === targetTitle) {
        document.title = previousTitle;
      }
    };
  }, [documentTitle, enabled]);
}
