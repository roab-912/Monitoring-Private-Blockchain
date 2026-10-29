# Prompts à copier dans Codex

## Première session

~~~text
Nous construisons une console d'exploitation de blockchain privée Besu/QBFT.

Le dépôt contient un dossier de cadrage : README.md, ROADMAP.md, AGENTS.md,
docs/ARCHITECTURE.md, docs/OPERATIONS.md, docs/ACCEPTANCE.md,
docs/SOURCES.md et docs/versions/.

Lis ces documents, puis implémente uniquement docs/versions/v0.0.md.

Exigences structurantes :
- une machine peut héberger plusieurs instances Besu ;
- chaque instance a ses propres clés, données, ports, service et limites ;
- les machines seront contrôlées depuis l'interface par SSH ou en mode local,
  via des automatisations versionnées ;
- installer une instance et la promouvoir validatrice sont deux opérations ;
- le consensus fonctionne sans la console ;
- aucune gestion serveur des clés de compte applicatif ;
- aucune fonction simulée présentée comme opérationnelle.

Vérifie et épingle les versions réellement supportées. Réalise le socle,
le laboratoire Besu réel, les ADR et les critères de sortie de v0.0.

Si un point secondaire manque, prends une décision raisonnable et documente-la.
Si une contrainte bloque réellement le fonctionnement ou la sécurité,
explique précisément le blocage.

Termine par les changements, les commandes exécutées, les résultats,
les limites et la commande de démarrage.
Mets à jour CHANGELOG.md et docs/STATUS.md. Ne commence pas v0.1.
~~~

## Sessions suivantes

~~~text
Lis AGENTS.md, ROADMAP.md, docs/STATUS.md et les documents d'architecture.

Implémente uniquement la version vX.Y décrite dans docs/versions/vX.Y.md.
Vérifie les critères des versions précédentes qui sont affectés.

Conserve les capacités déjà livrées. Termine les parcours réels interface,
API, worker, automatisation et persistance concernés par cette version.
Exécute les scénarios d'acceptation prévus sur Besu réel lorsque requis.

Documente les décisions, migrations, résultats et limites.
Ne déclare pas exécuté un test qui ne l'a pas été.
Mets à jour CHANGELOG.md, docs/STATUS.md et les runbooks.
Arrête-toi au périmètre de vX.Y.
~~~

Remplacer les deux occurrences vX.Y par la version demandée.

## Si une version est partiellement livrée

~~~text
Reprends la version vX.Y en cours à partir de docs/STATUS.md.
Commence par comparer les preuves existantes aux critères de sortie.
Termine les éléments manquants et corrige les échecs ; ne réécris pas
les fonctionnalités déjà validées sans nécessité.
N'avance pas à la version suivante avant d'avoir documenté les critères
effectivement atteints et les éventuels blocages restants.
~~~
