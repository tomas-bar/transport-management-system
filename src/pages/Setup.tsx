import { useState } from 'react';
import { api } from '../services/server-api';
import { Button, Field } from '../components/ui';

export function Setup({ token }: { token: string }) {
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <div className="login-screen"><section className="login-content"><div className="login-form-wrap"><h1>Paruošti paskyrą</h1>
    <p>Pasirinkite savo prisijungimo duomenis. Bandomųjų paskyrų „admin“, „dispatcher“ ir „driver“ pradinis slaptažodis bus toks pats. Vėliau jį galėsite pakeisti kiekvienai paskyrai.</p>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try {
      await api('/api/setup', 'POST', { token, email, name, password });
      await api('/api/login', 'POST', { email, password });
      location.hash = ''; location.reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      <Field label="Vardas ir pavardė"><input required maxLength={100} value={name} onChange={e => setName(e.target.value)}/></Field>
      <Field label="El. paštas"><input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></Field>
      <Field label="Slaptažodis" hint="Bent 8 simbolių."><input type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>Paruošti ir prisijungti</Button>
    </form></div></section></div>;
}
