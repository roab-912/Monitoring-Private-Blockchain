# Console de gestion d'une blockchain privée Besu

Dossier de cadrage et console au jalon **v0.1 : explorateur et connexion vérifiée à une chaîne Besu existante**. Édition du 29 octobre 2026. L'administration distante reste hors périmètre de cette version.

## Démarrage v0.1

Prérequis : Node **24.22.1**, npm **11.19.1**, Docker Linux et Compose. Les versions/digests sont dans [infra/versions.json](infra/versions.json), la matrice réellement exécutée dans [docs/STATUS.md](docs/STATUS.md).

```sh
npm ci --ignore-scripts
npm run lab:up
```

Ouvrir **http://127.0.0.1:3000**. Obtenir le jeton local avec `npm run lab:credentials` dans un terminal personnel ; ne pas partager sa sortie. L'explorateur affiche les blocs, transactions, reçus et logs indexés sur Besu réel, avec recherche, pagination, source et fraîcheur. L'onglet Socle et inventaire conserve la v0.0. Le laboratoire comprend quatre validateurs QBFT et un nœud RPC non validateur, sur **un seul domaine de panne physique**.

```sh
npm run check       # épinglage, lint, typage, tests unitaires, build, contrat, OpenAPI
npm run lab:verify  # Besu réel, témoin, redémarrage T01, RBAC et intégration PostgreSQL
npm run lab:explorer:verify # indexeur SIGKILL, panne RPC, T02/T03 et injections séparées
npx playwright install chromium
npm run test:ui    # navigateur réel sur le laboratoire démarré
npm run lab:down   # arrêt sans suppression des volumes ou clés
```

Exécuter ces commandes séquentiellement : les tests de laboratoire interrompent des services. Le genesis actif et les clés sont propres à chaque laboratoire, sous `.runtime/lab` ignoré par Git ; le genesis public sous `infra/lab` est celui de la référence qualifiée. Un clone neuf génère ses propres identités. Aucune clé applicative n'est confiée à l'API ou au worker ; le compte témoin appartient uniquement à l'outil opérateur de qualification.

Instructions détaillées : [explorateur et connexion](docs/runbooks/EXPLORER.md), [laboratoire](docs/runbooks/LAB.md), [OIDC et droits](docs/runbooks/AUTH.md), [migrations et sauvegarde PostgreSQL](docs/runbooks/DATABASE.md), [ADR](docs/adr/), [OpenAPI généré](docs/generated/openapi.json), [preuves v0.1](docs/evidence/v0.1/).

Les sources RPC sont autorisées dans un fichier d'opérateur, avec leurs sous-réseaux permis. Un Administrator sélectionne leurs IDs et renseigne les identifiants de réseau et le hash de genesis attendu. Le worker vérifie la connexion avant activation ; le navigateur ne soumet aucune URL RPC libre. Un désaccord ou un reçu manquant suspend l'indexation sans effacer l'historique. Les montants et hauteurs sont des chaînes exactes dans l'API. L'explorateur ne fournit ni signature, ni soldes courants, ni transferts internes, ni archive d'états historiques.

Dans l'environnement Windows de réalisation, Node épinglé a été installé localement sans modifier le système. Pour cette copie de travail, activer ce runtime dans PowerShell avant les commandes :

```powershell
$env:Path = "$PWD\.runtime\tools\node-v24.22.1-win-x64;$env:Path"
```

## Résultat attendu

Construire une application auto-hébergée qui permet d'explorer une blockchain privée compatible Ethereum, d'interagir avec des contrats et d'administrer ses serveurs : inventaire, SSH ou exécution locale, installation, démarrage, arrêt, gouvernance des validateurs, sauvegardes, restaurations et maintenance.

Le choix de départ est **Besu + QBFT**, avec sélection des validateurs par vote dans les en-têtes de blocs. Le mot « authority » employé dans l'interface désigne un validateur QBFT. Ce dossier est une proposition d'architecture ; les versions logicielles et leurs capacités exactes seront vérifiées au début de l'implémentation.

## Cadrage et progression

1. Décompresser le dossier et placer son contenu à la racine du nouveau dépôt.
2. Lire ROADMAP.md, puis docs/ARCHITECTURE.md et docs/OPERATIONS.md.
3. Copier le premier prompt de prompts/DEMARRAGE_CODEX.md dans Codex.
4. Faire réaliser une seule version à la fois, en commençant par v0.0.
5. Vérifier les critères de sortie de docs/versions/vX.Y.md avant de demander la version suivante.

Les dossiers apps/, packages/, infra/ et tests/ contiennent désormais le socle v0.0 et l'explorateur v0.1. Les capacités ultérieures restent des spécifications ; une commande de bootstrap du laboratoire ne constitue pas une administration d'hôtes depuis l'interface.

## Documents

| Document | Usage |
| --- | --- |
| [ROADMAP.md](ROADMAP.md) | Périmètre, dépendances et versions |
| [AGENTS.md](AGENTS.md) | Règles permanentes pour Codex |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Composants, données, sécurité et limites |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Enrôlement, votes, sauvegardes et reprise |
| [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) | Scénarios qui prouvent le fonctionnement |
| [docs/SOURCES.md](docs/SOURCES.md) | Sources primaires et statut des choix |
| [docs/versions/](docs/versions/) | Spécification détaillée de chaque version |
| [prompts/DEMARRAGE_CODEX.md](prompts/DEMARRAGE_CODEX.md) | Instructions à copier dans Codex |

## Hypothèses de départ

- Un seul réseau administré par installation ; chaque donnée porte néanmoins un identifiant de réseau.
- Des serveurs Linux dédiés ou des VM déjà disponibles, reliés par un réseau privé ou un VPN déjà configuré.
- Plusieurs nœuds par machine sont supportés, y compris plusieurs validateurs. La topologie de référence répartit quatre validateurs sur quatre domaines de panne ; l'interface calcule les risques des autres répartitions.
- Quatre validateurs pour le laboratoire ; un nœud RPC non validateur ; un nœud de sauvegarde temporaire.
- Les clés des comptes applicatifs restent dans des portefeuilles externes.
- Les clés de nœud Besu sont stockées sur leur hôte ; leur sauvegarde relève d'une procédure de secrets distincte.
- Pilotage des hôtes par SSH depuis un worker isolé et des playbooks Ansible versionnés. Le mode local utilise les mêmes opérations, dans un répertoire dédié. Aucun agent propriétaire n'est requis dans V1.
- L'interface est en français par défaut. Code, identifiants et contrats d'API en anglais.

Si l'expression « Hyperledger » visait Fabric, il faut reprendre le cadrage avant d'implémenter : le modèle de nœuds, de contrats et de consensus de ce dossier est celui de Besu/EVM.
