# Changelog

## 0.1.0 — 2026-10-29

- Explorateur réel : pages réseau, blocs, transactions, reçus, adresses et logs bruts ; recherche par numéro/hash/adresse, pagination, provenance, horodatages et fraîcheur.
- Connexion active unique, sources RPC autorisées par l'opérateur, vérification chainId/networkId/genesis/version/capacités par job durable, origines managed/imported distinctes et refus des plans périmés.
- Indexation reprenable sous verrou PostgreSQL : bloc complet et curseur atomiques, contraintes d'unicité, contrôle parentHash/checkpoint et comparaison entre sources. Les rounds/sceaux QBFT exclus du hash de chaîne ne déclenchent pas un faux incident.
- Protection réseau par adresses résolues autorisées et fixées, méthodes RPC en lecture limitées, aucune URL libre ni proxy RPC dans l'API. Quotas PostgreSQL par identité et RBAC conservé.
- Migrations additives 003/004, nouvelles permissions ciblées, états explicites pour divergence, reçu absent, limites et erreur de persistance ; aucun historique effacé sur panne RPC.
- Qualification T01/T02/T03 sur Besu réel et injections RPC rapportées séparément ; tests PostgreSQL et Chromium étendus. ADR-007, runbook EXPLORER, README et STATUS mis à jour.
- Aucune administration SSH, promotion de validateur, signature depuis l'interface ou autre fonction v0.2.

## 0.0.0 — 2026-10-28

- Socle React/TypeScript, Fastify et worker séparé, contrats TypeBox communs avec génération OpenAPI, lint/typage/build/tests et CI à références immuables.
- Node 24.22.1 LTS, npm 11.19.1, Besu 26.9.0 et PostgreSQL 18.6 ; dépendances exactes et lockfile, images externes figées par digest, correction tmp 0.2.7 sous solc.
- Migrations PostgreSQL versionnées et contrôlées par checksum : réseaux, machines multi-instances, réservations de services/chemins/ports, limites de ressources, jobs/étapes/leases/verrous/idempotence, plans immuables et audit append-only. Logins API et worker distincts.
- Authentification OIDC code + PKCE et validation serveur des access tokens, RBAC, profil local/laboratory explicitement isolé et refus du mode développement en production.
- Laboratoire Compose à quatre validateurs et un nœud RPC non validateur, clés locales hors Git, données/identités/configurations séparées, CPU/RAM limités et RPC privés. La console signale l'unique domaine de panne physique.
- Contrat témoin Solidity ciblant Berlin : état uint256 persistant, propriétaire, événement et revert. Qualification sur Besu réel avec inclusion, contrôle d'accès, persistance après recréation Compose et nouvelle transaction. Production maintenue avec API/worker arrêtés.
- Tests unitaires, intégration PostgreSQL et parcours Chromium ; six ADR, runbooks et preuves publiques. Les limites et contrôles non exécutés sont consignés dans docs/STATUS.md.
- Aucun développement v0.1, vote interactif, exécution SSH ou sauvegarde Besu.
