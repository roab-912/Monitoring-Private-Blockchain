import React,{useEffect,useState} from 'react';
import type { BlockDto,ConnectionInput,IndexStatusDto,LogDto,TransactionDto } from '../../packages/contracts/explorer.js';
import type { OperationDto } from '../../packages/contracts/api.js';
type Api=<T>(path:string,options?:RequestInit)=>Promise<T>;
type Page<T>={items:T[];nextCursor:string|null};
const short=(value:string)=>`${value.slice(0,12)}…${value.slice(-8)}`;
const addressLink=(address:string)=><a href={`#/addresses/${address}`} title={address}>{short(address)}</a>;
const txLink=(hash:string)=><a href={`#/transactions/${hash}`} title={hash}>{short(hash)}</a>;
function timestamp(seconds:string) {
  const ms=BigInt(seconds)*1000n;
  return ms<=8640000000000000n?new Date(Number(ms)).toISOString():`${seconds} secondes Unix`;
}
const stateLabels:Record<string,string>={UNCONFIGURED:'Connexion à configurer',CONNECTING:'Vérification initiale',INDEXING:'Rattrapage de l’index',CAUGHT_UP:'Index à jour lors de la dernière observation',RPC_UNAVAILABLE:'Source RPC inaccessible',DIVERGED:'Désaccord des sources — indexation suspendue',INVALID_SOURCE:'Source refusée',MISSING_RECEIPT:'Reçu manquant — bloc non enregistré',INVALID_DATA:'Données RPC incohérentes',LIMIT_EXCEEDED:'Limite de traitement atteinte',INDEX_ERROR:'Erreur de persistance de l’index'};
function errorText(code:string) {
  const labels:Record<string,string>={GENESIS_MISMATCH:'Le bloc genesis de la source ne correspond pas au réseau attendu.',CHAIN_ID_MISMATCH:'L’identifiant de chaîne ou de réseau ne correspond pas.',SOURCES_DIVERGED:'Les sources ne concordent pas à la même hauteur.',CONNECTION_PLAN_STALE:'La connexion a changé pendant la vérification. Préparez une nouvelle demande.',UNSUPPORTED_BESU_VERSION:'La version Besu de cette source ne fait pas partie du profil vérifié.',RPC_CAPABILITY_ERROR:'Les méthodes RPC de lecture requises ne sont pas disponibles.',UNKNOWN_SOURCE:'La source doit être autorisée dans la configuration de l’opérateur.'};
  return labels[code]??`Vérification interrompue : ${code}`;
}

function TransactionTable({items}:{items:TransactionDto[]}) {
  return <div className="table"><table><thead><tr><th>Transaction</th><th>Bloc</th><th>Résultat du reçu</th><th>Type</th><th>De</th><th>Vers</th><th>Valeur exacte (wei)</th></tr></thead><tbody>{items.map(tx=><tr key={tx.hash}>
    <td>{txLink(tx.hash)}</td><td><a href={`#/blocks/${tx.blockHeight}`}>{tx.blockHeight}</a></td><td><span className={`result ${tx.receipt.status}`}>{tx.receipt.status==='success'?'Réussie':'Annulée (revert)'}</span></td>
    <td>{tx.kind==='creation'?'Création de contrat':'Transaction'}</td><td>{addressLink(tx.sender)}</td><td>{tx.recipient?addressLink(tx.recipient):tx.receipt.contractAddress?addressLink(tx.receipt.contractAddress):'Création sans adresse de contrat'}</td><td>{tx.valueWei}</td>
  </tr>)}</tbody></table>{!items.length&&<p>Aucune transaction dans cette page de l’historique indexé.</p>}</div>;
}
function Pagination({next,cursor,onNext,onReset}:{next:string|null;cursor:string|undefined;onNext:(cursor:string)=>void;onReset:()=>void}) {
  return <div className="pagination">{cursor&&<button className="secondary" onClick={onReset}>Revenir aux plus récents</button>}<button className="secondary" disabled={!next} onClick={()=>next&&onNext(next)}>Page suivante</button></div>;
}
function Transactions({api,path}:{api:Api;path:string}) {
  const [page,setPage]=useState<Page<TransactionDto>>();const [cursor,setCursor]=useState<string>();const [error,setError]=useState('');
  useEffect(()=>{let active=true;setError('');void api<Page<TransactionDto>>(`${path}?limit=20${cursor?`&before=${encodeURIComponent(cursor)}`:''}`).then(data=>{if(active)setPage(data);}).catch(()=>{if(active)setError('Liste des transactions indisponible.');});return()=>{active=false;};},[path,cursor]);
  return <>{error&&<p role="alert">{error}</p>}{page?<><TransactionTable items={page.items}/><Pagination cursor={cursor} next={page.nextCursor} onNext={setCursor} onReset={()=>setCursor(undefined)}/></>:<p>Chargement des transactions…</p>}</>;
}
function Logs({api,filter}:{api:Api;filter:string}) {
  const [page,setPage]=useState<Page<LogDto>>();const [cursor,setCursor]=useState<string>();const [error,setError]=useState('');
  useEffect(()=>{let active=true;void api<Page<LogDto>>(`/api/explorer/logs?limit=20&${filter}${cursor?`&before=${encodeURIComponent(cursor)}`:''}`).then(data=>{if(active){setPage(data);setError('');}}).catch(()=>{if(active)setError('Logs indisponibles.');});return()=>{active=false;};},[filter,cursor]);
  return <section><h2>Logs bruts</h2><p>Topics et données enregistrés sur chaîne, sans décodage ABI.</p>{error&&<p role="alert">{error}</p>}{page?<><div className="logs">{page.items.map(log=><article key={`${log.blockHeight}:${log.logIndex}`}><p>Bloc <a href={`#/blocks/${log.blockHeight}`}>{log.blockHeight}</a> · log {log.logIndex} · {txLink(log.transactionHash)} · {addressLink(log.address)}</p><dl><dt>Topics</dt><dd><pre>{log.topics.join('\n')||'Aucun topic'}</pre></dd><dt>Données</dt><dd><pre>{log.data}</pre></dd></dl></article>)}</div>{!page.items.length&&<p>Aucun log dans cette page.</p>}<Pagination cursor={cursor} next={page.nextCursor} onNext={setCursor} onReset={()=>setCursor(undefined)}/></>:<p>Chargement des logs…</p>}</section>;
}
function Blocks({api}:{api:Api}) {
  const [page,setPage]=useState<Page<BlockDto>>();const [cursor,setCursor]=useState<string>();const [error,setError]=useState('');
  useEffect(()=>{let active=true;void api<Page<BlockDto>>(`/api/explorer/blocks?limit=20${cursor?`&before=${cursor}`:''}`).then(data=>{if(active){setPage(data);setError('');}}).catch(()=>{if(active)setError('Blocs indisponibles.');});return()=>{active=false;};},[cursor]);
  return <section><h2>Blocs indexés</h2>{error&&<p role="alert">{error}</p>}{page?<><div className="table"><table><thead><tr><th>Bloc</th><th>Hash</th><th>Transactions</th><th>Horodatage du bloc</th><th>Source</th></tr></thead><tbody>{page.items.map(block=><tr key={block.hash}><td><a href={`#/blocks/${block.height}`}>{block.height}</a></td><td title={block.hash}>{short(block.hash)}</td><td>{block.transactionCount}</td><td>{timestamp(block.timestamp)}</td><td>{block.sourceIds.join(', ')}</td></tr>)}</tbody></table></div>{!page.items.length&&<p>Aucun bloc n’a encore été indexé.</p>}<Pagination cursor={cursor} next={page.nextCursor} onNext={setCursor} onReset={()=>setCursor(undefined)}/></>:<p>Chargement des blocs…</p>}</section>;
}
function Block({api,height}:{api:Api;height:string}) {
  const [block,setBlock]=useState<BlockDto>();const [error,setError]=useState('');
  useEffect(()=>{let active=true;void api<BlockDto>(`/api/explorer/blocks/${encodeURIComponent(height)}`).then(data=>{if(active)setBlock(data);}).catch(()=>{if(active)setError('Ce bloc est absent de l’index ou le service est indisponible.');});return()=>{active=false;};},[height]);
  return <>{error&&<p role="alert">{error}</p>}{block&&<><section><h2>Bloc {block.height}</h2><dl><dt>Hash</dt><dd>{block.hash}</dd><dt>Parent</dt><dd>{block.parentHash}</dd><dt>State root</dt><dd>{block.stateRoot}</dd><dt>Horodatage</dt><dd>{timestamp(block.timestamp)}</dd><dt>Gas utilisé / limite</dt><dd>{block.gasUsed} / {block.gasLimit}</dd><dt>Proposeur / bénéficiaire</dt><dd>{addressLink(block.miner)}</dd><dt>Source / indexation</dt><dd>{block.sourceIds.join(', ')} · {block.indexedAt}</dd></dl></section><section><h2>Transactions du bloc</h2><Transactions api={api} path={`/api/explorer/blocks/${block.height}/transactions`}/></section></>}</>;
}
function Transaction({api,hash}:{api:Api;hash:string}) {
  const [tx,setTx]=useState<TransactionDto>();const [error,setError]=useState('');
  useEffect(()=>{let active=true;void api<TransactionDto>(`/api/explorer/transactions/${encodeURIComponent(hash)}`).then(data=>{if(active)setTx(data);}).catch(()=>{if(active)setError('Transaction absente de l’index ou service indisponible. Aucun reçu réussi ne peut être déduit.');});return()=>{active=false;};},[hash]);
  return <>{error&&<p role="alert">{error}</p>}{tx&&<><section><h2>Transaction</h2><dl><dt>Hash</dt><dd>{tx.hash}</dd><dt>Bloc</dt><dd><a href={`#/blocks/${tx.blockHeight}`}>{tx.blockHeight}</a> · {timestamp(tx.timestamp)}</dd><dt>Type</dt><dd>{tx.kind==='creation'?'Création de contrat':'Transaction'}</dd><dt>De</dt><dd>{addressLink(tx.sender)}</dd><dt>Vers</dt><dd>{tx.recipient?addressLink(tx.recipient):'Création de contrat'}</dd><dt>Valeur exacte</dt><dd>{tx.valueWei} wei</dd><dt>Nonce</dt><dd>{tx.nonce}</dd><dt>Gas / prix du gas</dt><dd>{tx.gas} / {tx.gasPrice??'Non renvoyé'}</dd><dt>Données d’entrée</dt><dd><pre>{tx.input}</pre></dd><dt>Source / indexation</dt><dd>{tx.sourceIds.join(', ')} · {tx.indexedAt}</dd></dl></section><section><h2>Reçu indexé</h2><dl><dt>Résultat d’exécution</dt><dd className={tx.receipt.status}>{tx.receipt.status==='success'?'Réussie':'Annulée (revert)'}</dd><dt>Gas consommé</dt><dd>{tx.receipt.gasUsed}</dd><dt>Gas cumulé dans le bloc</dt><dd>{tx.receipt.cumulativeGasUsed}</dd><dt>Prix effectif du gas</dt><dd>{tx.receipt.effectiveGasPrice??'Non renvoyé'}</dd>{tx.receipt.contractAddress&&<><dt>Contrat créé</dt><dd>{addressLink(tx.receipt.contractAddress)}</dd></>}</dl></section><Logs api={api} filter={`transactionHash=${tx.hash}`}/></>}</>;
}
function Address({api,address}:{api:Api;address:string}) {
  const [data,setData]=useState<{address:string;transactionCount:string;logCount:string;observedContractCreation:boolean}>();const [error,setError]=useState('');
  useEffect(()=>{let active=true;void api<typeof data>(`/api/explorer/addresses/${encodeURIComponent(address)}`).then(result=>{if(active)setData(result);}).catch(()=>{if(active)setError('Historique de l’adresse indisponible.');});return()=>{active=false;};},[address]);
  return <>{error&&<p role="alert">{error}</p>}{data&&<><section><h2>Adresse</h2><p className="full-hash">{data.address}</p><p>{data.transactionCount} transactions · {data.logCount} logs émis dans l’index</p><p>{data.observedContractCreation?'Création de contrat observée dans l’index.':'Aucune création de contrat observée dans l’index.'} L’historique affiché ne fournit pas le solde courant ni les transferts internes.</p></section><section><h2>Historique des transactions</h2><Transactions api={api} path={`/api/explorer/addresses/${data.address}/transactions`}/></section><Logs api={api} filter={`address=${data.address}`}/></>}</>;
}
function Connection({api,status,onChanged}:{api:Api;status:IndexStatusDto;onChanged:()=>void}) {
  const [sources,setSources]=useState<{id:string;label:string}[]>([]);
  const [input,setInput]=useState<ConnectionInput>({name:status.network?.name??'',chainId:status.network?.chainId??'1337',networkId:status.network?.networkId??'1337',genesisHash:status.network?.genesisHash??'',sourceIds:status.sourceIds});
  const [job,setJob]=useState<OperationDto>();const [error,setError]=useState('');const [submitting,setSubmitting]=useState(false);
  const pending=!!job&&['QUEUED','RUNNING','VERIFYING'].includes(job.state);
  useEffect(()=>{void api<typeof sources>('/api/explorer/sources').then(setSources).catch(()=>setError('Sources autorisées indisponibles.'));},[]);
  useEffect(()=>{
    if(!pending||!job)return;let polling=false;const timer=setInterval(()=>{if(polling)return;polling=true;void api<OperationDto>(`/api/operations/${job.id}`).then(result=>{setJob(result);setError('');if(result.state==='SUCCEEDED')onChanged();}).catch(()=>setError('Suivi du job indisponible ; aucun succès confirmé.')).finally(()=>{polling=false;});},1500);
    return()=>clearTimeout(timer);
  },[job?.id,pending]);
  return <section><h2>Connexion à une chaîne existante</h2><p>La connexion active est remplacée uniquement après vérification du chain ID, du genesis, de la version et des capacités des sources. Les données de chaîne et la configuration Besu restent intactes.</p>
    <form onSubmit={event=>{event.preventDefault();setSubmitting(true);setError('');void api<OperationDto>('/api/explorer/connection',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(input)}).then(setJob).catch(()=>setError('Demande refusée ou service indisponible.')).finally(()=>setSubmitting(false));}}>
      <fieldset disabled={pending||submitting}><div className="form-grid">{([['name','Nom du réseau'],['chainId','Chain ID attendu (décimal)'],['networkId','Network ID P2P attendu (décimal)'],['genesisHash','Hash du bloc genesis attendu']] as const).map(([field,label])=><label key={field}>{label}<input name={field} required value={input[field]} maxLength={field==='name'?100:field==='genesisHash'?66:78} pattern={field==='name'?undefined:field==='genesisHash'?'0x[0-9a-fA-F]{64}':'(0|[1-9][0-9]{0,77})'} onChange={event=>setInput({...input,[field]:event.target.value})}/></label>)}</div>
      <p>Sources autorisées par l’opérateur (une à trois)</p>{sources.map(source=><label className="checkbox" key={source.id}><input type="checkbox" checked={input.sourceIds.includes(source.id)} onChange={event=>setInput({...input,sourceIds:event.target.checked?[...input.sourceIds,source.id]:input.sourceIds.filter(id=>id!==source.id)})}/>{source.label}</label>)}
      {!sources.length&&<p>Aucune source autorisée n’est configurée. L’opérateur doit renseigner le fichier RPC_SOURCES_FILE.</p>}
      <button disabled={!input.sourceIds.length||input.sourceIds.length>3} type="submit">Vérifier et enregistrer la connexion</button></fieldset>
    </form>{error&&<p role="alert" className="error">{error}</p>}{job&&<div aria-live="polite"><p>Job de connexion <code>{job.id}</code> : <strong>{job.state}</strong></p>{job.errorCode&&<p role="alert">{errorText(job.errorCode)}</p>}{job.state==='SUCCEEDED'&&job.evidence&&'genesisHash'in job.evidence&&<p>Connexion vérifiée au genesis <code>{job.evidence.genesisHash}</code>, le {job.evidence.checkedAt}.</p>}</div>}
  </section>;
}

export function Explorer({api,administrator}:{api:Api;administrator:boolean}) {
  const [status,setStatus]=useState<IndexStatusDto>();const [error,setError]=useState('');const [query,setQuery]=useState('');
  const [route,setRoute]=useState(location.hash.slice(1)||'/network');
  const refresh=()=>{void api<IndexStatusDto>('/api/explorer/status').then(setStatus).catch(()=>setError('État de l’index indisponible. Les données affichées peuvent être périmées.'));};
  useEffect(()=>{refresh();const timer=setInterval(refresh,5000);const navigate=()=>{setRoute(location.hash.slice(1)||'/network');setError('');};window.addEventListener('hashchange',navigate);return()=>{clearInterval(timer);window.removeEventListener('hashchange',navigate);};},[]);
  const segments=route.split('/');
  return <div className="explorer"><nav className="subnav" aria-label="Explorateur"><a href="#/network" aria-current={route==='/network'?'page':undefined}>Réseau</a><a href="#/blocks" aria-current={segments[1]==='blocks'?'page':undefined}>Blocs</a><a href="#/transactions" aria-current={segments[1]==='transactions'?'page':undefined}>Transactions</a></nav>
    <form className="search" onSubmit={event=>{event.preventDefault();setError('');void api<{kind:string;value:string}>(`/api/explorer/search?q=${encodeURIComponent(query.trim())}`).then(result=>{if(result.kind==='not_found'){setError('Aucun résultat dans l’historique indexé. Vérifiez la couverture et le retard de l’index.');return;}location.hash=`/${result.kind==='block'?'blocks':result.kind==='transaction'?'transactions':'addresses'}/${result.value}`;}).catch(()=>setError('Recherche refusée ou indisponible. Utilisez un numéro de bloc, un hash ou une adresse.'));}}><label htmlFor="chain-search">Rechercher un numéro de bloc, un hash ou une adresse</label><div><input id="chain-search" value={query} onChange={event=>setQuery(event.target.value)} required maxLength={80}/><button>Rechercher</button></div></form>
    {error&&<p role="alert" className="error">{error}</p>}
    {status&&<><section className={`index-status ${status.observationStale||status.incidentCode?'warning':''}`} aria-label="État de l’index"><strong>{stateLabels[status.state]??status.state}</strong><p>Dernier bloc indexé : {status.indexedHeight??'aucun'} · dernière tête observée : {status.observedHead??'inconnue'} · retard observé : {status.lag??'inconnu'} blocs</p><p>{status.observationStale?'Observation périmée ou absente':'Observation récente'} · observation : {status.lastObservedAt??'jamais'} · indexation : {status.lastIndexedAt??'jamais'}</p>{status.incidentCode&&<p role="alert">Incident : {status.incidentCode}{status.incidentHeight!==null?` au bloc ${status.incidentHeight}`:''}. L’historique vérifié est conservé.</p>}</section>
      {route==='/network'||!status.network?<><section><h2>Réseau observé</h2>{status.network?<><dl><dt>Nom / origine</dt><dd>{status.network.name} · {status.network.ownership==='managed'?'Réseau géré':'Réseau importé, lecture seule'}</dd><dt>Chain ID / Network ID</dt><dd>{status.network.chainId} / {status.network.networkId}</dd><dt>Hash du bloc genesis</dt><dd>{status.network.genesisHash}</dd><dt>Couverture de l’index</dt><dd>{status.blockCount} blocs, {status.transactionCount} transactions, {status.logCount} logs</dd></dl><h3>Sources de la dernière observation</h3>{status.observations.map(source=><article className="source" key={source.sourceId}><strong>{source.label}</strong><p>{source.version} · hauteur {source.head} · {source.observedAt}</p><p>Capacités vérifiées : {source.capabilities.join(', ')}</p></article>)}<p>{status.sourceIds.length} source(s) configurée(s). Leur concordance ne mesure pas l’indépendance des domaines de panne.</p></>:<p>Aucune connexion active vérifiée.</p>}</section>{administrator&&<Connection api={api} status={status} onChanged={refresh}/>}</>:
      segments[1]==='blocks'&&segments[2]?<Block key={`${status.network.id}:${route}`} api={api} height={segments[2]}/>:
      route==='/blocks'?<Blocks key={`${status.network.id}:blocks`} api={api}/>:
      segments[1]==='transactions'&&segments[2]?<Transaction key={`${status.network.id}:${route}`} api={api} hash={segments[2]}/>:
      route==='/transactions'?<section><h2>Transactions indexées</h2><Transactions key={status.network.id} api={api} path="/api/explorer/transactions"/></section>:
      segments[1]==='addresses'&&segments[2]?<Address key={`${status.network.id}:${route}`} api={api} address={segments[2]}/>:<p>Page inconnue. <a href="#/network">Revenir au réseau</a></p>}
    </>}
  </div>;
}
