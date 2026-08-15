import type { UserSession } from '../types';

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly requestId?: string) { super(message); }
}
export class OfflineError extends Error { constructor() { super('Sem conexão com o servidor.'); } }

export class ApiClient {
  constructor(private getSession: () => UserSession | null, private updateSession: (session: UserSession) => Promise<void>) {}
  async request<T>(path: string, method = 'GET', body?: unknown, refresh = true): Promise<T> {
    try {
      const session = this.getSession();
      const response = await fetch(`/api${path}`, { method, headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string }; requestId?: string } & T;
      if (response.status === 401 && session && refresh && await this.refresh()) return this.request<T>(path, method, body, false);
      if (!response.ok) {
        const requestId = payload.requestId ?? response.headers.get('x-request-id') ?? undefined;
        const baseMessage = payload.error?.message ?? 'Falha na comunicação com o servidor.';
        const message = response.status >= 500 && requestId ? `${baseMessage} Referência: ${requestId}.` : baseMessage;
        throw new ApiError(response.status, message, payload.error?.code, requestId);
      }
      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new OfflineError();
    }
  }
  async login(email: string, password: string): Promise<UserSession> {
    const result = await this.request<{ user: Omit<UserSession, 'accessToken' | 'refreshToken'>; accessToken: string; refreshToken: string }>('/auth/login', 'POST', { email, password }, false);
    return { ...result.user, accessToken: result.accessToken, refreshToken: result.refreshToken };
  }
  async refresh(): Promise<boolean> {
    const session = this.getSession(); if (!session) return false;
    if (!session.refreshToken) return false;
    try {
      const result = await this.request<{ user: Omit<UserSession, 'accessToken' | 'refreshToken'>; accessToken: string; refreshToken: string }>('/auth/refresh', 'POST', { refreshToken: session.refreshToken }, false);
      await this.updateSession({ ...result.user, accessToken: result.accessToken, refreshToken: result.refreshToken }); return true;
    } catch (error) { if (error instanceof OfflineError) return false; throw error; }
  }
  post<T>(path: string, body: unknown) { return this.request<T>(path, 'POST', body); }
  put<T>(path: string, body: unknown) { return this.request<T>(path, 'PUT', body); }
  get<T>(path: string) { return this.request<T>(path); }
}
