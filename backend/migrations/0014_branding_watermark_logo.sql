-- Migration 0014: Add print_watermark_logo_url to branding_settings for R2 asset watermarking
ALTER TABLE branding_settings ADD COLUMN print_watermark_logo_url TEXT;
