# Exploiter l'explorateur v0.1

## Démarrer et consulter

Utiliser Node 24.22.1 / npm 11.19.1, puis `npm ci --ignore-scripts` et `npm run lab:up`. La migration et le bootstrap du laboratoire créent la connexion initiale vérifiée ; le worker indexe depuis le bloc zéro. Les clés et données v0.0 sont conservées.

Ouvrir http://127.0.0.1:3000 et se connecter avec un jeton obtenu dans son terminal par `npm run lab:credentials`. L'onglet Explorateur donne accès à Réseau, Blocs, Transactions et la recherche par numéro, hash ou adresse. Les pages distinguent création de contrat, reçu réussi, revert et logs bruts. L'onglet Socle et inventaire conserve les fonctions v0.0.

L'état indique le dernier bloc indexé, la hauteur commune annoncée par les sources, le retard, la dernière observation et la dernière indexation. Le minimum des hauteurs des sources borne la couverture disponible sur toutes les sources. Une observation périmée ou une source RPC inaccessible ne prouve pas un arrêt de la blockchain. Les données déjà indexées restent consultables. Un résultat absent de l'index ne prouve pas l'absence de transaction sur chaîne.

Les liens Page suivante utilisent une pagination exclusive ; Revenir aux plus récents repart de la tête de l'index. La recherche ne déclenche aucune requête RPC arbitraire. Les données retournées portent leur networkId et leur provenance.

## Enregistrer une connexion externe

Un opérateur configure d'abord les sources accessibles au worker. Exemple de fichier public, sans credentials :

```json
[
  {
    "id": "rpc-reference",
    "label": "Source de référence",
    "url": "http://192.168.50.10:8545",
    "allowedCidrs": ["192.168.50.10/32"]
  }
]
```

Définir `RPC_SOURCES_FILE` pour l'API et le worker, monter le fichier en lecture seule et autoriser explicitement le flux réseau du worker vers cette IP/ce port. Dans Compose, le fichier du laboratoire est `infra/compose/rpc-sources.json`. Utiliser des IDs stables, des plages aussi étroites que possible et du HTTPS hors laboratoire. Les résolutions DNS sont contrôlées à chaque appel et l'adresse validée est fixée pour la connexion. Les redirections et credentials dans l'URL sont refusés ; ne pas désactiver TLS pour contourner une erreur de certificat.

Dans Réseau, un Administrator renseigne le nom pour un premier enregistrement, chainId décimal, networkId P2P décimal et **hash du bloc genesis attendu**, obtenu par une référence de confiance. Il sélectionne une à trois sources puis lance Vérifier et enregistrer la connexion. L'écran suit le job : QUEUED, RUNNING puis SUCCEEDED ou échec explicite. Un mauvais genesis échoue même si le chainId correspond. Les versions autres que Besu 26.9.0 et les capacités manquantes sont refusées dans ce profil.

Une vérification réussie remplace la connexion active ; l'index repart de son curseur existant ou du bloc zéro pour cette identité. L'historique des autres identités est conservé en base mais n'est pas indexé en parallèle ni proposé dans un sélecteur multi-réseaux. Un réseau connu conserve son nom et son origine. Importer n'adopte aucune machine et n'autorise aucune installation, promotion ou mutation de chaîne.

Une API directe équivalente est décrite dans `docs/generated/openapi.json` : POST `/api/explorer/connection`, en-tête Idempotency-Key, puis GET `/api/operations/<id>`. Le plan est immuable, son idempotence est persistante et une génération devenue périmée entraîne CONNECTION_PLAN_STALE. Le fichier genesis original d'un réseau importé n'est pas inventé à partir du bloc zéro.

## Reprise et incidents

- Arrêt du worker : le curseur persiste ; la fraîcheur devient périmée après quinze secondes. Redémarrer `docker compose --env-file .runtime/lab/compose.env -f infra/compose/compose.yaml start worker`. Un bloc partiellement traité est repris sans doublon.
- RPC_UNAVAILABLE : vérifier service, route réseau, DNS, whitelist et TLS de la source configurée. Aucun historique n'est effacé. Les autres validateurs peuvent continuer leur consensus.
- DIVERGED / CHECKPOINT_MISMATCH / PARENT_HASH_MISMATCH : vérifier identité, hash à même hauteur et provenance des sources. Ne pas supprimer le curseur, réécrire un genesis ou forcer les validateurs. L'index reprend seulement lorsque ses préconditions redeviennent cohérentes.
- MISSING_RECEIPT : le bloc incomplet n'est pas committé. Le reçu absent n'est jamais assimilé à un succès. Vérifier la disponibilité de l'historique sur les sources.
- INVALID_SOURCE : vérifier chainId, networkId, genesis, version et configuration des sources. Un échec de connexion ne remplace pas la connexion précédemment vérifiée.
- INDEX_ERROR / INDEX_DATABASE_ERROR : vérifier migrations, droits et stockage PostgreSQL ; ce code n'attribue pas le défaut aux RPC.
- LIMIT_EXCEEDED / INVALID_DATA : vérifier limites de volume et données renvoyées. Aucun résultat tronqué n'est présenté comme complet.
- HTTP 429 : respecter Retry-After. Quotas partagés entre les onglets d'une même identité : 120 lectures et 10 soumissions par minute, persistés en base.

La rétention de l'index et une procédure de remise à zéro destructrice ne sont pas livrées. Sauvegarder PostgreSQL selon DATABASE.md avant toute maintenance manuelle ; l'exercice de restauration depuis dump reste non qualifié.

## Qualification reproductible

Exécuter séquentiellement, avec les services locaux et sans lancer les tests UI pendant les interruptions :

```sh
npm run check
npm run lab:verify
npm run lab:explorer:verify
npm run test:ui
```

`lab:verify` rejoue T01 et les six intégrations PostgreSQL, et conserve les preuves sous `docs/evidence/v0.1/regression-v0.0`. `lab:explorer:verify` soumet un transfert de 9007199254740993 wei, contrôle les données du témoin, tue le worker par SIGKILL, arrête le nœud RPC et vérifie reprises/fraîcheur/historique. Il démarre temporairement un Besu sans P2P, avec une identité et un genesis distincts mais le même chainId, pour T03, puis l'arrête. Les volumes de la chaîne principale ne sont jamais supprimés.

La qualification teste aussi une importation vérifiée dans une base temporaire isolée, et injecte des réponses RPC divergentes, un parentHash erroné et un reçu manquant à partir de lectures de Besu réel. Ces injections valident les protections de l'indexeur ; elles ne prouvent pas un fork byzantin. Une contrainte SQL temporaire dans la seule base de test provoque une erreur de persistance, suivie d'une reprise. Les preuves publiques sont sous `docs/evidence/v0.1` et aucun secret n'y figure.
