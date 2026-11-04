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

/**
 * Sends a pre-rendered PDF Blob directly to the browser print dialog.
 * Instead of printing the web DOM via `window.print()`, this creates an isolated,
 * hidden iframe with the PDF object URL so the print dialog uses the exact vector PDF layout.
 */
export async function printPdfBlob(blob: Blob, documentTitle?: string): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const previousTitle = document.title || DEFAULT_APP_TITLE;
  if (documentTitle) {
    document.title = formatPrintDocumentTitle([documentTitle]);
  }

  // Vitest / jsdom environment fallback
  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
  if (isJsdom || typeof window.URL?.createObjectURL !== 'function') {
    window.print?.();
    if (documentTitle) {
      document.title = previousTitle;
    }
    return;
  }

  return new Promise<void>((resolve) => {
    let blobUrl = '';
    try {
      blobUrl = URL.createObjectURL(blob);
    } catch {
      window.print?.();
      if (documentTitle) document.title = previousTitle;
      resolve();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.src = blobUrl;

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
          URL.revokeObjectURL(blobUrl);
        } catch {}
        if (documentTitle && document.title === formatPrintDocumentTitle([documentTitle])) {
          document.title = previousTitle;
        }
        resolve();
      }, 1500);
    };

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        const win = window.open(blobUrl, '_blank');
        if (win) {
          win.focus();
          win.print?.();
        } else {
          window.print?.();
        }
      } finally {
        cleanup();
      }
    };

    iframe.onerror = () => {
      try {
        const win = window.open(blobUrl, '_blank');
        win?.print?.();
      } catch {
        window.print?.();
      } finally {
        cleanup();
      }
    };

    document.body.appendChild(iframe);
  });
}
