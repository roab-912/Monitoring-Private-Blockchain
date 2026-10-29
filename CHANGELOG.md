# Changelog

## 0.0.0 — 2026-10-28

- Socle React/TypeScript, Fastify et worker séparé, contrats TypeBox communs avec génération OpenAPI, lint/typage/build/tests et CI à références immuables.
- Node 24.22.1 LTS, npm 11.19.1, Besu 26.9.0 et PostgreSQL 18.6 ; dépendances exactes et lockfile, images externes figées par digest, correction tmp 0.2.7 sous solc.
- Migrations PostgreSQL versionnées et contrôlées par checksum : réseaux, machines multi-instances, réservations de services/chemins/ports, limites de ressources, jobs/étapes/leases/verrous/idempotence, plans immuables et audit append-only. Logins API et worker distincts.
- Authentification OIDC code + PKCE et validation serveur des access tokens, RBAC, profil local/laboratory explicitement isolé et refus du mode développement en production.
- Laboratoire Compose à quatre validateurs et un nœud RPC non validateur, clés locales hors Git, données/identités/configurations séparées, CPU/RAM limités et RPC privés. La console signale l'unique domaine de panne physique.
- Contrat témoin Solidity ciblant Berlin : état uint256 persistant, propriétaire, événement et revert. Qualification sur Besu réel avec inclusion, contrôle d'accès, persistance après recréation Compose et nouvelle transaction. Production maintenue avec API/worker arrêtés.
- Tests unitaires, intégration PostgreSQL et parcours Chromium ; six ADR, runbooks et preuves publiques. Les limites et contrôles non exécutés sont consignés dans docs/STATUS.md.
- Aucun développement v0.1, vote interactif, exécution SSH ou sauvegarde Besu.
