export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'REQUEST_FAILED',
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new AppError(415, 'Envie o corpo como application/json.', 'UNSUPPORTED_MEDIA_TYPE');
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError(400, 'JSON inválido.', 'INVALID_JSON');
  }
}

export function requireString(value: unknown, field: string, options: { min?: number; max?: number } = {}): string {
  if (typeof value !== 'string') throw new AppError(400, `${field} é obrigatório.`, 'VALIDATION_ERROR');
  const normalized = value.trim();
  if (normalized.length < (options.min ?? 1) || normalized.length > (options.max ?? 500)) {
    throw new AppError(400, `${field} possui tamanho inválido.`, 'VALIDATION_ERROR');
  }
  return normalized;
}

export function normalizeEmail(value: unknown): string {
  const email = requireString(value, 'email', { min: 5, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'E-mail inválido.', 'VALIDATION_ERROR');
  }
  return email;
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

