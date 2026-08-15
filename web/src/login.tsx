import { useState } from 'react';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
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
        p: 2.5,
        bgcolor: '#F8FAFC',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 390 }}>
        {/* Brand Header */}
        <Stack spacing={1.5} alignItems="center" sx={{ mb: 3.5, textAlign: 'center' }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              bgcolor: '#0F172A',
              color: '#FFFFFF',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
            }}
          >
            <FingerprintIcon sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h5" component="h1" color="#0F172A" fontWeight={800} letterSpacing="-0.03em">
              Frequência ITB
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontSize: 13 }}>
              Instituto Transforma Brasil
            </Typography>
          </Box>
        </Stack>

        {/* Auth Card */}
        <Card
          sx={{
            borderRadius: 3,
            border: '1px solid #E2E8F0',
            bgcolor: '#FFFFFF',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 3.5 } }}>
            <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
              {notice && <Alert severity="info" sx={{ borderRadius: 2 }}>{notice}</Alert>}

              <TextField
                required
                fullWidth
                label="E-mail institucional"
                type="email"
                size="small"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailOutlinedIcon color="action" sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                required
                fullWidth
                label="Senha de acesso"
                size="small"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon color="action" sx={{ fontSize: 18 }} />
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
                        {showPassword ? <VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

              <Button
                type="submit"
                variant="contained"
                disabled={busy}
                sx={{
                  py: 1.1,
                  mt: 0.5,
                  fontWeight: 650,
                  fontSize: 14,
                  bgcolor: '#0F172A',
                  color: '#FFFFFF',
                  borderRadius: 2,
                  '&:hover': { bgcolor: '#1E293B' },
                }}
              >
                {busy ? <CircularProgress size={20} color="inherit" /> : 'Entrar no sistema'}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Footer Note */}
        <Typography variant="caption" color="#94A3B8" textAlign="center" sx={{ display: 'block', mt: 3, fontSize: 11.5 }}>
          Sistema de presença e frequência escolar offline-first
        </Typography>
      </Box>
    </Box>
  );
}
