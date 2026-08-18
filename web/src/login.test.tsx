// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './login';
import { ApiError, OfflineError } from './lib/api';
import { LocalStore } from './lib/db';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  open: vi.fn(),
  openOffline: vi.fn(),
  saveOfflineVerifier: vi.fn(),
}));

vi.mock('./lib/api', () => ({
  ApiClient: vi.fn().mockImplementation(() => ({
    login: mocks.login,
  })),
  ApiError: class extends Error {
    constructor(readonly status: number, message: string, readonly code?: string) {
      super(message);
    }
  },
  OfflineError: class extends Error {
    constructor() {
      super('Sem conexão com o servidor.');
    }
  },
}));

vi.mock('./lib/db', () => ({
  LocalStore: {
    open: mocks.open,
    openOffline: mocks.openOffline,
  },
}));

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits valid credentials and calls onLogin', async () => {
    const onLogin = vi.fn();
    const user = userEvent.setup();
    const mockSession = { id: 'u-1', name: 'User 1', email: 'user@itb.org.br', role: 'admin' };
    const mockStore = { saveOfflineVerifier: mocks.saveOfflineVerifier };

    mocks.login.mockResolvedValue(mockSession);
    mocks.open.mockResolvedValue(mockStore);

    render(<Login onLogin={onLogin} />);

    await user.type(screen.getByLabelText('E-mail'), 'user@itb.org.br');
    await user.type(screen.getByLabelText('Senha'), 'Senha Forte 123!');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(mockSession, mockStore));
    expect(mocks.saveOfflineVerifier).toHaveBeenCalledWith('user@itb.org.br', 'Senha Forte 123!', mockSession);
  });

  it('displays API error message when server rejects credentials', async () => {
    const onLogin = vi.fn();
    const user = userEvent.setup();

    mocks.login.mockRejectedValue(new ApiError(401, 'E-mail ou senha inválidos.', 'INVALID_CREDENTIALS'));

    render(<Login onLogin={onLogin} />);

    await user.type(screen.getByLabelText('E-mail'), 'user@itb.org.br');
    await user.type(screen.getByLabelText('Senha'), 'SenhaIncorreta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('falls back to offline authentication if server is unreachable', async () => {
    const onLogin = vi.fn();
    const user = userEvent.setup();
    const offlineSession = { id: 'u-1', name: 'User Offline', email: 'user@itb.org.br', role: 'professor', offline: true };
    const offlineStore = {};

    mocks.login.mockRejectedValue(new OfflineError());
    mocks.openOffline.mockResolvedValue({ session: offlineSession, store: offlineStore });

    render(<Login onLogin={onLogin} />);

    await user.type(screen.getByLabelText('E-mail'), 'user@itb.org.br');
    await user.type(screen.getByLabelText('Senha'), 'Senha Forte 123!');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(offlineSession, offlineStore));
  });

  it('shows clear error when offline login is attempted without prior credentials', async () => {
    const onLogin = vi.fn();
    const user = userEvent.setup();

    mocks.login.mockRejectedValue(new OfflineError());
    mocks.openOffline.mockResolvedValue(null);

    render(<Login onLogin={onLogin} />);

    await user.type(screen.getByLabelText('E-mail'), 'newuser@itb.org.br');
    await user.type(screen.getByLabelText('Senha'), 'Senha123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText(/Para entrar offline, esta conta precisa ter feito ao menos um login prévio/),
    ).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });
});
