import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { FoundationDto, OperationDto } from '../../packages/contracts/api.js';
import './style.css';
import { Explorer } from './Explorer.js';

type Configuration = { mode: 'development' | 'oidc'; issuer: string; clientId: string; scope: string };

function App() {
  const [configuration, setConfiguration] = useState<Configuration>();
  const [manager, setManager] = useState<UserManager>();
  const [token, setToken] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [foundation, setFoundation] = useState<FoundationDto>();
  const [roles, setRoles] = useState<string[]>([]);
  const [operation, setOperation] = useState<OperationDto>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab,setTab]=useState<'explorer'|'foundation'>('explorer');

  useEffect(() => {
    void (async () => {
      const response = await fetch('/auth/config');
      if (!response.ok) throw new Error('Configuration de connexion indisponible.');
      const config = await response.json() as Configuration;
      setConfiguration(config);
      if (config.mode === 'oidc') {
        const oidc = new UserManager({ authority: config.issuer, client_id: config.clientId,
          redirect_uri: `${location.origin}/`, post_logout_redirect_uri: `${location.origin}/`,
          response_type: 'code', scope: config.scope, automaticSilentRenew: false,
          userStore: new WebStorageStateStore({ store: sessionStorage }),
        });
        setManager(oidc);
        const user = new URLSearchParams(location.search).has('state') ? await oidc.signinRedirectCallback() : await oidc.getUser();
        history.replaceState(null, '', '/');
        if (user && !user.expired) setToken(user.access_token);
        oidc.events.addAccessTokenExpired(() => { setToken(''); setFoundation(undefined); setRoles([]); });
      }
    })().catch(() => setError('Impossible de configurer la connexion. Vérifiez le fournisseur et le réseau.'));
  }, []);

  async function api<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...options, headers: { ...options?.headers, Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      if (response.status === 401) { setFoundation(undefined); setRoles([]); }
      throw new Error(response.status === 401 ? 'Authentification refusée ou expirée.' : response.status === 403 ? 'Droits insuffisants.' : response.status===429?'Quota atteint. Patientez avant de réessayer.':'Service indisponible ou requête refusée.');
    }
    return response.json() as Promise<T>;
  }

  useEffect(() => {
    if (!token) return;
    let active = true;
    void Promise.all([api<FoundationDto>('/api/foundation').catch(()=>undefined), api<{ roles: string[] }>('/api/me')])
      .then(([data, me]) => { if (active) { setFoundation(data); setRoles(me.roles); setError(''); } })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
    // api reads the current token, which is the only dependency of authentication.
  }, [token]);

  useEffect(() => {
    if (!operation || ['SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELED'].includes(operation.state)) return;
    const timer = window.setTimeout(() => {
      void api<OperationDto>(`/api/operations/${operation.id}`).then(setOperation).catch((cause: Error) => setError(cause.message));
    }, 1500);
    return () => clearTimeout(timer);
  }, [operation, token]);

  async function check() {
    setBusy(true); setError('');
    try {
      setOperation(await api<OperationDto>('/api/operations/check', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ networkId: foundation!.networkId }),
      }));
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  return <main>
    <header><div><span className="eyebrow">BESU / QBFT</span><h1>Console d’exploitation</h1><p>Explorateur en lecture seule · index persistant</p></div><span className="badge">v0.1</span></header>
    {error && <p role="alert" className="error">{error}</p>}
    {!roles.length ? <section><h2>Connexion</h2>
      {configuration?.mode === 'development' ? <form onSubmit={event => { event.preventDefault(); setToken(draftToken); setDraftToken(''); }}>
        <label htmlFor="token">Jeton du laboratoire isolé</label><input id="token" type="password" autoComplete="off" required value={draftToken} onChange={event => setDraftToken(event.target.value)} />
        <p>Obtenez votre jeton local avec <code>npm run lab:credentials</code>. Il reste en mémoire dans cette page.</p><button type="submit">Se connecter</button>
      </form> : <button disabled={!manager} onClick={() => void manager?.signinRedirect().catch(() => setError('Connexion OIDC impossible.'))}>Se connecter avec OIDC</button>}
    </section> : <>
      <div className="session"><span>Rôles : {roles.join(', ')}</span><button className="secondary" onClick={() => { setToken(''); setFoundation(undefined); setOperation(undefined); setRoles([]); if (manager) void manager.signoutRedirect(); }}>Se déconnecter</button></div>
      <nav className="main-nav" aria-label="Console"><button className={tab==='explorer'?'':'secondary'} onClick={()=>setTab('explorer')}>Explorateur</button><button className={tab==='foundation'?'':'secondary'} onClick={()=>setTab('foundation')}>Socle et inventaire</button></nav>
      {tab==='explorer'?<Explorer api={api} administrator={roles.includes('Administrator')}/>:foundation?<>
      <section className="warning"><strong>{foundation.warning}</strong></section>
      <div className="stats"><section><span>Chain ID</span><strong>{foundation.chainId}</strong></section><section><span>Instances déclarées</span><strong>{foundation.instances.length}</strong></section><section><span>Domaines de panne déclarés</span><strong>{foundation.physicalFailureDomains}</strong></section></div>
      <section><h2>Instances du laboratoire</h2><p>Chaque instance possède ses données, sa clé, son service et ses ports. L’usage « consensus » ne constitue pas une observation du rôle validateur effectif.</p>
        <div className="table"><table><thead><tr><th>Service</th><th>Machine</th><th>Usage</th><th>Ports hôte réservés</th></tr></thead><tbody>{foundation.instances.map(instance => <tr key={instance.id}><td>{instance.serviceName}</td><td>{foundation.machines.find(machine => machine.id === instance.machineId)?.name}</td><td>{instance.purpose}</td><td>{instance.ports.map(port => `${port.purpose} ${port.port}/${port.protocol}`).join(' · ')}</td></tr>)}</tbody></table></div>
      </section>
      <section><h2>Vérification du socle</h2><p>Le worker contrôle la présence du réseau et compte les instances en base. Cette opération ne teste pas le consensus.</p>
        {roles.includes('Administrator') ? <button disabled={busy || !!operation && ['QUEUED', 'RUNNING', 'VERIFYING'].includes(operation.state)} onClick={() => void check()}>Vérifier PostgreSQL via le worker</button> : <p>Le rôle Administrator est requis pour lancer cette vérification.</p>}
        {operation && <div aria-live="polite"><p>Job <code>{operation.id}</code> : <strong>{operation.state}</strong></p>{operation.evidence && 'instanceCount'in operation.evidence && <p>Preuve : base joignable, {operation.evidence.instanceCount} instances · {operation.evidence.checkedAt}</p>}</div>}
      </section>
      </>:<section><h2>Inventaire</h2><p>Aucun inventaire de machine gérée n’est disponible pour cette installation.</p></section>}
    </>}
    <footer>Besu fonctionne indépendamment de la console. Aucune clé de compte applicatif n’est confiée au serveur.</footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
