# ADR-004 — BONSAI/FULL et couverture historique

Statut : accepté pour v0.0, 28 octobre 2026.

Le profil testé est BONSAI avec synchronisation FULL, sur une petite chaîne QBFT Berlin. La qualification contrôle l'état courant du témoin, un reçu réussi, un reçu annulé, un événement et le hash de leur bloc après redémarrage. Elle ne prétend pas couvrir tout l'historique d'état, une grande base, un rattrapage prolongé ou une migration de format.

BONSAI n'est pas présenté comme un profil archive. FOREST/FULL est réservé dans le schéma comme profil futur ; il n'est pas qualifié et ne peut être activé depuis l'interface. Aucun changement de format en place n'est fourni.

Le genesis actif, ses clés et les données persistent séparément. Un redémarrage Compose conserve les volumes ; une restauration depuis sauvegarde reste hors v0.0. Les sauvegardes des fichiers d'une base Besu ouverte ne sont jamais considérées cohérentes par défaut.

Source : [formats de stockage Besu](https://docs.besu-eth.org/public-networks/concepts/data-storage-formats).
