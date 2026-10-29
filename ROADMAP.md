# Roadmap versionnée

**Produit :** console d'exploitation d'une blockchain privée Besu/QBFT.  
**Date du cadrage :** 28 octobre 2026.  
**Objectif V1 :** administrer un réseau connu et démontrer sa restauration, avec des opérations traçables et des procédures reproductibles.

## 1. Décisions structurantes

Besu est retenu pour la compatibilité Ethereum/EVM et QBFT pour le consensus PoA. La sélection des validateurs par en-têtes est le mode de gouvernance initial. Les deux mécanismes Besu de sélection des validateurs ne doivent pas être mélangés : la variante par contrat exigerait un autre adaptateur et un autre cadrage [S1, S2].

La solution comporte trois fonctions : observer la chaîne, interagir avec ses contrats et exécuter des opérations sur ses hôtes. Elles partagent une interface, mais leurs permissions et leurs chemins d'exécution restent distincts.

Le réseau poursuit son consensus sans l'application de gestion. La perte du tableau de bord, du worker ou de PostgreSQL empêche les nouvelles opérations d'administration ; elle ne doit pas arrêter Besu.

**Plusieurs nœuds par machine sont une exigence du socle.** L'utilisateur choisit une machine, puis crée une ou plusieurs instances avec identités, données, services et ports distincts. Les actions et sauvegardes ciblent une instance ou un groupe. Les calculs de quorum prennent en compte la perte simultanée des instances d'une machine.

Le projet doit gérer deux familles de sauvegarde :

- **Sans interruption du réseau :** synchroniser un nœud temporaire non validateur, l'arrêter proprement et sauvegarder ses données. Le registre continue ailleurs.
- **Avec arrêt du réseau :** fermer les admissions de transactions, arrêter les composants concernés et produire un ensemble de reprise identifié et cohérent.

Ces procédures sont des choix d'ingénierie proposés ici. Elles devront être validées sur la version Besu épinglée. La documentation officielle décrit les données et configurations à préserver ainsi que la restauration d'un nœud arrêté [S5] ; elle ne garantit pas à elle seule les workflows proposés.

## 2. Livraisons successives

| Version | Résultat utilisable | Critère de passage principal |
| --- | --- | --- |
| [v0.0](docs/versions/v0.0.md) | Socle, architecture et laboratoire reproductible | 4 validateurs produisent ; une transaction test est incluse ; redémarrage sans perte de données |
| [v0.1](docs/versions/v0.1.md) | Explorateur et connexion à un réseau existant | Blocs, transactions, reçus et logs réels ; indexation reprenable |
| [v0.2](docs/versions/v0.2.md) | Machines, SSH/local et installation depuis l'interface | Plusieurs nœuds installés sur une machine ; services indépendants et pilotables |
| [v0.3](docs/versions/v0.3.md) | Santé réseau et diagnostic par nœud | Détection distincte d'un retard, d'une panne, d'une partition et d'une observation périmée |
| [v0.4](docs/versions/v0.4.md) | Registre et interaction avec les contrats | Lecture, simulation et transaction signée par un portefeuille externe |
| [v0.5](docs/versions/v0.5.md) | Promotion et retrait des validateurs | Vote QBFT observé dans la chaîne ; protection du quorum avant et après l'opération |
| [v0.6](docs/versions/v0.6.md) | Sauvegarde via un nœud temporaire | Production continue ; sauvegarde chiffrée ; restauration isolée de vérification |
| [v0.7](docs/versions/v0.7.md) | Assistant de restauration d'un nœud | Nouveau serveur rattrapé, vérifié et réintégré sans identité dupliquée |
| [v0.8](docs/versions/v0.8.md) | Arrêt complet, sauvegarde à froid et PRA réseau | Reprise d'un réseau détruit en laboratoire à partir du jeu de sauvegarde |
| [v0.9](docs/versions/v0.9.md) | Exploitation régulière | Planification, rétention, alertes, rotation des certificats et mise à jour contrôlée |
| [v1.0](docs/versions/v1.0.md) | Première version qualifiée pour une topologie documentée | Preuves de reprise, sécurité, performances et limites publiées |

Chaque version dépend des précédentes. Une version est une étape de capacité, sans durée calendaire implicite. Les migrations, tests et documents nécessaires font partie de la livraison.

## 3. Les trois jalons produit

**v0.4 : MVP de gestion et d'interaction.** Les machines sont déclarées depuis l'interface, les nœuds installés et pilotés par SSH ou localement, le réseau supervisé et ses contrats utilisables.

**v0.7 : première console d'exploitation.** L'ajout de serveurs, la gouvernance et le remplacement d'un nœud depuis une sauvegarde sont disponibles. La reprise après perte totale du réseau n'est pas encore qualifiée.

**v1.0 : exploitation qualifiée.** Les deux modes de sauvegarde et la restauration complète sont testés sur la topologie annoncée. La qualification porte sur cette matrice, pas sur toute infrastructure possible.

## 4. Parcours utilisateur

| Page | Contenu principal | Première version |
| --- | --- | --- |
| Réseau | Identité de chaîne, dernier bloc observé, activité, source et fraîcheur | v0.1 |
| Explorateur | Blocs, transactions, adresses, reçus, logs et recherche | v0.1 |
| Santé | Nœuds, hauteurs, hash, pairs, disques, alertes et consensus estimé | v0.3 |
| Contrats | ABI, fonctions, simulation, portefeuille, transactions, événements | v0.4 |
| Machines et nœuds | SSH/local, dossiers, ports, installation, démarrage, arrêt | v0.2 |
| Validateurs | Membres effectifs, propositions, votes et impact sur le quorum | v0.5 |
| Sauvegardes | Création, progression, manifeste, vérification et rétention | v0.6 |
| Restaurations | Plan, cible, compatibilité, validation et réintégration | v0.7 |
| Maintenance | Arrêt global, reprise et mises à jour | v0.8 / v0.9 |
| Administration | Identités, rôles, audit et politiques | Socle v0.0, enrichi ensuite |

Un écran ne doit jamais afficher un succès parce qu'un bouton a été cliqué. Il affiche l'état observé du job ou de la chaîne et la date de la dernière preuve.

## 5. Exigences transverses

### Sécurité dès le socle

Authentification OIDC, contrôle des rôles côté serveur, secrets hors Git, TLS hors laboratoire, restrictions réseau et journal d'audit dès les premières fonctions. Une authentification de développement n'est admise qu'en profil local explicitement isolé ; elle est refusée en production.

Les API d'administration Besu ne sont pas accessibles aux navigateurs. Les fonctionnalités de signature utilisent une passerelle RPC de transactions restreinte et un portefeuille externe. Les pouvoirs applicatifs ne remplacent pas les contrôles d'accès des contrats.

Le worker exécute des opérations métier typées via des playbooks Ansible versionnés, en connexion SSH ou locale. Aucune route d'exécution de shell arbitraire, aucun terminal web, aucun téléchargement de script non vérifié avec exécution privilégiée.

### Opérations durables

Toute mutation d'infrastructure possède un plan, des préconditions revérifiées à l'exécution, un identifiant d'idempotence, un verrou de ressource, un délai maximal et un journal. Une opération interrompue doit pouvoir être réconciliée avec l'état réel.

La confirmation utilisateur s'applique à un plan précis et expire si ses entrées changent. La procédure de reprise hors application est documentée : la console ne doit pas être indispensable à sa propre restauration.

### Preuves

Tests sur Besu réel pour le consensus, les votes, la synchronisation et la reprise. Les mocks conviennent aux erreurs RPC et aux cas de présentation, mais ne prouvent pas ces mécanismes.

Le corpus minimal inclut une transaction réussie, une transaction annulée par le contrat, un contrat à état persistant, des logs et un changement de validateurs. Les sauvegardes doivent préserver ce corpus dans les limites déclarées.

## 6. Périmètre de la première version stable

Support : un réseau Besu/QBFT, gouvernance par en-têtes, serveurs Linux/VM disponibles, SSH ou exécution locale, installations dans des dossiers dédiés, stockage de sauvegarde local ou compatible S3 qualifié, un fournisseur OIDC et un portefeuille de référence.

Le multi-réseaux dans une même interface, Fabric, Kubernetes, la création de VM chez tous les hébergeurs, l'agent de contrôle en connexion sortante, la gouvernance QBFT par contrat, le compilateur Solidity web et le HSM sont des extensions futures. Prévoir des interfaces d'adaptation sans construire ces extensions pendant V1.

Une sauvegarde de nœud Besu ne constitue pas une image complète de serveur. V1 recrée l'environnement avec des manifests et paquets épinglés, puis restaure les données et configurations prévues. Si une image VM ou bare metal est exigée, ajouter ultérieurement un connecteur de snapshot d'hyperviseur ou de disque.

## 7. Méthode de livraison à Codex

À chaque itération :

1. Lire le dossier de cadrage et la fiche de version demandée.
2. Vérifier les contraintes réellement supportées par les dépendances épinglées.
3. Réaliser le parcours complet : interface, API, worker, automatisation si concernée, persistance et erreurs.
4. Exécuter les tests de la fiche et les régressions pertinentes.
5. Documenter l'installation, les migrations, les commandes exécutées et les limites.
6. Mettre à jour CHANGELOG.md et docs/STATUS.md, puis s'arrêter au périmètre demandé.

Ne pas masquer une fonction absente par un résultat simulé. Si l'environnement interdit un test d'intégration, le livrer exécutable, signaler qu'il n'a pas été exécuté et ne pas déclarer la qualification acquise.

## 8. Sources et nature des affirmations

Les références [S1] à [S10] sont détaillées dans [docs/SOURCES.md](docs/SOURCES.md). Les capacités Besu sont sourcées ; la découpe des versions, les contrôles supplémentaires et l'architecture sont des recommandations de conception à valider par les tests.
