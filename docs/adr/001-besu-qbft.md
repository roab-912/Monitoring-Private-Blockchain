# ADR-001 — Besu/QBFT et versions

Statut : accepté pour v0.0, 28 octobre 2026.

Besu 26.9.0, gouvernance QBFT par en-têtes, quatre validateurs initiaux. Les identités P2P et adresses de nœud sont distinctes des identifiants d'instance et des rôles applicatifs. Installer une instance ne lui attribuera jamais le rôle validateur : celui-ci provient de latest/pending observés sur chaîne.

Le laboratoire active Berlin au bloc zéro, sans transition ultérieure, avec blocs de deux secondes et timeout initial de quatre secondes. Solidity 0.8.38 compile explicitement pour Berlin (pas d'opcodes PUSH0). Ce profil minimal évite de présumer la compatibilité d'un fork public récent avec QBFT. Il ne qualifie pas Shanghai/Cancun/Amsterdam. Les quantités Ethereum sont des bigint ; JSON transporte des chaînes décimales ou hexadécimales.

Node 24.22.1 LTS, npm 11.19.1 et PostgreSQL 18.6 sont figés dans `infra/versions.json`, avec les digests des index multi-architecture des images. `package-lock.json` fige les dépendances et leurs intégrités. TypeScript 6.0.3 respecte la plage de typescript-eslint 8.72.1 ; TypeScript 7 a été écarté pour incompatibilité de peer dependency. Le correctif tmp 0.2.7 est imposé sous solc (GHSA-7c78-jf6q-g5cm).

Les sources primaires et la matrice réellement exécutée sont dans `docs/SOURCES.md` et `docs/STATUS.md`. La présence d'une image arm64 au registre ne constitue pas une qualification sur arm64.

Un nouveau laboratoire génère ses propres identités et son propre genesis dans `.runtime/lab`. Le genesis public et son manifeste sous `infra/lab` décrivent le laboratoire de référence ; ils ne sont pas réutilisés avec de nouvelles clés. Le genesis actif est vérifié par SHA-256 et n'est jamais réécrit lors d'un redémarrage. Son empreinte de fichier est distincte du hash du bloc zéro collecté par RPC.

Sources : [QBFT](https://docs.besu-eth.org/private-networks/how-to/configure/consensus/qbft), [release Besu 26.9.0](https://github.com/besu-eth/besu/releases/tag/26.9.0).
