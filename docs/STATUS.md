# État de réalisation

Version atteinte : **v0.1.0 — explorateur et connexion vérifiée, qualifiés sur le laboratoire local décrit ci-dessous**. Date : 29 octobre 2026. v0.2 n'est pas commencée.

## Critères v0.1

| Critère | Preuve exécutée |
| --- | --- |
| Blocs et transactions réels | Index du laboratoire Besu 26.9.0, lecture des blocs/transactions/reçus/logs dans l'API et l'interface. Recherche et pagination exclusive vérifiées. |
| Succès, revert, création et logs distincts | Contrat témoin réel, reçus status=success/reverted, création et adresse créée, logs bruts et valeur de l'événement vérifiés. Transfert réel de `9007199254740993` wei restitué exactement. |
| Arrêt/reprise de l'indexeur (T02) | Worker tué par SIGKILL puis redémarré ; préfixe conservé, curseur avancé, blocs contigus depuis zéro et autant de reçus que de transactions, sans doublon. |
| Panne RPC et fraîcheur | Nœud RPC non validateur arrêté ; index suspendu, observation périmée après quinze secondes, historique et reçus toujours servis depuis PostgreSQL ; reprise après retour de la source. |
| Mauvais genesis, même chainId (T03) | Besu supplémentaire isolé du P2P avec une identité distincte, chainId 1337 et un autre genesis ; job FAILED/GENESIS_MISMATCH, connexion active inchangée. |
| Rôles et quotas | Lectures autorisées pour les cinq rôles, 401 anonyme, 403 Viewer sur connexion/sources administrateur, limites de pagination et quota PostgreSQL 120 lectures/minute conservé après recréation du serveur, HTTP 429/Retry-After. |

## Livraison v0.1 et choix

- Connexion active unique, inscription par job `network.connect`, identité chainId/networkId/hash de genesis vérifiée par le worker, capacités RPC exercées et versions Besu limitées au profil 26.9.0. Origines managed/imported distinctes ; aucun fichier genesis inventé pour un import. Les données du réseau ne sont pas modifiées.
- Sources approuvées dans `RPC_SOURCES_FILE`, URL hors saisie navigateur, contrôle des IP résolues puis fixation de l'adresse TCP, refus des redirections/credentials URL et liste de méthodes strictement en lecture. Le worker rejoint le réseau privé chain ; l'API reste isolée.
- Migrations additives 003 et 004 : index, curseur, connexion et quotas persistants ; erreur de persistance distinguée d'une panne RPC. Les migrations 001/002 sont conservées.
- Bloc, transactions, reçus, logs et curseur committés atomiquement ; contraintes d'unicité, verrou par réseau, parentHash/checkpoint et génération active revérifiés. Une divergence ou un reçu manquant bloque l'avancement sans effacer l'historique.
- Pages Réseau/Blocs/Transactions/Adresse, recherche, pagination, source et timestamps. L'onglet Socle et inventaire conserve le parcours v0.0. Quantités exactes en bigint/numeric/chaînes ; aucune conversion en flottant pour les montants ou hauteurs.

Les sceaux et rounds QBFT peuvent différer entre nœuds pour un même hash de chaîne : seule cette partie de l'extraData non genesis est neutralisée lors de la comparaison. Ce comportement a été observé sur le laboratoire puis vérifié dans le code Besu épinglé ; il ne constitue pas un contrôle des signatures. Décision détaillée dans [ADR-007](adr/007-explorer-indexing.md).

## Vérifications exécutées le 29 octobre 2026

- `npm run check` : pins, ESLint, TypeScript, **11 tests unitaires réussis**, build React, compilation du témoin et génération OpenAPI ; aucune nouvelle dépendance introduite. `npm ci --ignore-scripts` exécuté dans la construction Linux : audit npm sans vulnérabilité signalée.
- `npm run lab:up` : migration additive, identités et volumes existants conservés, bootstrap de la connexion locale et indexation réelle jusqu'à la tête commune.
- `npm run lab:verify` : **T01 réussi sur Besu réel**, identités/données/témoin/reçus/logs conservés après down/up, nouvelle transaction incluse et production maintenue sans API/worker. **6 tests d'intégration PostgreSQL réussis**, dont inscription concurrente idempotente, grandes valeurs, RBAC et quotas persistants.
- `npm run lab:explorer:verify` : **T02/T03 et panne RPC réussis sur Besu réel**, lecture API des données du témoin, transfert supérieur à la précision Number, recherche et pagination. Importation valide vérifiée et indexée dans une base temporaire distincte.
- Injections séparées : hash divergent sur une source, parentHash erroné sur les deux et reçu manquant à partir de lectures réelles ; avancement bloqué, historique conservé et aucune transaction réussie inventée. Ces essais ne constituent pas la création d'un fork byzantin réel. Une erreur d'écriture SQL est testée uniquement dans une base temporaire, avec reprise après retrait de la contrainte de test.
- `npm run test:ui` : **7 parcours Chromium réussis** au dernier rejeu : exploration/pagination/recherche, succès/revert/création/logs/adresse, connexion vérifiée via le worker, absence de reçu inventé et trois régressions du socle. Le premier passage avait 6 réussites sur 7 ; le test corrigé réclamait à tort une nouvelle connexion après une navigation de fragment conservant la session.
- Contrôle local des clés/credentials générés dans les fichiers livrés : aucune correspondance détectée sur 118 fichiers. `git diff --check` sans erreur ; aucun commit, tag, push, PR ou déploiement distant réalisé.

Les preuves publiques de v0.1 sont sous [evidence/v0.1](evidence/v0.1/), avec les résultats T01 sous `regression-v0.0`. Les preuves historiques v0.0 ci-dessous sont conservées. Les fichiers sont horodatés et ne contiennent aucun secret. Les interruptions concernent exclusivement le laboratoire de ce dépôt ; les services sont rétablis après les tests et le Besu de genesis étranger est arrêté.

## Limites v0.1

- Qualification sur Windows x64 + Docker Desktop/WSL2, moteur Linux/amd64, Node 24.22.1, npm 11.19.1, PostgreSQL 18.6, Besu 26.9.0 et BONSAI/FULL. Images externes épinglées par digest et dépendances inchangées. Linux natif, arm64/macOS, volumétrie longue et performances : **non exécutés**.
- Une seule connexion active. Son activation peut lancer un rattrapage depuis zéro ; les anciennes identités restent en base mais ne sont pas explorées en parallèle. Une source unique ne fournit pas de comparaison croisée.
- Arrêt conservateur si une source configurée ne répond pas. La fraîcheur RPC, la fraîcheur de l'index et le consensus restent des notions distinctes ; aucun diagnostic de quorum ou d'hôte n'est ajouté avant v0.3.
- Activité directe des adresses et logs bruts seulement : **pas de solde courant, transferts internes, mempool, ABI, signature ou garantie d'archive d'états historiques**. Un reçu manquant bloque le bloc entier. Limites : 50 éléments/page, 8 Mio/réponse RPC, 2048 transactions et 4096 logs/bloc ; grands volumes hors qualification.
- Authentification spécifique des RPC externes non prise en charge ; ce profil utilise des endpoints privés sans credentials dans l'URL ou HTTPS standard. Le parcours OIDC réel, révocation/rotation et TLS de production restent **non qualifiés**, comme en v0.0.
- Sauvegarde/restauration PostgreSQL, sauvegardes Besu/PRA, installation SSH/local, votes et pannes distribuées restent **non exécutés et hors v0.1**. La CI est livrée mais n'a pas été exécutée à distance dans cette session.

## Historique de qualification v0.0 — 28 octobre 2026

Les sections suivantes décrivent le socle initial, conservé et rejoué en régression pour v0.1.

## Critères de sortie v0.0

| Critère | Résultat et preuve |
| --- | --- |
| Une commande démarre le laboratoire | `npm run lab:up`, après `npm ci --ignore-scripts`, initialise les identités locales puis démarre et attend les services. Exécuté avec le runtime épinglé. |
| Quatre validateurs et transaction témoin | Besu 26.9.0 réel ; quatre proposeurs observés ; ensembles latest/pending conformes sur les quatre validateurs ; cinquième nœud RPC absent du groupe ; déploiement et écriture inclus. |
| Redémarrage sans perte (T01) | `down` puis `up` sans suppression des volumes ; enodes réels et genesis conservés ; état, reçus et événement relus ; nouvelle transaction incluse. Voir before.json et after.json. |
| API protégée | Appel anonyme 401, mutation Viewer 403, Administrator 202 puis SUCCEEDED avec preuve PostgreSQL. Vérifié directement et dans Chromium. |
| Plusieurs instances sur une machine | Cinq instances en inventaire sur une machine. Intégration PostgreSQL : deux instances acceptées, collisions concurrentes de port et chemins imbriqués refusées. |
| Domaine de panne explicite | Un seul domaine physique dans l'inventaire et à l'écran ; testé dans Chromium. |

## Socle v0.0 conservé

React/TypeScript, API Fastify et worker, schémas TypeBox/OpenAPI générés, migrations PostgreSQL sous checksum, identités et ressources multi-instances, jobs persistants et preuve réelle du worker, contrôles de quorum/placement, OIDC/RBAC, profil local isolé, laboratoire QBFT et contrat témoin. Six décisions dans `docs/adr`, trois runbooks dans `docs/runbooks`.

Le job initial `foundation.check` reste une lecture de PostgreSQL avec plan immuable, étape, idempotence et lease. Son expiration devient NEEDS_ATTENTION. La v0.1 ajoute `network.connect` sans mutation d'infrastructure. Il n'existe aucun bouton d'installation, vote ou sauvegarde dans ces versions.

## Matrice et versions

| Élément | Exécuté / limite |
| --- | --- |
| Hôte opérateur | Windows x64, PowerShell, Docker Desktop 4.30.0 avec moteur Linux/amd64 via WSL2 |
| Docker / Compose | Engine 26.1.1, Compose 2.27.0-desktop.2 ; versions fonctionnelles observées, pas une qualification de production |
| Ressources du moteur | 8 CPU, environ 7,66 Gio de RAM ; un hôte physique ; petite chaîne de laboratoire |
| Besu | 26.9.0, Java 25 dans l'image ; QBFT par en-têtes, Berlin dès genesis, blocs de 2 s ; BONSAI/FULL |
| Application / base | Node 24.22.1, npm 11.19.1, PostgreSQL 18.6 ; dépendances/lockfile et images externes par digest |
| Compilation / UI | solc 0.8.38, evmVersion berlin ; Chromium 156.0.8078.4 / Playwright 1.64.1 |
| Linux natif amd64 | Profil prévu, UID/GID applicatif de l'opérateur et volumes Besu/PostgreSQL dédiés ; exécution sur un hôte Linux natif non réalisée ici |
| Linux arm64 / macOS | Images arm64 présentes au registre ; aucune qualification exécutée |

## Commandes et résultats initiaux v0.0

Le Node initial du poste (24.12.0) a été remplacé **pour ces commandes uniquement** par l'archive officielle Node 24.22.1 sous `.runtime/tools`, SHA-256 vérifié, via préfixage de PATH. Aucune configuration globale Node/Git n'a été modifiée.

- Diagnostic : `git -c safe.directory=<dépôt> status --short`, `docker version`, `docker compose version`, `docker info`, `wsl --status`. Docker Desktop était arrêté ; démarré en arrière-plan pour rendre l'intégration possible.
- Consultation des releases officielles, métadonnées npm et digests des index Docker ; `npm install --ignore-scripts` puis `npm ci --ignore-scripts` dans la construction Linux ; dépendances résolues sans forcer les peer dependencies.
- `npm run check` : épinglage, ESLint, TypeScript, **7 tests unitaires réussis**, build React, compilation Solidity et OpenAPI généré. Les tests OIDC vérifient cryptographiquement signature, issuer, audience, dates et rôles, avec un JWKS local de test.
- `npm audit` : **0 vulnérabilité signalée** après override tmp 0.2.7. Cela ne constitue pas une analyse complète de sécurité.
- `npm run lab:up` : migrations 001/002 et seed idempotent réussis, cinq Besu et application démarrés ; RPC et PostgreSQL non publiés ; seule la console sur loopback.
- `npm run lab:verify` : **réussite sur Besu réel**, avant/après recréation Compose ; identités vérifiées par net_enode, checkpoint commun hash/stateRoot, témoin et contrôle d'accès, revert réel, reprise, nouveau reçu, job PostgreSQL conservé ; production avec API/worker arrêtés. **4 tests d'intégration PostgreSQL réussis** sur une base temporaire distincte.
- `npx playwright install chromium`, `npm run test:ui` : **3 parcours Chromium réussis**, sans mock d'API : Viewer, Administrator/worker et refus d'un mauvais jeton.
- Bootstrap neuf dans `.runtime/fresh-init` par `node --import tsx <scripts/lab.ts> init`, répété : identités/genesis conservés ; altération volontaire du fichier genesis refusée. Ce test ne modifie pas le laboratoire qualifié.
- Recherche locale des clés et credentials générés dans les fichiers livrés, sans afficher leur contenu : aucune correspondance détectée. Les secrets restent sous `.runtime` ignoré par Git et exclu du contexte Docker.
- `git diff --check` : aucune erreur d'espacement sur les fichiers suivis. Aucun commit, tag, push, PR ou déploiement distant réalisé.

Les premières tentatives ont révélé puis corrigé la peer dependency TypeScript 7/ESLint, la dépendance tmp vulnérable, les permissions de l'entrypoint Besu, une option CORS vide, l'exigence d'IP numérique pour p2p-host et un chevauchement créé par l'allocateur automatique de réseaux Docker à la reprise. Les trois plages réseau sont désormais explicites. Le test d'intégration final utilise les corrections ; aucun échec n'est présenté comme qualification.

## Preuves et portée

Les fichiers publics horodatés se trouvent dans [evidence/v0.0](evidence/v0.0/) : `before.json`, `after.json`, `independence.json`, `environment.json` et `run.json`. Ils enregistrent versions réellement exposées, enodes, checkpoints, hash de transactions, preuve du worker, digest de l'image construite et taille des volumes. Aucun secret n'y figure. Les horodatages et hash de la dernière exécution font autorité ; une nouvelle exécution crée un nouveau contrat témoin et met à jour les preuves.

Valeur témoin : `900719925474099312345678901234567890`, transportée sans perte de précision. La lecture des blocs, reçus et logs testés après redémarrage n'est pas une garantie d'archive de tous les états historiques.

## Contrôles non exécutés et limites

- Parcours complet avec un fournisseur OIDC réel, révocation/rotation et logout du fournisseur : **non exécuté**, donc non qualifié. Access tokens limités à quinze minutes ; pas d'introspection ni révocation instantanée. TLS et déploiement de production restent à qualifier.
- Linux natif, arm64, macOS, charge, volumétrie longue et historique ancien : **non exécutés**. CPU/RAM sont limités par conteneur ; le budget disque est réservé dans le modèle mais sans quota réel de volume.
- Sauvegarde/restauration PostgreSQL : runbook fourni, exercice dump/restore **non exécuté**. La recréation des conteneurs avec volumes conservés ne prouve pas une restauration depuis sauvegarde.
- SSH/local via playbooks, votes, partitions, panne de deux validateurs, sauvegardes Besu, restauration, PRA et mise à jour : **non exécutés et hors v0.0**. Les règles de quorum unitaires ne remplacent pas ces essais.
- Workflow GitHub Actions livré à versions/SHA épinglés, mais **non exécuté à distance** dans cette session. Aucun service distribué additionnel introduit.
- Secrets de laboratoire en fichiers locaux, pas dans un coffre chiffré. ACL NTFS à préserver ; ne jamais réutiliser ces clés hors laboratoire. Un utilisateur ayant accès à Docker ou au compte opérateur peut accéder aux secrets.
- Les chemins de l'inventaire représentent la cible Linux native ; Compose utilise ses propres volumes/configurations séparés. Le statut validateur n'est jamais déduit du champ purpose.

## Démarrage et prochain jalon

Avec Node/npm épinglés : `npm run lab:up`, puis http://127.0.0.1:3000 ; jetons locaux par `npm run lab:credentials`. Arrêt conservateur : `npm run lab:down`. Détails dans [runbooks/LAB.md](runbooks/LAB.md).

Prochain jalon proposé : v0.2, machines et installation SSH/local depuis l'interface, **uniquement sur demande explicite**. Aucun développement de ce jalon n'a été engagé.
