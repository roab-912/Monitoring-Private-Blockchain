# ADR-007 — Connexion vérifiée et indexation en lecture seule

Statut : accepté pour v0.1, 29 octobre 2026.

## Connexion et origine

Une seule connexion d'exploration est active à la fois. Elle référence un réseau et une à trois sources autorisées par l'opérateur. L'administrateur saisit chainId, networkId et le hash du bloc genesis attendus ; le worker vérifie leur concordance, Besu 26.9.0, le format QBFT par en-têtes et les méthodes de lecture réellement utilisées. `rpc_modules` seul ne suffit pas. Ce contrôle ne modifie aucune configuration Besu.

`network.connect` est un job durable, audité et idempotent. Il conserve le plan et la génération de connexion attendue. Seule une vérification réussie active la connexion ; une demande devenue périmée échoue. L'ancienne connexion et son historique restent disponibles en cas d'échec. Un réseau déjà connu conserve son identité et son origine ; le nom du premier enregistrement est conservé.

Le réseau du laboratoire est `managed`. Son bootstrap part des instances et du genesis local contrôlés par l'opérateur, confronte extraData/timestamp/gasLimit au fichier monté, puis relève le hash réel du bloc zéro auprès des sources locales. Une identité déjà enregistrée différente est refusée. Le genesis et les clés ne sont pas réécrits.

Un réseau externe est `imported`. Son hash de genesis attendu provient d'une référence de confiance de l'opérateur, pas d'un chainId seul. Son fichier genesis original et son SHA-256 restent NULL lorsqu'ils ne sont pas disponibles : le bloc RPC zéro n'est pas présenté comme ce fichier. Un enregistrement en attente n'est jamais présenté comme une connexion opérationnelle. La conservation de plusieurs identités en base ne crée pas un tableau de bord multi-réseaux : seul le réseau actif est indexé et consulté.

## Frontières RPC

Le navigateur et l'API n'accèdent pas au réseau RPC. Le worker utilise un fichier d'opérateur `RPC_SOURCES_FILE`, monté en lecture seule : IDs, labels, URL et sous-réseaux explicitement autorisés. L'API ne propose que les IDs/labels ; aucune URL, méthode ou en-tête arbitraire n'est accepté depuis le navigateur.

L'adaptateur autorise seulement eth_chainId, net_version, web3_clientVersion, rpc_modules, eth_blockNumber, eth_getBlockByNumber, eth_getTransactionReceipt et eth_getLogs. Les adresses DNS sont vérifiées puis fixées pour la connexion TCP ; redirections et URLs avec credentials/query/fragment sont refusées. HTTPS utilise la validation normale des certificats. Les RPC avec authentification applicative spécifique ne sont pas pris en charge dans ce profil.

Le worker rejoint le réseau privé chain pour ces lectures. C'est l'évolution prévue de la collecte évoquée dans l'architecture ; l'API conserve son isolation. Aucun shell, socket Docker ou pouvoir d'installation n'est ajouté au worker.

## Curseur et cohérence

Un verrou advisory PostgreSQL par réseau sérialise les indexeurs. Chaque bloc est lu à la même hauteur sur toutes les sources configurées, puis vérifié avec son parent et ses transactions. Les reçus doivent tous être présents et cohérents, y compris statut, logs et rattachement au bloc. L'insertion du bloc, de ses transactions, reçus, logs et du curseur constitue une seule transaction PostgreSQL. Un crash annule le bloc incomplet ; les contraintes d'unicité empêchent les doublons. La génération active est revérifiée avant commit.

Le parent du prochain bloc doit correspondre au curseur, et le checkpoint déjà persisté est relu après reprise. Une divergence suspend l'avancement sans effacer ni réécrire l'historique. Aucune réparation automatique par rollback de chaîne, changement de validateurs ou genesis n'existe.

Besu 26.9.0 peut conserver des sous-ensembles de sceaux de commit différents pour le même bloc QBFT. La comparaison neutralise uniquement le round et les sceaux de l'extraData des blocs non genesis, conformément à [BftBlockHashing](https://raw.githubusercontent.com/besu-eth/besu/26.9.0/consensus/common/src/main/java/org/hyperledger/besu/consensus/common/bft/BftBlockHashing.java). Les autres données, les hash, stateRoot, transactions et reçus restent comparés. Ce contrôle n'est pas un décodeur ni un audit des signatures de commit.

Toutes les sources sélectionnées doivent répondre et concorder. Une source indisponible bloque l'avancement ; l'historique déjà vérifié continue d'être servi depuis PostgreSQL. Avec une source unique, la vérification croisée n'existe pas et cette limite est visible. Le minimum des hauteurs annoncées détermine la hauteur pouvant être lue sur toutes les sources ; il ne constitue pas un diagnostic de consensus ou d'indépendance physique.

## Restitution et limites

Les montants, hauteurs et quantités restent bigint aux calculs, numeric en PostgreSQL et chaînes aux frontières JSON. Seuls les index de listes bornées et les compteurs de page deviennent des nombres JavaScript. Le rendu des timestamps utilise une conversion entière bornée pour Date ; la valeur Unix originale reste disponible.

La pagination utilise des curseurs exclusifs par hauteur ou paire hauteur/index, limités à 50 éléments. Un quota durable par identité limite à 120 lectures et 10 soumissions par minute. Les pages affichent identité réseau, provenance, horodatages et retard. Une observation sans succès depuis quinze secondes est périmée. Un reçu manquant suspend le bloc entier ; aucune transaction de ce bloc n'est présentée comme réussie.

L'explorateur fournit l'activité directe des adresses et les logs bruts. Il ne fournit ni solde courant, ni transferts internes, ni décodage ABI, ni mempool, ni archive d'états historiques. Les limites de traitement (8 Mio par réponse RPC, 2048 transactions et 4096 logs par bloc, appels HTTP de quatre secondes) peuvent suspendre l'index plutôt que produire un résultat tronqué. Seul le petit laboratoire BONSAI/FULL est qualifié ici.
