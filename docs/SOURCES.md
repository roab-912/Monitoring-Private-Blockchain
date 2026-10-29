# Sources primaires et limites du cadrage

Documentation consultée le 28 octobre 2026. Les liens stables peuvent évoluer ; Codex doit revérifier les capacités de la version logicielle épinglée en v0.0, puis avant toute mise à jour.

## Références

| Référence | Source primaire | Usage dans le cadrage |
| --- | --- | --- |
| S1 | [Besu — QBFT](https://docs.besu-eth.org/private-networks/how-to/configure/consensus/qbft) | Consensus PoA, modes de sélection et règles de vote |
| S2 | [Besu — API QBFT](https://docs.besu-eth.org/private-networks/reference/api/qbft) | Propositions, métriques, ensembles latest/pending et vérification des changements |
| S3 | [Besu — Local permissioning](https://docs.besu-eth.org/private-networks/how-to/use-local-permissioning) | Admission des pairs distincte du rôle validateur, configuration par nœud |
| S4 | [Besu — Data storage formats](https://docs.besu-eth.org/public-networks/concepts/data-storage-formats) | Distinction stockage courant et disponibilité des états historiques |
| S5 | [Besu — Backup and restore](https://docs.besu-eth.org/private-networks/how-to/backup) | Genesis, données, restauration d'un nœud arrêté et compatibilité de version |
| S6 | [Besu — Monitoring](https://docs.besu-eth.org/private-networks/how-to/monitor) | Possibilités de supervision et outils existants |
| S7 | [Besu — Upgrade](https://docs.besu-eth.org/private-networks/how-to/upgrade) | Chemin de mise à jour à qualifier |
| S8 | [Besu — Node keys](https://docs.besu-eth.org/public-networks/concepts/node-keys) et [Configuration options](https://docs.besu-eth.org/public-networks/reference/options) | Identité P2P/validateur, emplacement des clés et options à épingler |
| S9 | [Ansible — Connections](https://docs.ansible.com/projects/ansible/latest/inventory_guide/connection_details.html) et [Ansible Runner](https://docs.ansible.com/projects/runner/en/latest/intro/) | Pilotage SSH/local et intégration de playbooks dans un orchestrateur |
| S10 | [restic — Repository design](https://restic.readthedocs.io/en/stable/100_references.html), [Checks](https://restic.readthedocs.io/en/stable/045_working_with_repos.html) et [Restore](https://restic.readthedocs.io/en/stable/050_restore.html) | Stockage chiffré/authentifié, contrôles d'intégrité et restauration |

## Ce qui relève des sources

Besu fournit les mécanismes de consensus, les API, le permissioning et les fonctions de stockage documentés. Les identités de nœuds servent d'identités de validateurs QBFT. Les variantes de gouvernance par en-têtes et par contrat exigent des chemins différents.

Le comportement latest/pending doit être pris en compte lors d'un changement de groupe. Le permissioning est une configuration locale à maintenir sur les nœuds concernés.

La documentation distingue les formats de stockage et leurs capacités historiques. Un nœud apte à reprendre la chaîne ne garantit pas un service d'archive pour toute requête d'état passée.

## Ce qui est proposé et doit être validé

La roadmap, les transports retenus, le modèle multi-instance, les contrôles de placement, les états de jobs, les barrières de maintenance, les sauvegardes par nœud temporaire et le PRA coordonné sont des recommandations de conception.

L'exemple « quatre validateurs sur deux hôtes, deux par hôte » applique le quorum au scénario de perte d'une machine. Ce raisonnement ne constitue pas une mesure expérimentale ; les scénarios d'acceptation doivent le démontrer sur la version retenue.

L'utilisation de restic ne rend pas automatiquement cohérente la copie d'une base Besu ouverte. Le dossier prescrit l'arrêt propre de l'instance copiée. Un contrôle de structure du dépôt et une restauration applicative sont également des preuves différentes.

L'utilisation d'Ansible ne remplace pas la validation des entrées, la limitation des privilèges ou l'authentification des serveurs SSH. Ce sont des contrôles de l'application à construire.

Le cadrage initial était un cahier de réalisation. La v0.0 possède désormais des preuves exécutées dans [STATUS.md](STATUS.md) et `docs/evidence/v0.0` ; les procédures futures restent à qualifier.

## Vérification v0.0 — 28 octobre 2026

| Source primaire | Vérification et choix |
| --- | --- |
| [Release Besu 26.9.0](https://github.com/besu-eth/besu/releases/tag/26.9.0) | Version retenue ; version réellement renvoyée par les cinq RPC conservée dans les preuves |
| [Registre Docker de Besu](https://hub.docker.com/r/hyperledger/besu/tags?name=26.9.0) | Digest d'index obtenu via l'API Registry v2 officielle ; entrées linux/amd64 et linux/arm64 présentes, amd64 seulement exécuté |
| [Node 24.22.1 LTS](https://nodejs.org/en/blog/release/v24.22.1), [sommes officielles](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt) | Runtime retenu ; archive Windows téléchargée localement et SHA-256 comparé à la publication officielle |
| [PostgreSQL 18.6](https://www.postgresql.org/docs/18/release-18-6.html) | Version stable retenue ; image bookworm et digest vérifiés au registre officiel |
| [QBFT extraData](https://docs.besu-eth.org/private-networks/how-to/configure/consensus/qbft#extra-data) | Structure RLP du genesis local ; démarrage, quatre proposeurs et latest/pending réellement vérifiés |
| [Options Besu](https://docs.besu-eth.org/public-networks/reference/options) | BONSAI/FULL, ports, clés hors données ; contraintes réelles p2p-host numérique et bibliothèques natives prises en compte |
| [Solidity : compilation JSON](https://docs.soliditylang.org/en/latest/using-the-compiler.html#compiler-input-and-output-json-description) | Compilation solc 0.8.38 explicitement evmVersion=berlin ; déploiement réellement exécuté |
| [Advisory tmp](https://github.com/advisories/GHSA-7c78-jf6q-g5cm) | Version transitive 0.2.6 remplacée par 0.2.7 via override exact ; audit npm final sans vulnérabilité signalée |

Les métadonnées npm ont été consultées sur registry.npmjs.org puis les versions exactes et intégrités conservées dans package-lock.json. Les images Node/PostgreSQL/Besu ont été résolues avec l'API `registry-1.docker.io`, en conservant le digest de l'index dans `infra/versions.json`. Les SHA des actions GitHub ont été résolus depuis les dépôts officiels actions/checkout, actions/setup-node, docker/setup-docker-action et docker/setup-compose-action.

L'outillage Docker 26.1.1 / Compose 2.27.0 est celui disponible et réellement exécuté dans ce laboratoire. Ce choix fige une compatibilité fonctionnelle locale ; il ne constitue pas une qualification de sécurité d'une plateforme de production. Ansible, Runner, restic et Prometheus ne sont pas des dépendances installées en v0.0 : leurs versions seront choisies et testées lors de leur introduction.

## Vérification v0.1 — 29 octobre 2026

Les versions qualifiées du socle sont conservées ; aucune dépendance supplémentaire n'est introduite. Les méthodes eth_chainId, net_version, web3_clientVersion, rpc_modules, eth_blockNumber, eth_getBlockByNumber, eth_getTransactionReceipt et eth_getLogs sont exercées sur les RPC du Besu 26.9.0 réel. Leurs données, les absences de reçus et les statuts ne sont pas remplacés par un mock dans le bilan.

- [Référence RPC Besu](https://docs.besu-eth.org/public-networks/reference/api) : namespaces et rpc_modules ; la qualification exerce aussi les méthodes requises, au lieu de se fier à cette seule liste.
- [BftBlockHashing, tag 26.9.0](https://raw.githubusercontent.com/besu-eth/besu/26.9.0/consensus/common/src/main/java/org/hyperledger/besu/consensus/common/bft/BftBlockHashing.java) : calcul du hash de chaîne avec sceaux retirés et round neutralisé pour les blocs non genesis. Le laboratoire a effectivement renvoyé des sous-ensembles de sceaux différents sur un même bloc ; la comparaison a été adaptée et testée.
- [Node HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html) : connexion avec résolution contrôlée ; l'implémentation fixe l'adresse validée, refuse les redirections et limite durée/taille des réponses. Les adresses autorisées proviennent d'un fichier d'opérateur, pas d'entrées RPC du navigateur.

Les limites de confiance, les contrôles d'index et la distinction entre données de chaîne et injections de réponses RPC sont détaillés dans ADR-007, STATUS.md et le runbook EXPLORER.md. Ces vérifications n'établissent pas une qualification de consensus byzantin ou d'archive historique.
