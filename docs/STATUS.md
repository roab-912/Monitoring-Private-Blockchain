# État de réalisation

Version atteinte : **v0.0.0 — socle et laboratoire qualifiés sur la matrice locale décrite ci-dessous**. Date : 28 octobre 2026. v0.1 n'est pas commencée.

## Critères de sortie v0.0

| Critère | Résultat et preuve |
| --- | --- |
| Une commande démarre le laboratoire | `npm run lab:up`, après `npm ci --ignore-scripts`, initialise les identités locales puis démarre et attend les services. Exécuté avec le runtime épinglé. |
| Quatre validateurs et transaction témoin | Besu 26.9.0 réel ; quatre proposeurs observés ; ensembles latest/pending conformes sur les quatre validateurs ; cinquième nœud RPC absent du groupe ; déploiement et écriture inclus. |
| Redémarrage sans perte (T01) | `down` puis `up` sans suppression des volumes ; enodes réels et genesis conservés ; état, reçus et événement relus ; nouvelle transaction incluse. Voir before.json et after.json. |
| API protégée | Appel anonyme 401, mutation Viewer 403, Administrator 202 puis SUCCEEDED avec preuve PostgreSQL. Vérifié directement et dans Chromium. |
| Plusieurs instances sur une machine | Cinq instances en inventaire sur une machine. Intégration PostgreSQL : deux instances acceptées, collisions concurrentes de port et chemins imbriqués refusées. |
| Domaine de panne explicite | Un seul domaine physique dans l'inventaire et à l'écran ; testé dans Chromium. |

## Changements livrés

React/TypeScript, API Fastify et worker, schémas TypeBox/OpenAPI générés, migrations PostgreSQL sous checksum, identités et ressources multi-instances, jobs persistants et preuve réelle du worker, contrôles de quorum/placement, OIDC/RBAC, profil local isolé, laboratoire QBFT et contrat témoin. Six décisions dans `docs/adr`, trois runbooks dans `docs/runbooks`.

Le job disponible est uniquement `foundation.check`, une lecture de PostgreSQL avec plan immuable, étape, idempotence et lease. Son expiration devient NEEDS_ATTENTION ; aucune mutation distante ne peut être répétée ou simulée. Il n'existe aucun bouton d'installation, vote ou sauvegarde dans v0.0.

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

## Commandes exécutées et résultats

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

Prochain jalon proposé : v0.1, explorateur et connexion à un réseau existant, **uniquement sur demande explicite**. Aucun développement de ce jalon n'a été engagé.
