# PostgreSQL : migrations et sauvegarde de gestion

PostgreSQL 18.6. Les migrations SQL sont numérotées, appliquées dans l'ordre sous verrou advisory et une transaction par fichier. Leur SHA-256 est conservé dans schema_migrations. Une migration déjà appliquée modifiée provoque un refus ; ajouter une nouvelle migration au lieu de la réécrire. La commande est `npm run db:migrate` avec DATABASE_URL_FILE fourni hors Git. Le bootstrap Compose l'exécute avant le seed et les processus applicatifs.

Le login propriétaire sert uniquement aux migrations et au peuplement du laboratoire. Les rôles NOLOGIN bpc_api et bpc_worker portent des droits distincts ; leur attribution aux logins réels doit être réalisée par l'administrateur PostgreSQL. L'API peut lire l'inventaire et insérer jobs/étapes/audit. Le worker peut exécuter et réconcilier les jobs ; aucun des deux ne peut modifier l'inventaire ou effacer l'audit. Le propriétaire de base conserve nécessairement des pouvoirs de maintenance : l'audit en base n'est pas une preuve inviolable face à ce propriétaire.

Avant migration hors laboratoire : fermer les nouvelles admissions de jobs, arrêter API/worker, sauvegarder PostgreSQL et ses rôles, conserver la version applicative et les sommes des migrations, exécuter dans une copie de test puis appliquer. Une erreur SQL annule le fichier en cours. Le retour arrière consiste à restaurer une sauvegarde cohérente dans une nouvelle base et relancer l'ancienne application ; aucun down SQL destructeur automatique n'est fourni. Ne pas réintroduire des opérations RUNNING sur une infrastructure vivante sans les réconcilier.

Exemple de dump du **laboratoire local** depuis PowerShell ou un shell POSIX, sans redirection binaire PowerShell :

```sh
docker compose -f infra/compose/compose.yaml exec -T postgres pg_dump -U console_owner -d console -Fc -f /tmp/console.dump
docker compose -f infra/compose/compose.yaml cp postgres:/tmp/console.dump .runtime/console.dump
```

Transférer le dump dans un dépôt chiffré autorisé, avec rétention et accès restreints ; il contient des identités et de l'audit. Les rôles/credentials sont à sauvegarder séparément par une procédure de secrets. Ce dump n'est ni un backup Besu ni un kit PRA.

Pour un exercice isolé : créer une base neuve avec les rôles requis, copier le dump dans le conteneur PostgreSQL puis `pg_restore --exit-on-error --no-owner --dbname=<base-isolee> /tmp/console.dump`. Vérifier schema_migrations, inventaire, audit, états des jobs et droits des logins avant toute bascule. Ne jamais restaurer par défaut sur la base en service. L'exercice dump/restauration doit être consigné séparément de la qualification de redémarrage T01.

Les leases expirés deviennent NEEDS_ATTENTION, et leurs verrous sont libérés sous transaction. Aucun traitement distant n'existe en v0.0. Pour une future mutation SSH, le lease PostgreSQL ne suffira pas : il faudra réconcilier et garantir un fencing sur la cible avant répétition.
