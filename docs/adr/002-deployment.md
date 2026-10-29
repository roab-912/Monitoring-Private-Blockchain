# ADR-002 — Linux/systemd en cible, Compose en laboratoire

Statut : accepté pour v0.0, 28 octobre 2026.

La cible d'administration restera Linux natif avec un service systemd par instance. Son installation SSH/local et ses playbooks versionnés appartiennent à v0.2 et ne sont pas livrés ici. Compose constitue uniquement le laboratoire reproductible.

Chaque instance a un volume de données, un volume de clé monté en lecture seule, une configuration, des ports P2P/HTTP/métriques distincts, une limite CPU et une limite mémoire. Le budget disque en base est déclaratif ; aucun quota de volume n'est revendiqué. Les logs et PID sont propres à chaque conteneur ; Docker conserve les logs sur l'hôte.

L'image Besu utilise par défaut un entrypoint qui ajuste les permissions et exécute `su`. Nous appelons directement le binaire en UID/GID 1000, avec toutes les capabilities retirées, racine en lecture seule et tmpfs exécutable pour les bibliothèques natives. Un conteneur ponctuel sans réseau prépare exclusivement les racines de volumes et copie les clés locales si absentes, sans régénération ni changement d'identité. Ses seules capabilities sont CHOWN et DAC_OVERRIDE ; il ne possède aucun socket Docker.

Le réseau P2P interne utilise 172.29.77.0/24 et des adresses numériques fixes, exigées par `p2p-host`. Les réseaux base et web utilisent aussi des plages explicites (172.29.78.0/24 et 172.29.79.0/24), afin qu'une allocation automatique /16 ne chevauche pas le réseau de chaîne lors d'une recréation. Une collision externe de sous-réseau fait échouer Compose ; adapter explicitement ce profil en conservant les identités. Aucun port Besu ni PostgreSQL n'est publié. Seule la console écoute sur 127.0.0.1:3000. Le navigateur, l'API et le worker ne sont pas attachés au réseau chain.

Cinq conteneurs sur un hôte représentent un seul domaine de panne. Le démarrage et l'arrêt des services applicatifs n'entraînent pas celui de Besu. Les volumes ne sont jamais supprimés par les scripts courants.
