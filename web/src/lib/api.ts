import type {
  ApiKeyRecord,
  BrandingSettings,
  CashTransaction,
  FinancialContact,
  FinancialFee,
  UserSession,
} from '../types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Sem conexão com o servidor. A aplicação opera online.');
  }
}

export interface RequestOptions {
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export class ApiClient {
  private onUnauthorized?: (message: string) => void;
  private refreshPromise: Promise<boolean> | null = null;
  private unauthorizedNotified = false;
  private consecutiveFailures = 0;
  private circuitBreakerTrippedUntil = 0;

  constructor(
    private getSession: () => UserSession | null,
    private updateSession: (session: UserSession) => Promise<void>,
  ) {}

  setOnUnauthorized(handler: (message: string) => void) {
    this.onUnauthorized = handler;
  }

  private notifyUnauthorized(message = 'Sua sessão expirou. Entre novamente.') {
    if (this.unauthorizedNotified) return;
    this.unauthorizedNotified = true;
    this.onUnauthorized?.(message);
  }

  private checkCircuitBreaker() {
    const now = Date.now();
    if (this.circuitBreakerTrippedUntil > now) {
      const waitSec = Math.ceil((this.circuitBreakerTrippedUntil - now) / 1000);
      throw new ApiError(429, `Muitas requisições com falha consecutiva. Aguarde ${waitSec}s para tentar novamente.`, 'CIRCUIT_BREAKER_ACTIVE');
    }
  }

  private recordSuccess() {
    this.consecutiveFailures = 0;
    this.circuitBreakerTrippedUntil = 0;
  }

  private recordFailure(status: number) {
    if (status === 401 || status === 429 || status >= 500) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 15) {
        this.circuitBreakerTrippedUntil = Date.now() + 10_000;
        this.consecutiveFailures = 0;
      }
    }
  }

  async request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    refresh = true,
    options?: RequestOptions,
  ): Promise<T> {
    try {
      this.checkCircuitBreaker();
      const session = this.getSession();
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      const headers: Record<string, string> = {
        ...(isFormData ? {} : { 'content-type': 'application/json' }),
        ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
        ...(options?.idempotencyKey ? { 'x-idempotency-key': options.idempotencyKey } : {}),
        ...(options?.headers || {}),
      };

      const response = await fetch(`/api${path}`, {
        method,
        headers,
        credentials: 'include',
        body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; code?: string };
        requestId?: string;
      } & T;

      const isAuthPath = path.startsWith('/auth/');

      if (response.status === 401 && session && refresh && !isAuthPath) {
        const refreshed = await this.refresh();
        if (refreshed) {
          return this.request<T>(path, method, body, false, options);
        }
      }

      if (response.status === 401 && session && !isAuthPath) {
        this.notifyUnauthorized('Sua sessão expirou. Entre novamente.');
      }

      if (!response.ok) {
        this.recordFailure(response.status);
        const requestId = payload.requestId ?? response.headers.get('x-request-id') ?? undefined;
        let baseMessage = payload.error?.message;
        if (!baseMessage) {
          if (response.status === 401) baseMessage = 'E-mail ou senha inválidos.';
          else if (response.status === 403) baseMessage = 'Acesso não autorizado.';
          else if (response.status === 404) baseMessage = 'Recurso não encontrado.';
          else if (response.status === 409) baseMessage = 'Já existe um registro com estes dados.';
          else baseMessage = 'Falha na comunicação com o servidor.';
        }
        const message = response.status >= 500 && requestId ? `${baseMessage} Referência: ${requestId}.` : baseMessage;
        throw new ApiError(response.status, message, payload.error?.code, requestId);
      }

      this.recordSuccess();
      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new OfflineError();
    }
  }

  async login(email: string, password: string): Promise<UserSession> {
    this.unauthorizedNotified = false;
    const result = await this.request<{
      user: Omit<UserSession, 'accessToken' | 'refreshToken'>;
      accessToken: string;
      refreshToken: string;
    }>('/auth/login', 'POST', { email, password }, false);
    return { ...result.user, accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  async refresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const session = this.getSession();
      if (!session?.refreshToken) {
        this.notifyUnauthorized('Sua sessão expirou. Entre novamente.');
        return false;
      }
      try {
        const result = await this.request<{
          user: Omit<UserSession, 'accessToken' | 'refreshToken'>;
          accessToken: string;
          refreshToken: string;
        }>('/auth/refresh', 'POST', { refreshToken: session.refreshToken }, false);
        this.unauthorizedNotified = false;
        await this.updateSession({ ...result.user, accessToken: result.accessToken, refreshToken: result.refreshToken });
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          this.notifyUnauthorized('Sua sessão expirou. Entre novamente.');
        }
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async logout(refreshToken?: string): Promise<void> {
    this.unauthorizedNotified = true;
    try {
      await this.request('/auth/logout', 'POST', { refreshToken }, false);
    } catch {
      // Ignore network/server errors during logout
    }
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>(path, 'GET', undefined, true, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(path, 'POST', body, true, options);
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(path, 'PUT', body, true, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(path, 'PATCH', body, true, options);
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>(path, 'DELETE', undefined, true, options);
  }

  // Finance Domain Helpers
  getFees(params?: Record<string, string>) {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this.get<{ items: FinancialFee[]; total: number; summary: any }>(`/v1/finance/fees${qs}`);
  }

  createFee(data: Partial<FinancialFee>) {
    return this.post<FinancialFee>('/v1/finance/fees', data);
  }

  updateFee(id: string, data: Partial<FinancialFee>) {
    return this.patch<FinancialFee>(`/v1/finance/fees/${id}`, data);
  }

  recordPayment(feeId: string, data: { amountCents: number; paymentDate: string; paymentMethod: string; reference?: string }, idempotencyKey?: string) {
    return this.post<{ ok: boolean; payment: unknown; fee: unknown }>(`/v1/finance/fees/${feeId}/payments`, data, { idempotencyKey });
  }

  getCash(params?: Record<string, string>) {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this.get<{ items: CashTransaction[]; total: number; summary: any }>(`/v1/finance/cash${qs}`);
  }

  createCashEntry(data: Partial<CashTransaction>) {
    return this.post<CashTransaction>('/v1/finance/cash/entries', data);
  }

  reverseCashEntry(id: string, reason: string) {
    return this.post<{ ok: boolean; reversalId: string }>(`/v1/finance/cash/entries/${id}/reversal`, { reason });
  }

  getFinancialContact(studentId: string) {
    return this.get<FinancialContact | null>(`/v1/finance/contacts/${studentId}`);
  }

  saveFinancialContact(studentId: string, data: Partial<FinancialContact>) {
    return this.put<FinancialContact>(`/v1/finance/contacts/${studentId}`, data);
  }

  // Branding Domain Helpers
  getBranding() {
    return this.get<BrandingSettings>('/v1/admin/branding');
  }

  updateBranding(data: Partial<BrandingSettings>) {
    return this.put<BrandingSettings>('/v1/admin/branding', data);
  }

  resetBranding() {
    return this.post<BrandingSettings>('/v1/admin/branding/reset');
  }

  uploadBrandingAsset(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.post<{ url: string; key: string }>('/v1/admin/branding/upload', formData);
  }

  // Grades Direct Endpoints
  deleteGradeItem(id: string) {
    return this.delete<{ ok: boolean }>(`/v1/grade-items/${id}`);
  }

  deleteGradeTable(id: string) {
    return this.delete<{ ok: boolean }>(`/v1/grade-tables/${id}`);
  }

  // API Keys Helpers
  getApiKeys() {
    return this.get<{ items: ApiKeyRecord[] }>('/v1/admin/api-keys');
  }

  createApiKey(data: { name: string; scopes: string[]; expiresAt?: string }) {
    return this.post<{ key: ApiKeyRecord; secret: string }>('/v1/admin/api-keys', data);
  }

  revokeApiKey(id: string) {
    return this.post<{ ok: boolean }>(`/v1/admin/api-keys/${id}/revoke`);
  }

  rotateApiKey(id: string) {
    return this.post<{ key: ApiKeyRecord; secret: string }>(`/v1/admin/api-keys/${id}/rotate`);
  }

  // Enrollment & Student Actions
  lockStudentEnrollment(studentId: string, classId?: string) {
    return this.post<{ ok: boolean; message: string }>(`/v1/students/${studentId}/lock`, { classId });
  }

  unlockStudentEnrollment(studentId: string, classId?: string) {
    return this.post<{ ok: boolean; message: string }>(`/v1/students/${studentId}/unlock`, { classId });
  }

  getClassSessions(classId: string) {
    return this.get<{ items: Array<{ id: string; date: string; summary?: string }>; total: number }>(`/v1/classes/${classId}/sessions`);
  }

  // Server-side Analytics & Reports
  getAnalytics(params?: Record<string, string>) {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this.get<any>(`/v1/analytics${qs}`);
  }

  getReport(params?: Record<string, string>) {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this.get<any>(`/v1/reports${qs}`);
  }
}
