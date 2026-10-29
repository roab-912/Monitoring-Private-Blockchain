# Contrats d'exploitation

Les procédures ci-dessous sont les comportements à construire et à tester. Elles ne constituent pas des commandes de production déjà validées.

## 1. Jobs et réconciliation

Cycle commun :

~~~text
DRAFT → PLANNED → AWAITING_APPROVAL → QUEUED → RUNNING → VERIFYING → SUCCEEDED
~~~

États supplémentaires : FAILED, CANCELED, NEEDS_ATTENTION. Chaque étape possède une preuve, une échéance et un état observé. L'approbation est liée à l'empreinte d'un plan et à sa durée de validité.

Les lectures et les retries idempotents peuvent être automatiques. Un arrêt critique, un effacement ou une restauration exige le plan prévu. Annuler un job n'annule pas un vote déjà inscrit dans la chaîne et ne restaure pas magiquement un service. Les compensations sont explicites.

Après perte de SSH ou crash du worker, vérifier l'état distant avant toute répétition. Utiliser un identifiant d'opération persistant côté cible pour éviter deux installations ou snapshots concurrents. Un verrou PostgreSQL seul ne suffit pas si une exécution distante se poursuit après expiration du lease.

## 2. Ajouter une machine puis plusieurs nœuds

1. Déclarer nom, adresse, port SSH, utilisateur, référence de clé, domaine de panne et racine d'installation. Pour le mode local, sélectionner l'hôte local explicitement disponible.
2. Vérifier l'empreinte de la clé SSH avec une source de confiance extérieure à la connexion initiale. Une empreinte récupérée par simple scan n'est pas une preuve d'identité.
3. Tester l'accès et inspecter OS, architecture, disque, RAM, ports, horloge et privilèges disponibles.
4. Créer une ou plusieurs instances : usage, dossier dédié, profil Besu, ports, limites de ressources et budget de stockage.
5. Afficher un plan d'installation précis. Refuser chemins partagés, ports réservés, profil incompatible et capacité insuffisante.
6. Préparer le serveur, installer les binaires vérifiés, générer chaque clé sur l'hôte, déployer configurations et services séparés.
7. Appliquer le permissioning de manière cohérente sur les pairs concernés, assurer la persistance puis connecter les nouveaux nœuds à plusieurs pairs connus.
8. Démarrer comme non-validateurs, suivre la synchronisation et vérifier l'identité du réseau.
9. Proposer séparément une promotion en validateur.

Relancer une installation identique doit converger sans recréer les clés ni vider les données. Un dossier non vide non géré exige un parcours explicite d'adoption, en lecture seule d'abord.

Le formulaire peut proposer « Ajouter N nœuds sur cette machine », mais produit N instances et N étapes vérifiables. Il calcule l'effet sur RAM, disque, ports et domaines de panne. Les échecs partiels restent visibles ; les instances réussies ne sont pas effacées pour masquer le résultat.

## 3. Démarrage, arrêt et suppression

Les actions concernent une instance, une sélection d'instances ou toutes les instances gérées d'une machine. Avant une action groupée, additionner les validateurs réellement affectés, y compris ceux déjà indisponibles.

Pour un arrêt ordinaire, préserver le quorum et la marge imposée par la politique. La procédure explicite d'arrêt global constitue une autre opération. Le calcul est revérifié avant chaque étape ; les données périmées entraînent le refus ou NEEDS_ATTENTION.

« Supprimer un nœud » se décompose en :

1. Retirer son rôle de validateur si nécessaire, pendant que le réseau peut encore voter.
2. Vérifier l'ensemble effectif pour le bloc suivant et la continuité de production.
3. Arrêter le service.
4. Retirer son peering/permissioning en conservant les bootnodes nécessaires.
5. Désinstaller le service.
6. Effacer les données uniquement si cette action figure dans le plan approuvé.

Ne jamais supprimer implicitement une machine entière parce que sa dernière instance a été retirée. Ne pas révoquer la connectivité d'un validateur avant que son retrait effectif soit confirmé.

## 4. Référence de santé

Collecter au minimum eth_chainId, eth_blockNumber, eth_getBlockByNumber, eth_syncing, net_peerCount et les appels QBFT en lecture nécessaires. Ajouter l'état du service et les métriques CPU, mémoire, disque, I/O, réseau, version et accès SSH.

Pour chaque observation, conserver l'instant de collecte et celui du bloc. Comparer les hash à une **même hauteur**. La hauteur maximale annoncée par un endpoint ne devient pas automatiquement la référence.

La référence utilise des nœuds connus, leurs adresses, leur fraîcheur et leur indépendance de domaine. Montrer combien de sources concordent ; en cas de désaccord, exposer le problème et bloquer les mutations sensibles. Une concordance d'endpoints ne prouve pas l'absence de comportement byzantin.

| Dimension | États à distinguer |
| --- | --- |
| Machine | Joignable, accès SSH perdu, ressources insuffisantes, inconnue |
| Service Besu | Actif, arrêté, crash, état inconnu |
| Données | À jour, en synchronisation, en retard, hash divergent |
| Réseau | En progression, progression arrêtée, observation insuffisante, maintenance prévue |
| Validateur | Membre effectif, candidat, retrait en cours, activité observée, activité inconnue |

Mesures utiles : retard en blocs, durée sans progression locale, durée sans progression du réseau, fraîcheur des collectes et marge de quorum estimée.

Un nœud est suspect de blocage si sa hauteur ne progresse plus alors que plusieurs références cohérentes progressent. Un réseau entier immobile ne se traite pas comme une panne de chacun de ses nœuds. Adapter les délais aux paramètres de blocs vides, aux timeouts et aux fenêtres de maintenance.

qbft_getSignerMetrics renseigne les propositions de blocs sur une plage [S2]. Ne pas présenter cette métrique comme un décompte exhaustif des signatures de commit. Si ce détail est nécessaire, construire et tester un décodeur des sceaux QBFT séparé.

## 5. Promotion et retrait des validateurs

Préconditions de promotion : identité et genesis conformes, version qualifiée, réseau joignable, synchronisation et hash vérifiés, ressources suffisantes, politique de placement respectée.

1. Lire les ensembles latest et pending à un point connu.
2. Calculer le seuil de vote, le quorum de production et la marge avant/après, en tenant compte de tous les nœuds de la machine.
3. Autoriser le plan et appeler qbft_proposeValidatorVote auprès des validateurs habilités.
4. Suivre les propositions locales puis les votes réellement inclus dans les en-têtes.
5. Confirmer le nouvel ensemble pending, puis la production d'un bloc avec cet ensemble.
6. Vérifier la convergence des observations et nettoyer les propositions locales restantes.

Les noms exacts des RPC, leurs valeurs de retour et leurs effets sont couverts par des tests de capacité sur la version Besu retenue [S2]. Une réponse true signifie que la demande locale a été acceptée, pas que la promotion est effective.

Une promotion 4 → 5 change aussi le quorum de production : le nouveau nœud doit être opérationnel avant la finalisation du changement. Vérifier tous les effectifs intermédiaires lors d'opérations multiples.

Les epochs réinitialisent les votes accumulés selon le comportement Besu ; suivre les propositions persistantes et ne pas supposer qu'un timeout annule la demande. Une annulation retire les propositions locales encore actives ; des votes déjà inscrits ne sont pas effacés rétroactivement [S1].

Si le réseau ne produit plus assez de blocs pour voter, l'interface ne prétend pas le réparer par un simple RPC. Relever les validateurs nécessaires ou appliquer un runbook d'urgence séparé. Aucun contournement automatique du consensus.

## 6. Sauvegarde sans interruption du réseau

Le terme exact est « réseau maintenu en service, copie d'un nœud temporaire arrêté ».

1. Choisir une machine disposant des capacités nécessaires, ou installer une instance temporaire isolée sur une machine existante.
2. Créer une nouvelle identité non validatrice ; lui attribuer ses propres ports et données.
3. Synchroniser avec le profil qualifié et vérifier un checkpoint commun à plusieurs références.
4. Arrêter proprement cette seule instance et confirmer la fermeture du processus et de ses fichiers.
5. Sauvegarder données, genesis, configurations publiques et manifeste dans le dépôt chiffré.
6. Restaurer une copie de test en isolement réseau, avec une nouvelle identité non validatrice.
7. Lire sa tête réelle, vérifier hash et stateRoot, disponibilité des données annoncées et état du contrat témoin ; rapprocher le checkpoint avec les références.
8. Finaliser le manifeste avec la hauteur réellement restaurée et les preuves.
9. Nettoyer le nœud temporaire et son permissioning après réussite ou selon un état d'échec explicite.

La hauteur lue juste avant l'arrêt peut différer de la tête effectivement sauvegardée. La restauration isolée détermine ce point exact. Ne pas promettre un snapshot à une hauteur choisie sans mécanisme vérifié.

Préférer la réutilisation d'une instance de sauvegarde non validatrice pour éviter un rattrapage intégral à chaque opération, tout en conservant l'option « nouveau nœud ». Dans les deux cas, ses I/O sont limitées afin de préserver les validateurs colocalisés.

La v0.6 copie des fichiers après arrêt propre. Les snapshots à chaud d'une base ouverte restent hors périmètre jusqu'à qualification d'un mécanisme cohérent spécifique.

## 7. Manifeste et secrets de reprise

Le manifeste versionné comprend :

- ID du réseau et du backup, chainId, hash du bloc genesis et empreintes des fichiers de configuration.
- Version/digest Besu, OS/architecture, format de stockage, mode de synchronisation et options influant sur l'historique.
- Hauteur, hash et stateRoot réellement vérifiés ; checkpoints et sources ayant servi à la comparaison.
- SnapshotId, tailles, sommes de contrôle, état d'intégrité, origine et dates.
- Instances et usages couverts ; composants inclus et exclus.
- Ensemble des validateurs au point sauvegardé et ensemble attendu pour le bloc suivant.
- Références des secrets scellés, procédure de récupération et matrice de compatibilité.
- Résultat et date des vérifications de restauration ; limites de l'historique disponible.

Une empreinte SHA-256 isolée ne protège pas contre une modification malveillante de l'archive et du manifeste. Utiliser le stockage authentifié du moteur de sauvegarde et une signature ou enveloppe authentifiée du manifeste final.

Séparer trois objets : données de chaîne, métadonnées de gestion et secrets de reprise. Pour les validateurs, prévoir une sauvegarde des clés chiffrée pour des destinataires de récupération indépendants. La clé de déchiffrement ne doit pas être conservée uniquement dans l'application qu'il faut restaurer.

Un backup de chaîne non validatrice permet de reconstruire un état de chaîne. Il ne remplace pas les identités nécessaires au quorum. Le backend de secrets, ses moyens de récupération, l'accès au dépôt et l'identité de signature des manifests font partie du PRA.

Bonsai et Forest ont des comportements historiques différents [S4]. Définir un profil de reprise et un profil d'archive optionnel ; ne pas convertir un format par simple changement d'option. Déclarer séparément disponibilité des blocs, reçus et états historiques.

## 8. Restaurer un nœud pendant que le réseau existe

Par défaut : nouvelle instance, nouveaux ports et nouvelle clé, restauration dans un dossier vide, vérifications isolées puis rattrapage depuis le réseau courant. Réintégrer comme non-validateur.

Pour remplacer un validateur avec une nouvelle clé : le réseau vivant doit pouvoir voter le remplacement, selon une séquence dont chaque étape préserve le quorum. Si c'est impossible, la reprise relève d'un incident réseau.

Pour reprendre exactement l'identité d'un ancien validateur : prouver que l'ancienne instance est arrêtée ou isolée durablement. Si elle est inaccessible par SSH, cette inaccessibilité ne prouve pas son arrêt ; demander une preuve d'isolation au niveau hyperviseur ou réseau avant activation.

Préserver l'ancien dossier en quarantaine avant bascule, vérifier propriétaires et permissions et ne jamais faire de restauration destructrice en place par défaut.

## 9. Sauvegarde à froid et reprise complète

1. Verrouiller les changements de topologie et mettre l'application en maintenance.
2. Fermer tous les chemins de soumission contrôlés ; inventorier les autres émetteurs et gérer les transactions en attente.
3. Enregistrer un checkpoint confirmé et l'état des validateurs.
4. Arrêter les instances concernées, en conservant l'accès SSH et le worker de gestion.
5. Confirmer tous les arrêts. Si un serveur est injoignable, ne pas déclarer le réseau complètement arrêté.
6. Sauvegarder les données cohérentes des instances, configurations, métadonnées, artefacts d'installation et secrets scellés.
7. Les arrêts n'étant pas simultanés, enregistrer les têtes par instance, vérifier leurs historiques communs et choisir un point de reprise effectivement couvert. Une source plus haute est validée, jamais retenue sur sa seule hauteur.
8. Vérifier le jeu complet, puis redémarrer le réseau d'origine ou laisser l'arrêt effectif selon le plan demandé.

PRA : restaurer d'abord les accès de récupération et l'application minimale, puis des serveurs propres ; rétablir un nombre suffisant d'identités du groupe de validateurs correspondant au point restauré. Les validateurs restaurés ne deviennent pas actifs un par un sur un réseau de production encore vivant.

Isoler le réseau de reprise des anciennes instances avant tout démarrage susceptible de signer. Vérifier les données, restaurer les identités séparément, démarrer le quorum, vérifier la production et soumettre une transaction témoin, puis rouvrir les admissions.

Un rollback à une ancienne sauvegarde peut perdre des blocs postérieurs et demande une réconciliation des applications. Un ancien réseau encore actif doit être neutralisé. Un changement forcé de genesis/validateurs constitue une procédure exceptionnelle distincte, jamais une restauration ordinaire.

Un backup « machine » regroupe les instances et configurations sélectionnées. La création d'un nœud temporaire ne sauvegarde pas l'OS ni les autres services de la machine source. Les images complètes de VM sont un connecteur futur.

## 10. RPO, RTO et mises à jour

RPO : perte de données maximale visée, évaluée depuis le point de chaîne effectivement couvert par le dernier backup vérifié. La date de fin d'upload ne représente pas ce point.

RTO : délai de reprise incluant récupération des secrets, disponibilité des machines, transfert, vérification, rattrapage ou redémarrage du quorum et contrôle applicatif.

Fixer des objectifs après mesure sur un volume et un matériel documentés. Ne pas promettre une durée de restauration indépendante de la taille de chaîne.

Avant mise à jour Besu : tester le chemin supporté sur une copie, sauvegarder, vérifier quorum et domaines de panne, appliquer par instance et observer la production avant de poursuivre. Si un serveur héberge plusieurs validateurs, ne pas les redémarrer tous implicitement.

Un retour à une ancienne image peut être incompatible avec une base migrée. Le plan de retour utilise un chemin qualifié ou une sauvegarde compatible [S5, S7].
