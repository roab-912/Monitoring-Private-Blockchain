# Scénarios d'acceptation et preuves attendues

## Règle de preuve

Conserver version Besu, configuration, topologie, nombre de machines, domaines de panne, volume de données, commandes, assertions et horodatages. Les scénarios de consensus, votes et reprise utilisent Besu réel.

Une simulation RPC peut tester la présentation d'un hash divergent ; elle ne démontre pas l'apparition d'un fork byzantin dans un vrai réseau. Séparer ces niveaux dans les résultats.

## Matrice minimale

| ID | Première version | Scénario | Preuve attendue |
| --- | --- | --- | --- |
| T01 | v0.0 | Redémarrage du laboratoire | Identités conservées et état témoin intact |
| T02 | v0.1 | Indexeur interrompu puis repris | Pas de doublons, curseur cohérent, parentHash vérifié |
| T03 | v0.1 | Même chainId, genesis différent | Mauvais endpoint refusé |
| T04 | v0.2 | Deux instances installées sur un hôte SSH | Clés, services, ports et dossiers distincts |
| T05 | v0.2 | Arrêt d'une seule instance | Voisine toujours en fonctionnement |
| T06 | v0.2 | Installation répétée | Pas de perte de données ou régénération des clés |
| T07 | v0.2 | Collision de port, disque plein, mauvais host key | Échec explicite sans modifier un autre service |
| T08 | v0.2 | Perte SSH/crash worker pendant une mutation | Réconciliation sans double effet |
| T09 | v0.2 | Créer une chaîne depuis l'interface | Genesis identique et quorum initial en production |
| T10 | v0.3 | Un validateur sur quatre arrêté | Production continue et alerte ciblée |
| T11 | v0.3 | Deux validateurs sur quatre arrêtés | Production arrêtée, diagnostic de quorum |
| T12 | v0.3 | Collecte inaccessible, Besu encore actif | État d'observation inconnu, aucune fausse preuve d'arrêt |
| T13 | v0.3 | Nœud non validateur partitionné | Retard local et progression distante distingués |
| T14 | v0.3 | Deux validateurs par machine sur deux machines | Perte d'une machine reconnue comme perte de quorum |
| T15 | v0.3 | Faux hash injecté à même hauteur | Divergence visible et mutations sensibles bloquées |
| T16 | v0.4 | Lecture, simulation, signature, reçu et événement | Transaction réelle du portefeuille, clé hors serveur |
| T17 | v0.4 | Revert, mauvais réseau, nonce concurrent | États exacts et aucun succès inventé |
| T18 | v0.5 | Promotion 4 → 5 puis retrait 5 → 4 | Votes effectifs, latest/pending et nouveaux blocs vérifiés |
| T19 | v0.5 | Deux actions de gouvernance concurrentes | Une seule opération valide, verrou et idempotence |
| T20 | v0.5 | Timeout et changement d'epoch | Propositions réconciliées, annulation honnête |
| T21 | v0.6 | Backup via nœud temporaire | Production continue et restauration isolée réussie |
| T22 | v0.6 | Backup altéré / transfert interrompu | Aucune validation trompeuse, échec reproductible |
| T23 | v0.7 | Restauration d'un nœud perdu | État au checkpoint puis rattrapage du réseau |
| T24 | v0.7 | Ancienne identité encore active | Activation du doublon interdite |
| T25 | v0.8 | Arrêt global et redémarrage | Tous les arrêts confirmés puis nouvelle transaction |
| T26 | v0.8 | Perte de tous les volumes et PostgreSQL | PRA depuis le kit seul, secrets récupérés séparément |
| T27 | v0.8 | Ancienne infrastructure non neutralisée | Reprise isolée obligatoire |
| T28 | v0.9 | Scheduler redémarré pendant un backup | Pas de double job ni de double action distante |
| T29 | v0.9 | Rétention alors que les derniers backups échouent | Dernier jeu de reprise utilisable conservé |
| T30 | v0.9 | Mise à jour et retour arrière | Chemins de compatibilité réellement testés |
| T31 | v1.0 | Console et worker arrêtés | Besu continue à produire et servir le réseau |

## Contrôles de sécurité transverses

- Refus RBAC sur chaque famille de mutation, y compris appels directs sans utiliser les boutons UI.
- Rejet d'injections dans adresses, noms, variables Ansible, chemins, options SSH et destinations de backup.
- Host keys épinglées, absence de désactivation automatique de leur vérification.
- Restrictions des chemins locaux et distants ; suppression limitée à une ressource gérée identifiée.
- Aucune fuite de clés dans les événements Runner, logs, données de jobs ou erreurs.
- Pas de RPC administratif accessible par la passerelle du portefeuille.
- Refus des plans périmés et recalcul des effets lorsqu'une machine contient plusieurs validateurs.
- Refus des archives ou chemins de restauration qui sortent de la destination.
- Accès OIDC, expiration/révocation et protections CSRF selon le mode de session retenu.
- Adresses de connexion et endpoints contrôlés contre l'utilisation du worker comme relais réseau arbitraire ; les sous-réseaux privés autorisés sont explicites.

## Jeux de données

Le corpus fonctionnel comprend : compte autorisé, compte interdit au contrat, déploiement de contrat, transfert, écriture d'état, événement, revert et changement de groupe de validateurs.

Tester une transaction témoin après reprise valide la capacité d'exécution ; elle ne suffit pas à prouver la disponibilité de tout l'historique. Ajouter des lectures à des hauteurs et types de données correspondant exactement à la couverture annoncée.

Le profil standard de reprise et tout profil d'archive disposent de tests séparés. Pour un benchmark, publier le nombre de blocs/transactions, le volume des bases, les limites d'hôte et la charge concurrente.

## À chaque version

Exécuter les nouveaux scénarios et les régressions affectées. En v1.0, rejouer l'ensemble des scénarios critiques. Consigner explicitement non exécuté quand le runtime ou l'infrastructure manque ; ne pas transformer cette absence en succès.
