# ADR-006 — Observations, quorum et placement

Statut : accepté pour le socle v0.0, 28 octobre 2026.

Le domaine expose séparément quorum de consensus `ceil(2N/3)` et seuil de vote `floor(N/2)+1`. Pour quatre validateurs, trois sont nécessaires à la production. Les gardes refusent observations périmées, futures, divergentes ou budget de quorum insuffisant. Les tests de ces gardes sont unitaires ; ils ne prouvent pas les pannes distribuées T10–T15.

Le placement est calculé sur des identités validatrices uniques et des domaines physiques déclarés, pas sur le nombre de conteneurs, d'adresses IP ou de VM. Deux validateurs sur chacun de deux hôtes perdent le quorum à la perte d'un hôte. La politique laboratory accepte explicitement l'unique domaine physique et le signale à l'écran. La politique de production et les collectes de santé seront mises en œuvre avec v0.3.

L'inventaire affiché dans v0.0 est déclaratif. Aucun indicateur d'état de consensus simulé n'est présenté. Le vérificateur de laboratoire compare les cinq nœuds à une même hauteur, leurs hash et stateRoot, les groupes latest/pending et la progression. Il contrôle que chacun des quatre validateurs a proposé un bloc. Les signer metrics ne sont pas un décompte des signatures de commit.

Le calcul des gardes restera une précondition à revalider dans les futurs jobs mutateurs, avec observation fraîche et verrou réseau/nœud. Aucune conclusion de panne n'est tirée d'une seule métrique.
