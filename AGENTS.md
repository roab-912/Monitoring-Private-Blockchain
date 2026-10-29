# Consignes permanentes pour Codex

## Objectif et autorité du cadrage

Construire la console décrite dans ROADMAP.md. Lire docs/ARCHITECTURE.md, docs/OPERATIONS.md, docs/ACCEPTANCE.md et la fiche de version demandée avant de modifier le code.

Les instructions explicites du propriétaire du dépôt priment sur ce cadrage. Pour une version donnée, ne pas implémenter spontanément les versions suivantes. Proposer une ADR lorsqu'une décision contredit l'architecture.

## Réalisation

- Livrer des parcours complets ; aucun bouton simulant un succès.
- Générer OpenAPI et les schémas de validation depuis des contrats cohérents.
- Conserver les montants, numéros de blocs et valeurs Ethereum sans perte de précision ; BigInt en interne, chaînes décimales ou hexadécimales aux frontières JSON.
- Distinguer identifiant de serveur, nœud Besu, identité P2P, adresse de validateur et rôle applicatif.
- Supporter plusieurs instances Besu sur une même machine dès le schéma initial. Clés, dossiers, services, ports et budgets de ressources sont propres à chaque instance ; le domaine de panne reste celui de l'hôte.
- Épingler les dépendances, images par digest et outils ; aucun tag latest.
- Utiliser des migrations PostgreSQL versionnées ; documenter sauvegarde et stratégie de migration.
- Aucun secret, clé, token ou dump de production dans Git, fixtures ou logs.
- Générer les clés de développement localement. Ne pas les réutiliser hors laboratoire.
- Préférer un monolithe modulaire ; ne pas ajouter de broker ou de microservices sans nécessité démontrée.

## Sécurité et opérations

- Authentification et permissions côté serveur dès la première API.
- Le navigateur n'accède jamais aux RPC d'administration Besu.
- Aucun proxy RPC générique, aucune API de shell ou commande concaténée depuis une entrée utilisateur.
- L'exécuteur SSH/local n'accepte que des opérations typées, autorisées pour son hôte et son réseau, via des playbooks versionnés.
- Utiliser des appels processus avec arguments séparés ; valider les chemins et interdire traversée, liens symboliques dangereux et archives sortant de leur destination.
- Toute mutation d'infrastructure passe par un job durable, une précondition revérifiée et une réconciliation.
- Verrouiller par réseau les votes, arrêts globaux et changements de topologie ; verrouiller aussi par nœud les opérations incompatibles.
- Réserver les suppressions et restaurations aux ressources gérées ou explicitement adoptées.
- Ne jamais réécrire le genesis en routine, forcer un changement de validateurs pour contourner un quorum perdu, ou lancer deux instances avec la même identité de validateur.
- Une commande retournant true ne prouve ni l'exécution d'un vote sur chaîne, ni l'intégrité d'une sauvegarde.
- La révocation d'un accès SSH ne prouve pas l'arrêt de Besu. Le fencing d'un ancien validateur exige une preuve sur l'hôte ou le réseau.

## Vérification

- Tests unitaires pour règles métier à risque ; tests d'intégration Besu pour consensus, votes, sauvegardes et reprise ; tests UI pour les parcours essentiels.
- Utiliser les échecs injectés de docs/ACCEPTANCE.md.
- Ne pas remplacer une intégration Besu par un mock dans le bilan.
- Ne pas attribuer un défaut de consensus à partir d'une seule métrique.
- Vérifier latest et pending lorsque l'ensemble des validateurs change.
- Documenter les capacités de stockage/synchronisation réellement testées ; ne pas assimiler un nœud complet à un nœud d'archive.
- Après une modification, lancer les vérifications pertinentes. Éviter les tests qui ne font que recopier l'implémentation.

## Fin de chaque version

Mettre à jour CHANGELOG.md, docs/STATUS.md, README.md et les runbooks concernés. docs/STATUS.md doit indiquer la version atteinte, les critères validés, les commandes exécutées, les tests non exécutés, les limites et le prochain jalon.

Après les vérifications et la mise à jour des documents, relancer systématiquement le projet avec `npm run lab:up` en utilisant le runtime épinglé. Attendre le démarrage réussi des services, puis exécuter `npm run lab:credentials` pour obtenir les credentials locaux de développement. Communiquer l'URL et les credentials à l'utilisateur dans le bilan final, sans les enregistrer dans les fichiers versionnés. Ne pas régénérer les clés ni supprimer les données lors de cette relance.

Fournir un bilan court : changements, preuve de fonctionnement, risques résiduels et commande de démarrage. Une qualification non exécutée reste non acquise. Les commits, tags, PR et déploiements suivent les autorisations données dans la session.
