# Architecture proposée

## 1. Modèle machine / instance / validateur

**Une machine héberge de zéro à plusieurs instances Besu.** Cette relation est obligatoire dès le schéma initial. Une machine peut héberger un mélange de validateurs, nœuds RPC, nœuds d'exploration et nœuds temporaires de sauvegarde. Le rôle de validateur provient du consensus ; il ne se déduit pas de l'usage technique du nœud.

| Entité | Données principales |
| --- | --- |
| Network | chainId, networkId, genesis original et son empreinte de fichier, hash du bloc genesis, configuration de consensus et versions qualifiées |
| Machine | ID, nom, adresse, OS/architecture, connexion SSH/local, secretRef, clé d'hôte vérifiée, bastion éventuel, domaine de panne, capacités et état d'accès |
| NodeInstance | ID, machineId, networkId, dossier, service, ports, volumes, identité P2P, adresse de nœud, version, profil de stockage, limites CPU/RAM/disque |
| NodePurpose | Usages RPC, exploration ou sauvegarde, indépendants du statut validateur |
| Observation | Source, instant de collecte, instant du bloc, hauteur, hash, état de synchronisation, pairs et mesures système |
| ValidatorObservation | Bloc de référence, ensemble latest, ensemble pending, propositions et progression observée |
| Contract | Réseau, adresse, ABI versionnée et empreinte, bytecode attendu, métadonnées et transactions liées |
| Operation | Type, auteur, réseau, cibles, plan immuable, état, étapes, verrou, idempotencyKey et preuves |
| BackupSet | Type, snapshotId, manifeste authentifié, point de chaîne, composants inclus, état des vérifications et références aux secrets scellés |
| AuditEvent | Identité, action, ressource, résultat, date et identifiant de corrélation, sans secrets |

Machine représente une VM ou un hôte accessible. Un attribut failureDomain peut regrouper plusieurs VM partageant un hyperviseur, une alimentation ou un site. Compter les seules adresses IP ne mesure pas l'indépendance des pannes.

## 2. Isolation de plusieurs nœuds sur un hôte

Chaque instance possède obligatoirement :

- Un répertoire de données exclusif et un répertoire de configuration distinct.
- Une clé de nœud unique, placée hors du dossier de données copiable.
- Un service systemd distinct en déploiement Linux natif.
- Des ports hôte réservés pour P2P TCP, découverte UDP, RPC HTTP, métriques et WebSocket si activé.
- Des fichiers de logs, un PID et un cycle de vie séparés.
- Des limites de ressources appliquées par le gestionnaire de services.
- Un enode qui annonce l'adresse et le port effectivement joignables, y compris derrière NAT.

Exemple de racine gérée :

~~~
/srv/bpc/networks/<network-id>/nodes/<node-id>/
    config/
    data/
    logs/
    runtime/
/srv/bpc/keys/<node-id>/node.key
~~~

Les identifiants sont des valeurs générées, validées et non des fragments de chemin fournis librement. Les clés restent sous permissions restrictives et ne sont pas embarquées dans les backups génériques des données.

L'allocateur de ports est transactionnel, puis confirme la disponibilité sur l'hôte avant installation. Une collision concurrente fait échouer proprement l'opération. Aucun service existant n'est arrêté pour libérer un port.

| Instance sur le même hôte | P2P TCP et UDP | RPC HTTP | Métriques |
| --- | --- | --- | --- |
| nœud A | 30303 | 8545 | 9545 |
| nœud B | 30304 | 8546 | 9546 |
| nœud C | 30305 | 8547 | 9547 |

Ces valeurs illustrent une allocation ; elles ne remplacent pas la réservation et les vérifications. Le réseau privé peut imposer d'autres plages.

Un dossier distinct isole le stockage. Le service, les ports, les permissions et les limites de ressources complètent cette isolation. Aucun partage de base de données Besu en lecture-écriture entre instances.

## 3. Composants

| Composant | Proposition | Responsabilité |
| --- | --- | --- |
| Web | React + TypeScript | Écrans, formulaires, suivi des jobs et portefeuille |
| API | Fastify + TypeScript | OIDC, RBAC, validation, inventaire, planification et OpenAPI |
| Worker | Même code métier, processus séparé | Jobs durables, verrous, réconciliation et exécution des workflows |
| Persistance | PostgreSQL | Inventaire, index, opérations, politiques et audit |
| Adaptateur Ethereum | viem | Encodage ABI, appels RPC, transactions et types sans perte de précision |
| Automatisation | ansible-runner + playbooks Ansible versionnés | Installation, services, configuration, collecte et opérations SSH/local |
| Métriques | Prometheus ; Grafana en complément | Séries temporelles et tableaux techniques |
| Sauvegardes | restic, backend local puis S3 qualifié | Stockage chiffré, intégrité et rétention |
| Secrets | Interface SecretProvider | Références vers un coffre ou stockage chiffré ; clé maîtresse hors PostgreSQL |
| Réseau Besu | Besu + QBFT | Consensus, exécution EVM et réplication |

Ces choix de bibliothèques sont une proposition, à épingler en v0.0. Aucun besoin de Redis ou Kubernetes dans le socle. La file de jobs repose initialement sur PostgreSQL avec leasing durable et réservation concurrente contrôlée.

Le worker est le seul composant qui utilise les credentials SSH. Il s'exécute dans un environnement isolé, possède une politique de sortie réseau et ne monte pas de socket Docker de l'hôte de gestion. Les clés sont fournies temporairement par SecretProvider, effacées après usage et exclues des sorties Ansible.

Topologie logique : navigateur → API → PostgreSQL/worker ; worker → SSH/local → services Besu ; collecte → RPC en lecture et métriques ; passerelle de transactions → nœud RPC dédié. Les flux P2P relient les instances Besu indépendamment de cette application.

## 4. Transport et contrôle des machines

Deux implémentations d'une même interface ExecutionProvider :

- **SSH :** connexion depuis le worker vers un serveur existant, avec utilisateur dédié, clé d'hôte épinglée et élévation limitée.
- **Local :** exécution des mêmes playbooks sur un hôte de gestion explicitement autorisé, dans les seules racines gérées. Ce mode n'accorde aucun droit supplémentaire à l'API web.

Le mode local peut aussi être implémenté par SSH vers localhost si cela simplifie l'application des contrôles. Documenter le mode réellement qualifié.

Les opérations exposées sont typées : inspectMachine, installNode, startNode, stopNode, restartNode, collectNodeState, createBackup, restoreNode, removeNodeData. Aucun paramètre command ou playbookPath arbitraire n'est accepté par l'API.

Les RPC d'administration peuvent être liés à l'interface locale de la machine et atteints par un tunnel SSH restreint au port de l'instance. Si un réseau privé de gestion est utilisé, il est explicitement filtré et authentifié. Une règle CORS ne remplace pas ce contrôle d'accès.

Le bootstrap initial peut demander une élévation pour créer l'utilisateur, les dossiers et le service. Après préparation, les droits sont limités aux services et chemins gérés. Une règle sudo permettant systemctl sur tous les services ne respecte pas ce contrat.

Une clé SSH valide prouve l'accès au serveur ; elle ne prouve ni sa conformité, ni son état de synchronisation, ni sa participation au consensus. Ces observations sont collectées séparément.

## 5. Identité et permissions

| Capacité | Viewer | ContractOperator | InfrastructureOperator | ValidatorGovernor | Administrator |
| --- | --- | --- | --- | --- | --- |
| Explorer et observer | Oui | Oui | Oui | Oui | Oui |
| Préparer une transaction | Non | Oui | Non | Non | Selon droits |
| Déclarer une machine et installer un nœud | Non | Non | Oui | Non | Selon droits |
| Démarrer/arrêter un nœud non validateur | Non | Non | Oui | Non | Selon droits |
| Proposer une modification de validateurs | Non | Non | Non | Oui | Selon droits |
| Exécuter une sauvegarde/restauration | Non | Non | Oui | Non | Selon droits |
| Gérer les rôles et politiques | Non | Non | Non | Non | Oui |

Les permissions sont composables. Le redémarrage d'un validateur, l'arrêt d'une machine contenant des validateurs et le PRA nécessitent des droits d'exploitation critique et le respect de la politique de quorum.

Les profils se contrôlent côté serveur, sur chaque route et chaque ressource. Une politique à deux approbateurs peut être activée en v0.9 pour les opérations critiques ; sa présence ne change pas le vote QBFT.

Le contrôle RBAC de l'interface ne remplace pas les restrictions des contrats et du réseau. Un utilisateur disposant d'un autre accès RPC peut soumettre une transaction par cet accès ; les règles métier critiques doivent aussi être appliquées par les contrats.

## 6. RPC, contrats et données

Trois chemins distincts :

1. Lecture : appels limités vers des nœuds connus, avec délais, pagination, quotas et limites eth_getLogs.
2. Transactions : portefeuille EIP-1193 de référence et passerelle RPC dédiée à une liste explicite de méthodes ETH nécessaires au portefeuille.
3. Administration : QBFT/PERM et opérations nécessaires via le worker et un chemin d'administration privé, jamais un proxy libre accessible depuis le navigateur.

Le portefeuille est configuré pour le réseau privé et sa passerelle. Vérifier chainId et le hash du genesis, car chainId seul ne suffit pas à distinguer deux réseaux mal configurés. Ne pas exiger eth_signTransaction sans avoir vérifié sa prise en charge ; le parcours retenu doit fonctionner avec eth_sendTransaction du portefeuille, qui signe puis soumet via sa passerelle configurée.

Prévisualiser l'adresse, le réseau, la fonction, les paramètres, le montant et le gas ; effectuer une simulation, puis demander la signature au portefeuille. Suivre le reçu, le statut d'exécution et les logs. Une simulation réussie n'est pas une garantie sur l'exécution future.

ABI importée et bytecode déployé ne constituent pas une vérification automatique du code source. Présenter séparément les niveaux de preuve. Les proxys de contrats et leurs ABI à une hauteur donnée restent un sujet distinct ; ne pas attribuer silencieusement une ABI récente à tout l'historique.

Les nœuds autorisés à répliquer le registre ont accès aux données répliquées. Ce projet n'ajoute pas de confidentialité entre ces participants.

## 7. Quorum et domaines de panne

Le moteur métier distingue le seuil de consensus, le seuil de changement des validateurs et une estimation des validateurs disponibles. Les calculs utilisent le comportement vérifié de la version Besu épinglée.

Exemples de référence QBFT : quatre validateurs nécessitent trois participants pour produire ; sept nécessitent cinq. Les votes d'ajout/retrait par en-têtes demandent plus de la moitié des validateurs existants [S1, S2].

Pour chaque machine ou domaine de panne, afficher l'impact de la perte de toutes les instances qu'il contient. Exemple : quatre validateurs répartis deux par machine perdent le quorum à la perte d'une de ces machines. Quatre conteneurs sur un serveur ne créent pas quatre domaines de panne.

L'interface permet ces topologies. Elle affiche leur marge et applique une politique explicite : laboratoire tolérant à la panne globale, ou production avec budget de panne requis. Une promotion qui viole la politique configurée est refusée avec le calcul expliqué.

La multiplication des répliques ne garantit pas un débit accru : elles exécutent le même registre et partagent les ressources d'un hôte. Évaluer les limites de CPU, RAM, I/O et réseau avant de placer une nouvelle instance.

## 8. Structure cible du dépôt

~~~
apps/web/
apps/api/
apps/worker/
packages/domain/
packages/contracts/
packages/besu-adapter/
packages/execution-provider/
packages/backup-provider/
infra/compose/
infra/ansible/
tests/integration/
tests/e2e/
docs/adr/
docs/runbooks/
~~~

La structure facilite les tests et l'isolation des permissions ; elle n'impose pas des services distribués pour chaque dossier.

## 9. Décisions à figer en v0.0

ADR-001 : Besu/QBFT, mode de gouvernance et versions supportées.  
ADR-002 : déploiement Linux natif systemd en cible, Compose en laboratoire.  
ADR-003 : SSH/local, gestion des secrets et restrictions d'exécution.  
ADR-004 : profils de stockage/synchronisation et disponibilité des données historiques.  
ADR-005 : manifeste, chiffrement, dépôt de sauvegarde et détention des secrets de reprise.  
ADR-006 : source de référence de santé, seuils et politique de placement des validateurs.

Le genesis et les transitions connues sont versionnés. Conserver séparément l'empreinte des fichiers et le hash du bloc genesis. Ne pas écrire un genesis historique différent pour « réparer » un réseau.
