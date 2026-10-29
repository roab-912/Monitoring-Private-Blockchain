# Laboratoire v0.0

Prérequis : Node 24.22.1 et npm 11.19.1, moteur Docker Linux 26.1.1, Compose 2.27.0, accès aux registres au premier démarrage. Réserver au moteur au moins 8 Gio de RAM, 8 CPU et 20 Gio libres pour ce petit laboratoire. Les sous-réseaux Docker 172.29.77.0/24 (chaîne), 172.29.78.0/24 (base), 172.29.79.0/24 (web) et le port hôte 3000 doivent être libres. Les trois plages sont explicites pour empêcher l'allocateur automatique Docker de réserver un /16 chevauchant la chaîne lors d'une reprise. La matrice exécutée se trouve dans STATUS.md.

Depuis un clone neuf et le runtime épinglé :

```sh
npm ci --ignore-scripts
npm run lab:up
```

Après installation des dépendances, `npm run lab:up` est la commande unique de démarrage. Elle initialise les secrets uniquement en l'absence de `.runtime/lab`, construit l'image, applique les migrations, peuple l'inventaire et démarre les services. Ouvrir http://127.0.0.1:3000. Exécuter **dans son terminal personnel**, sans en publier la sortie :

```sh
npm run lab:credentials
```

Coller le jeton Viewer ou Administrator dans la console. La vérification déclenchée à l'écran porte exclusivement sur PostgreSQL ; le résultat est une preuve du worker persistée en base.

Qualification réelle (elle arrête et recrée les conteneurs de ce laboratoire, puis redémarre l'application) :

```sh
npm run check
npm run lab:verify
npx playwright install chromium
npm run test:ui
```

`lab:verify` déploie un nouveau témoin et écrit une valeur bigint, vérifie contrôle d'accès/événement/revert, contrôle les quatre proposeurs et latest/pending, exécute `down` puis `up` **sans supprimer les volumes**, relit identités/données/reçus/logs et soumet une nouvelle transaction. Il arrête ensuite API et worker pour vérifier la progression indépendante de Besu, les redémarre et exécute l'intégration PostgreSQL dans une base temporaire dédiée. Seul le vérificateur monte la clé du compte témoin. Les résultats publics sont exportés vers docs/evidence/v0.0 ; leurs horodatages identifient chaque exécution.

Arrêt normal : `npm run lab:down`. Reprise : `npm run lab:up`. Ne pas utiliser `down -v`, ne pas effacer `.runtime/lab` et ne pas remplacer le genesis actif. Le programme refuse un laboratoire partiel ou une divergence de clé/genesis au lieu de les régénérer. Pour une autre chaîne, utiliser un autre dossier et adapter explicitement le nom de projet et le sous-réseau ; ne pas réemployer les clés de la référence.

Le genesis réellement utilisé est `.runtime/lab/genesis.json`, public mais propre au laboratoire initialisé. `.runtime/lab/public.json` contient le manifeste public et son SHA-256. `infra/lab/genesis.json` et `manifest.json` sont la référence versionnée de la qualification initiale, sans clés privées. Un clone neuf génère une autre chaîne avec ses propres clés ; il ne tente pas d'utiliser le genesis de référence sans ses identités.

Les volumes `v1_data`…`rpc_data` sont indépendants de `v1_keys`…`rpc_keys`. La configuration est sous `.runtime/lab/instances/<nom>/config`. Les ports internes sont P2P 30303–30307, HTTP 8545–8549, métriques 9545–9549. Ces ports sont réservés au modèle d'hôte mais non publiés. Les chemins `/srv/bpc/...` affichés sont le namespace cible natif ; Compose réalise l'isolation avec des volumes et montages distincts. Aucun service systemd n'est installé sur Windows.

Les répertoires de secrets sont créés en 0700 et les fichiers en 0600 sur POSIX. `.runtime/lab/compose.env` fait correspondre les processus applicatifs à l'UID/GID de l'opérateur POSIX pour lire ces fichiers ; utiliser un compte non privilégié. Les clés Besu copiées dans les volumes Linux appartiennent à UID 1000 en 0400. Les fichiers d'initialisation PostgreSQL sont copiés dans un volume distinct pour UID 999, sans exposer les credentials des autres services. Sous Windows vérifier les ACL du répertoire de travail ; chmod ne remplace pas les ACL NTFS. Les secrets Compose restent des fichiers, sans chiffrement au repos fourni par ce projet.

En cas d'échec : `docker compose -f infra/compose/compose.yaml ps -a`, puis les logs ciblés de `v1`, `api`, `worker`, `migrate` ou `volume-init`. Ne pas publier les sorties de credentials, les fichiers de secrets ou un dump de base. Une collision de réseau/port exige de corriger le profil et ses configurations avant de relancer, sans arrêter d'autres services. Une erreur de clé ou de genesis exige la récupération des fichiers d'origine ; aucun mode de réparation forcée n'est fourni.

Les seules ressources préparées avec privilèges sont les racines des volumes du laboratoire par `volume-init`, sans réseau ni socket Docker. Les clés sont copiées seulement si absentes ; une différence est un échec. Les données de chaîne ne sont jamais supprimées ni parcourues récursivement par cet outil.
