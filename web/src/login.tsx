import { useState } from 'react';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Box, Button, Card, CardContent, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { ApiClient, OfflineError } from './lib/api';
import { LocalStore } from './lib/db';
import type { UserSession } from './types';

export function Login({ onLogin, notice }: { onLogin: (session: UserSession, store: LocalStore) => void; notice?: string }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(undefined);
    try {
      const api = new ApiClient(() => null, async () => {});
      const session = await api.login(email, password);
      const store = await LocalStore.open(session); await store.saveOfflineVerifier(email, password, session); onLogin(session, store);
    } catch (cause) {
      if (cause instanceof OfflineError) {
        const restored = await LocalStore.openOffline(email, password);
        if (restored) { onLogin(restored.session, restored.store); return; }
        setError('Sem conexão. Para entrar offline, esta conta precisa ter feito ao menos um login online neste dispositivo.');
      } else setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.');
    } finally { setBusy(false); }
  }
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, background: 'linear-gradient(145deg, #102A43 0%, #1769AA 100%)' }}><Card sx={{ width: '100%', maxWidth: 430, borderRadius: 4 }}><CardContent sx={{ p: 4 }}><Typography variant="h4" color="primary.dark" fontWeight={900}>Frequência ITB</Typography><Typography sx={{ mb: 3 }} color="text.secondary">Controle de frequência offline-first</Typography><Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>{notice && <Alert severity="info">{notice}</Alert>}<TextField required label="E-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /><TextField required label="Senha" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((value) => !value)} edge="end">{showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}</IconButton></InputAdornment> }} />{error && <Alert severity="error">{error}</Alert>}<Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? <CircularProgress size={22} color="inherit" /> : 'Entrar'}</Button></Box></CardContent></Card></Box>;
}
