import { useState } from 'react';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ApiClient, OfflineError } from './lib/api';
import { LocalStore } from './lib/db';
import type { UserSession } from './types';

export function Login({ onLogin, notice }: { onLogin: (session: UserSession, store: LocalStore) => void; notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const api = new ApiClient(() => null, async () => {});
      const session = await api.login(email, password);
      const store = await LocalStore.open(session);
      await store.saveOfflineVerifier(email, password, session);
      onLogin(session, store);
    } catch (cause) {
      if (cause instanceof OfflineError) {
        const restored = await LocalStore.openOffline(email, password);
        if (restored) {
          onLogin(restored.session, restored.store);
          return;
        }
        setError('Sem conexão. Para entrar offline, esta conta precisa ter feito ao menos um login online neste dispositivo.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        bgcolor: '#F8FAFC',
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 3,
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 12px 0 rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
          bgcolor: '#FFFFFF',
        }}
      >
        <CardContent sx={{ p: { xs: 3.5, sm: 4 } }}>
          <Stack spacing={0.75} sx={{ mb: 3.5, textAlign: 'left' }}>
            <Typography variant="h5" component="h1" color="#0F172A" fontWeight={800} letterSpacing="-0.02em">
              Frequência ITB
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Acesse sua conta com e-mail e senha para continuar.
            </Typography>
          </Stack>

          <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
            {notice && <Alert severity="info" sx={{ borderRadius: 2 }}>{notice}</Alert>}

            <TextField
              required
              fullWidth
              label="E-mail"
              type="email"
              size="small"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailOutlinedIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              required
              fullWidth
              label="Senha"
              size="small"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setShowPassword((value) => !value)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

            <Button
              type="submit"
              variant="contained"
              size="medium"
              disabled={busy}
              sx={{
                mt: 1,
                py: 1.1,
                fontSize: 14,
                fontWeight: 650,
                borderRadius: 2,
              }}
            >
              {busy ? <CircularProgress size={20} color="inherit" /> : 'Entrar'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

