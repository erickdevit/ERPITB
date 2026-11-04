/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PrintWatermark, QrCodeImage, PageDialog } from './components';
import { vi } from 'vitest';

describe('Common Components', () => {
  describe('PrintWatermark', () => {
    it('returns null when neither text nor logoUrl is provided', () => {
      const { container } = render(<PrintWatermark />);
      expect(container.firstChild).toBeNull();
    });

    it('renders watermark image with data-watermark attribute and grayscale filter by default', () => {
      const { container } = render(
        <PrintWatermark logoUrl="https://cdn.opschool.test/watermark.png" />
      );
      const root = container.querySelector('[data-watermark="true"]');
      expect(root).not.toBeNull();
      expect(root).toHaveClass('print-watermark');

      const img = container.querySelector('img.watermark-image');
      expect(img).not.toBeNull();
      expect(img).toHaveClass('grayscale');
      expect(img).toHaveAttribute('src', 'https://cdn.opschool.test/watermark.png');
    });

    it('renders watermark image in full color when grayscale is false', () => {
      const { container } = render(
        <PrintWatermark
          logoUrl="https://cdn.opschool.test/watermark.png"
          grayscale={false}
        />
      );
      const img = container.querySelector('img.watermark-image');
      expect(img).not.toBeNull();
      expect(img).not.toHaveClass('grayscale');
    });

    it('renders watermark text when logoUrl is not provided', () => {
      render(<PrintWatermark text="DOCUMENTO OFICIAL ESCOLAR" />);
      const textElem = screen.getByText('DOCUMENTO OFICIAL ESCOLAR');
      expect(textElem).toHaveClass('watermark-text');
    });
  });

  describe('QrCodeImage', () => {
    it('renders qr code container cleanly without box-shadow or borders', () => {
      const { container } = render(
        <QrCodeImage value="https://app.opschool.test/boletim/123" size={80} />
      );
      expect(container.firstChild).not.toBeNull();
    });
  });

  describe('PageDialog', () => {
    it('renders modal content when open is true', () => {
      render(
        <PageDialog open={true} title="Modal Test" onClose={() => {}} onSave={() => {}}>
          <p>Dialog Body</p>
        </PageDialog>
      );
      expect(screen.getByText('Modal Test')).toBeInTheDocument();
      expect(screen.getByText('Dialog Body')).toBeInTheDocument();
    });

    it('does not render modal content when open is false', () => {
      render(
        <PageDialog open={false} title="Modal Hidden" onClose={() => {}} onSave={() => {}}>
          <p>Hidden Content</p>
        </PageDialog>
      );
      expect(screen.queryByText('Modal Hidden')).toBeNull();
    });

    it('invokes onClose when pressing Escape key', () => {
      const handleClose = vi.fn();
      render(
        <PageDialog open={true} title="Modal Keyboard Test" onClose={handleClose} onSave={() => {}}>
          <p>Esc Content</p>
        </PageDialog>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
