# ADR-005 — Sauvegardes et secrets de reprise

Statut : décision d'architecture réservée ; aucune sauvegarde Besu qualifiée en v0.0.

Le futur dépôt restic chiffré et authentifié contiendra des données d'instances arrêtées et un manifeste authentifié. Les configurations publiques, métadonnées PostgreSQL et secrets de reprise seront des objets séparés. Les clés de validateurs ne seront jamais copiées implicitement avec un volume de chaîne. Leur récupération exigera des destinataires indépendants de la console.

Le manifeste devra porter version/digest Besu, OS/architecture, format/synchronisation, genesis et son empreinte, hash du bloc zéro, checkpoint réellement restauré (hauteur/hash/stateRoot), validateurs latest/pending, portée des données historiques et résultat de restauration isolée. Un checksum seul ne prouve ni authenticité ni restaurabilité.

Les backups via nœud temporaire et le PRA réseau restent respectivement v0.6 et v0.8. Aucune version de restic n'est introduite avant sa qualification. Une sauvegarde PostgreSQL de gestion et sa procédure de migration sont documentées dès le socle dans le runbook ; elle ne constitue pas une sauvegarde de chaîne.

Le fencing d'un validateur remplacé devra être prouvé sur l'hôte ou le réseau. Une perte SSH ne suffit pas. Aucun outil v0.0 ne force les validateurs ou ne réécrit un genesis pour réparer un quorum.
