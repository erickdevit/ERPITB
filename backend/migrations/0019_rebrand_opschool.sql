-- Migration 0019: Rebrand default app_name and print watermark to opschool
UPDATE branding_settings
SET app_name = 'opschool'
WHERE app_name = 'ERPITB';

UPDATE branding_settings
SET print_watermark_text = 'opschool - Documento Oficial'
WHERE print_watermark_text = 'ERPITB - Documento Oficial';
