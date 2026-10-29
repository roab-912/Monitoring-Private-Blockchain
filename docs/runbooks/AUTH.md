# Authentification v0.0

Compose est un profil **laboratory** isolé, avec jetons aléatoires locaux. Aucun secret par défaut ni jeton connu n'est livré. Le mode development est refusé en production et sans LAB_ISOLATED=true ; le profil local exige APP_HOST=127.0.0.1 ou ::1. Ne pas publier ce profil sur un réseau partagé.

Pour une installation OIDC hors laboratoire, construire l'application avec `npm run build`, fournir PostgreSQL migré et un fournisseur HTTPS. L'API reçoit les paramètres suivants, sans DEV_TOKENS_FILE :

```text
APP_PROFILE=production
AUTH_MODE=oidc
APP_HOST=127.0.0.1
DATABASE_URL_FILE=/run/secrets/api_database_url
OIDC_ISSUER=https://identity.example/realms/console
OIDC_AUDIENCE=console-api
OIDC_CLIENT_ID=console-web
OIDC_SCOPE=openid profile console-api
```

Déclarer un client public PKCE S256, flux code, callback exact `https://console.example/` et retour logout identique. Publier le site derrière un reverse proxy TLS de confiance ; conserver les RPC Besu privés. Les endpoints du fournisseur utilisés par le navigateur doivent partager l'origine HTTPS de l'issuer (politique CSP du socle). Le fournisseur doit émettre un **access token JWT pour l'audience API**, avec sub, iat, exp et un claim `roles` composé des noms exacts Viewer, ContractOperator, InfrastructureOperator, ValidatorGovernor, Administrator. Le client web doit avoir une identité/audience distincte de l'API. Durée de token au plus 900 secondes.

L'API découvre issuer/jwks_uri, vérifie HTTPS et l'issuer exact, puis vérifie signatures RS256/ES256, audience et dates. Les rôles inconnus ne confèrent aucun droit. Seul Administrator peut soumettre `foundation.check`. Sans token : 401 ; token valide sans permission : 403. Les refus et les jobs sont audités sans conserver le token. Les erreurs restent génériques.

Le navigateur utilise oidc-client-ts avec code + PKCE et stockage de session ; les tokens de développement restent uniquement en mémoire. Aucune session cookie serveur, aucune authentification par query string. Déconnexion OIDC dépend de l'endpoint du fournisseur ; expiration efface l'accès de l'interface. La révocation avant expiration n'est pas immédiate : pas d'introspection ni de back-channel logout dans v0.0. Configurer des tokens courts. Le parcours avec un véritable fournisseur et sa rotation/révocation doit être qualifié avant usage en production ; les tests locaux de signatures JWT ne constituent pas cette qualification.
