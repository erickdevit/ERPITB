-- Migration 0015: Add print_watermark_grayscale to branding_settings
ALTER TABLE branding_settings ADD COLUMN print_watermark_grayscale INTEGER NOT NULL DEFAULT 1;
