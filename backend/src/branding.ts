import { AppError, nowIso, readJson, requireString, uuid } from './http';
import { requirePermission } from './rbac';
import { assertConcurrencyVersion, formatETag, parseIfMatchHeader } from './concurrency';
import { broadcastEvent } from './events-bus';
import type { AuthUser, BrandingSettings, Env } from './types';

export const DEFAULT_BRANDING: BrandingSettings = {
  id: 'default',
  appName: 'ERPITB',
  accentColor: '#102A43',
  loginLogoUrl: '',
  loginBgUrl: '',
  printWatermarkText: 'ERPITB - Documento Oficial',
  printWatermarkLogoUrl: '',
  showHeaderLogoLeft: true,
  showHeaderLogoRight: false,
  documentHeaderAlign: 'left',
  syncVersion: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Validate hex color and calculate luminance for contrast
export function isValidHexColor(hex: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(hex);
}

/**
 * Decompress 8-bit sRGB channel (0-255) to linear light component according to W3C WCAG 2.1:
 * (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
 */
export function sRgbChannelToLinear(channel8: number): number {
  const c = channel8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Calculate relative luminance (L) in the range [0.0, 1.0] for an sRGB hex color according to W3C WCAG 2.1:
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 */
export function calculateRelativeLuminance(hex: string): number {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map((x) => x + x).join('');
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return 0.2126 * sRgbChannelToLinear(r) + 0.7152 * sRgbChannelToLinear(g) + 0.0722 * sRgbChannelToLinear(b);
}

/**
 * Calculate contrast ratio between two relative luminances according to W3C WCAG 2.1:
 * (L1 + 0.05) / (L2 + 0.05) where L1 is the lighter of the two colors.
 */
export function calculateContrastRatio(lum1: number, lum2: number): number {
  const l1 = Math.max(lum1, lum2);
  const l2 = Math.min(lum1, lum2);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Calculate contrast ratio of hex color against pure white (#FFFFFF, L = 1.0)
 */
export function calculateContrastRatioAgainstWhite(hex: string): number {
  const lum = calculateRelativeLuminance(hex);
  return calculateContrastRatio(1.0, lum);
}

/**
 * Validate that accent color meets WCAG AA contrast ratio of at least 3.0:1 against white
 */
export function validateWcagAaContrast(hex: string): number {
  const ratio = calculateContrastRatioAgainstWhite(hex);
  const rounded = Math.round(ratio * 100) / 100;
  if (rounded < 3.0) {
    throw new AppError(
      400,
      `A cor escolhida é muito clara e prejudica o contraste e a legibilidade. Razão de contraste com branco: ${rounded}:1 (mínimo exigido: 3.0:1 pela norma W3C WCAG 2.1 AA).`,
      'CONTRAST_ERROR',
      { contrastRatio: rounded, requiredMinimum: 3.0 }
    );
  }
  return rounded;
}

export async function getBranding(env: Env): Promise<BrandingSettings> {
  const row = await env.DB.prepare(
    `SELECT * FROM branding_settings WHERE id = 'default' LIMIT 1`,
  ).first<{
    id: string; app_name: string; accent_color: string; login_logo_url: string | null;
    login_bg_url: string | null; print_watermark_text: string | null;
    print_watermark_logo_url: string | null;
    show_header_logo_left: number; show_header_logo_right: number;
    document_header_align: 'left' | 'center' | 'right' | 'split' | null;
    sync_version: number | null;
    updated_at: string;
  }>();

  if (!row) {
    return DEFAULT_BRANDING;
  }

  return {
    id: row.id,
    appName: row.app_name || DEFAULT_BRANDING.appName,
    accentColor: row.accent_color || DEFAULT_BRANDING.accentColor,
    loginLogoUrl: row.login_logo_url || '',
    loginBgUrl: row.login_bg_url || '',
    printWatermarkText: row.print_watermark_text || DEFAULT_BRANDING.printWatermarkText,
    printWatermarkLogoUrl: row.print_watermark_logo_url || '',
    showHeaderLogoLeft: Boolean(row.show_header_logo_left),
    showHeaderLogoRight: Boolean(row.show_header_logo_right),
    documentHeaderAlign: row.document_header_align || 'left',
    syncVersion: row.sync_version ?? 1,
    updatedAt: row.updated_at,
  };
}

export async function updateBranding(request: Request, env: Env, user: AuthUser): Promise<Response> {
  requirePermission(user, 'branding:manage');
  const currentRow = await env.DB.prepare(
    `SELECT sync_version FROM branding_settings WHERE id = 'default' LIMIT 1`
  ).first<{ sync_version: number }>();

  const currentVersion = currentRow ? Number(currentRow.sync_version ?? 1) : 1;
  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(currentVersion, ifMatch);

  const body = await readJson<Record<string, unknown>>(request);

  const appName = requireString(body.appName || DEFAULT_BRANDING.appName, 'appName', { min: 2, max: 60 });
  const accentColor = requireString(body.accentColor || DEFAULT_BRANDING.accentColor, 'accentColor', { min: 4, max: 7 });

  if (!isValidHexColor(accentColor)) {
    throw new AppError(400, 'Cor de destaque inválida. Use formato hexadecimal (ex: #102A43).', 'VALIDATION_ERROR');
  }

  // Enforce W3C WCAG 2.1 AA contrast ratio against white
  validateWcagAaContrast(accentColor);

  const loginLogoUrl = typeof body.loginLogoUrl === 'string' ? body.loginLogoUrl.trim() : '';
  const loginBgUrl = typeof body.loginBgUrl === 'string' ? body.loginBgUrl.trim() : '';
  const printWatermarkLogoUrl = typeof body.printWatermarkLogoUrl === 'string' ? body.printWatermarkLogoUrl.trim() : '';
  const printWatermarkText = typeof body.printWatermarkText === 'string' ? body.printWatermarkText.trim() : DEFAULT_BRANDING.printWatermarkText;
  const showHeaderLogoLeft = body.showHeaderLogoLeft !== undefined ? (body.showHeaderLogoLeft ? 1 : 0) : 1;
  const showHeaderLogoRight = body.showHeaderLogoRight !== undefined ? (body.showHeaderLogoRight ? 1 : 0) : 0;
  const documentHeaderAlign = body.documentHeaderAlign === undefined
    ? 'left'
    : (['left', 'center', 'right', 'split'].includes(String(body.documentHeaderAlign))
        ? (body.documentHeaderAlign as 'left' | 'center' | 'right' | 'split')
        : 'left');

  // Protect DB from enormous payloads
  if (loginLogoUrl.length > 300 * 1024 || loginBgUrl.length > 500 * 1024 || printWatermarkLogoUrl.length > 500 * 1024) {
    throw new AppError(400, 'As imagens enviadas excedem o tamanho máximo permitido (máx 300KB para logo e 500KB para fundo).', 'PAYLOAD_TOO_LARGE');
  }

  // Strictly forbid base64 payloads to preserve database performance (upload only to R2 bucket)
  if (
    loginLogoUrl.startsWith('data:') ||
    loginBgUrl.startsWith('data:') ||
    printWatermarkLogoUrl.startsWith('data:')
  ) {
    throw new AppError(400, 'Upload em base64 não é permitido. Faça o upload direto da imagem para armazenamento no bucket R2.', 'BASE64_NOT_ALLOWED');
  }

  const timestamp = nowIso();
  const nextVersion = currentVersion + 1;

  if (!currentRow) {
    await env.DB.prepare(`
      INSERT INTO branding_settings (
        id, app_name, accent_color, login_logo_url, login_bg_url,
        print_watermark_text, print_watermark_logo_url, show_header_logo_left, show_header_logo_right,
        document_header_align, sync_version, updated_by_user_id, updated_at
      ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      appName, accentColor, loginLogoUrl, loginBgUrl,
      printWatermarkText, printWatermarkLogoUrl, showHeaderLogoLeft, showHeaderLogoRight,
      documentHeaderAlign, user.id, timestamp,
    ).run();
  } else {
    const updateResult = await env.DB.prepare(`
      UPDATE branding_settings
         SET app_name = ?, accent_color = ?, login_logo_url = ?, login_bg_url = ?,
             print_watermark_text = ?, print_watermark_logo_url = ?, show_header_logo_left = ?, show_header_logo_right = ?,
             document_header_align = ?, sync_version = ?, updated_by_user_id = ?, updated_at = ?
       WHERE id = 'default' AND sync_version = ?
    `).bind(
      appName, accentColor, loginLogoUrl, loginBgUrl,
      printWatermarkText, printWatermarkLogoUrl, showHeaderLogoLeft, showHeaderLogoRight,
      documentHeaderAlign, nextVersion, user.id, timestamp, currentVersion,
    ).run();

    if (updateResult.meta.changes === 0) {
      const latest = await env.DB.prepare(`SELECT sync_version FROM branding_settings WHERE id = 'default'`).first<{ sync_version: number }>();
      throw new AppError(409, 'Configurações de identidade visual foram modificadas concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: latest?.sync_version ?? 1 });
    }
  }

  await env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at)
    VALUES (?, ?, 'UPDATE_BRANDING', 'branding_settings', 'default', ?, ?)
  `).bind(uuid(), user.id, JSON.stringify({ appName, accentColor, documentHeaderAlign }), timestamp).run();

  broadcastEvent('branding_updated', {
    appName,
    accentColor,
    documentHeaderAlign,
    timestamp,
  }, { env });

  const responseBody = {
    id: 'default',
    appName,
    accentColor,
    loginLogoUrl,
    loginBgUrl,
    printWatermarkText,
    printWatermarkLogoUrl,
    showHeaderLogoLeft: Boolean(showHeaderLogoLeft),
    showHeaderLogoRight: Boolean(showHeaderLogoRight),
    documentHeaderAlign,
    syncVersion: nextVersion,
    updatedAt: timestamp,
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(nextVersion),
    },
  });
}

export async function resetBranding(env: Env, user: AuthUser): Promise<BrandingSettings> {
  requirePermission(user, 'branding:manage');
  const timestamp = nowIso();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO branding_settings (
        id, app_name, accent_color, login_logo_url, login_bg_url,
        print_watermark_text, print_watermark_logo_url, show_header_logo_left, show_header_logo_right,
        document_header_align, sync_version, updated_by_user_id, updated_at
      ) VALUES ('default', ?, ?, '', '', ?, '', 1, 0, 'left', 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        app_name = excluded.app_name,
        accent_color = excluded.accent_color,
        login_logo_url = '',
        login_bg_url = '',
        print_watermark_text = excluded.print_watermark_text,
        print_watermark_logo_url = '',
        show_header_logo_left = 1,
        show_header_logo_right = 0,
        document_header_align = 'left',
        sync_version = branding_settings.sync_version + 1,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = excluded.updated_at
    `).bind(
      DEFAULT_BRANDING.appName,
      DEFAULT_BRANDING.accentColor,
      DEFAULT_BRANDING.printWatermarkText,
      user.id,
      timestamp,
    ),
    env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at)
      VALUES (?, ?, 'RESET_BRANDING', 'branding_settings', 'default', '{}', ?)
    `).bind(uuid(), user.id, timestamp),
  ]);

  broadcastEvent('branding_updated', {
    appName: DEFAULT_BRANDING.appName,
    accentColor: DEFAULT_BRANDING.accentColor,
    documentHeaderAlign: DEFAULT_BRANDING.documentHeaderAlign,
    timestamp,
  }, { env });

  return {
    ...DEFAULT_BRANDING,
    updatedAt: timestamp,
  };
}

export async function uploadBrandingAsset(request: Request, env: Env, user: AuthUser): Promise<Response> {
  requirePermission(user, 'branding:manage');
  if (!env.ASSETS_BUCKET) {
    throw new AppError(503, 'Armazenamento de assets (R2) não configurado no servidor.', 'STORAGE_UNAVAILABLE');
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    throw new AppError(400, 'Content-Type deve ser multipart/form-data.', 'INVALID_CONTENT_TYPE');
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new AppError(400, 'Nenhum arquivo enviado no campo "file".', 'FILE_REQUIRED');
  }

  // Max 5 MB limit
  if (file.size > 5 * 1024 * 1024) {
    throw new AppError(400, 'O arquivo deve ter no máximo 5MB.', 'FILE_TOO_LARGE');
  }

  const allowedMimeTypes: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
  };

  const extension = allowedMimeTypes[file.type.toLowerCase()];
  if (!extension) {
    throw new AppError(400, 'Formato de imagem não suportado. Utilize PNG, JPG, WEBP, SVG ou GIF.', 'INVALID_FILE_TYPE');
  }

  const fileKey = `branding/${uuid()}.${extension}`;
  const arrayBuffer = await file.arrayBuffer();

  await env.ASSETS_BUCKET.put(fileKey, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  const assetUrl = `/v1/assets/${fileKey}`;

  return new Response(JSON.stringify({ url: assetUrl, key: fileKey }), {
    status: 201,
    headers: {
      'content-type': 'application/json',
    },
  });
}
