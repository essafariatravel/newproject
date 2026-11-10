# Qualification locale de la sécurité d'authentification

Base Production vérifiée le 10 novembre 2026 sur l'alias `visa.essafariavoyages.com`. Vercel indique le déploiement `dpl_q3MNnZyhU8VLAvfTAexMSc6uRr5k`, SHA `15b108ed6366cbd9a291c756fd76ee148868028e`.

Candidate locale `codex/auth-bot-lockout-20261110`. Le build de branche exclut la migration automatique, le seed et le bootstrap. Le déploiement Git automatique de cette branche est désactivé dans `vercel.json`. La qualification utilise des identités fictives, PostgreSQL jetable sur loopback et des réponses Siteverify simulées.

## Comportement

- Les Server Actions valident Turnstile pour la connexion Staff et agence, l'inscription, la demande de récupération, l'activation agence, la réinitialisation par lien et la définition ou modification du mot de passe. Le widget Managed s'affiche lorsqu'une interaction est nécessaire. Les libellés sont en FR, EN et AR.
- Les jetons doivent être uniques, frais, liés au hostname de la requête et à l'action attendue. Siteverify et le compteur de rejeu partagé refusent une seconde utilisation. [Règles Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- Le verrouillage se déclenche au troisième échec dans une fenêtre glissante de 10 minutes et dure 10 minutes à partir de cet échec. Une tentative bloquée ne prolonge pas le délai. La réponse publique est identique pour un identifiant inconnu, un mot de passe incorrect ou un identifiant verrouillé.
- La table `auth_rate_limits` conserve jusqu'à deux lignes par identifiant HMAC. Un verrou transactionnel PostgreSQL par identifiant sérialise le compteur et l'émission des nouvelles sessions. Le compteur est effacé lors de la connexion réussie pour une agence, et après MFA pour le Staff lorsque le MFA est requis. Un échec Turnstile, SQL, de session ou de MFA ne compte pas comme un mauvais mot de passe.
- La connexion applique aussi un plafond de 120 soumissions par minute par IP Vercel, avant Siteverify. Le verrou de 10 minutes reste propre à l'identifiant. Les sessions déjà autorisées restent utilisables. Une réinitialisation par lien reste possible pendant le verrouillage.

## Résultats locaux du 10 novembre 2026

- 180 tests ciblés sur 18 fichiers. Les cas incluent le troisième échec, le délai exact, les tentatives concurrentes, l'identifiant inconnu, le succès agence, le MFA Staff, les erreurs techniques et les appels directs aux Server Actions.
- Chrome en boucle locale. Connexion agence, redirection Staff vers MFA, inscription, récupération, réinitialisation, activation et premier mot de passe ont réussi avec le widget et Siteverify simulés. Le POST HTTP direct de connexion sans jeton a été rejeté sans cookie et l'API protégée a refusé la requête anonyme. Vérification de la mise en page sur les vues FR, EN et AR testées.
- TypeScript, ESLint sur le périmètre modifié et build Webpack réussis. Turbopack échoue localement au lancement de son processus CSS. La recette navigateur utilise l'artefact Webpack.
- Les jetons Cloudflare réels restent à qualifier sur une Preview isolée.

## Configuration avant une Preview hébergée

| Variable | Valeur ou portée à qualifier |
| --- | --- |
| `TURNSTILE_MODE` | `managed`. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Paire du widget Managed Free propre à l'environnement. Configurer la clé secrète dans Vercel en Sensitive. Séparer Preview et Production. |
| `TURNSTILE_HOSTNAMES` | Nom d'hôte exact autorisé dans le widget de cet environnement. Utiliser le domaine stable de recette pour la Preview. |
| `AUTH_LOGIN_COUNTER_SECRET` | 32 octets aléatoires encodés en base64url. Secret Sensitive différent par environnement, stable entre instances et déploiements du même environnement. Toute rotation rend les compteurs précédents inaccessibles par la nouvelle clé. |
| `DATABASE_URL`, `DATABASE_SCHEMA` | Cible de test dédiée, avec `auth_rate_limits` présent et accès SQL hors Production impossible. Vérifier la cible et les privilèges avant tout déploiement. |
| `ESSAFARIA_READONLY_BUILD`, `ALLOW_DEMO_SEED`, `PREVIEW_ADMIN_BOOTSTRAP` | Respectivement `true`, `false`, `false`. Aucun `MIGRATION_DATABASE_URL` effectif en Preview. |
| `MFA_ENFORCEMENT_ENABLED`, `MFA_ENCRYPTION_KEY` | Enforcement `true` et clé propre aux facteurs de l'environnement. |
| `STORAGE_PROVIDER`, `TRANSACTIONAL_EMAIL_PROVIDER` | `db` et `disabled` pour les essais fictifs sans service externe. |

Le garde PostgreSQL hérité reste en vigueur. Le changement de branche, d'URI ou de schéma n'est pas une preuve d'isolation. Si la base dédiée retenue est rejetée par ce garde, qualifier et faire autoriser un ajustement explicite de la frontière avant de déployer. Ne pas utiliser le compte `postgres` du projet partagé pour la recette.

Avant de demander un GO Production, vérifier sur la Preview la connexion légitime, le MFA Staff, les six parcours protégés, les POST directs et le rejet des jetons réellement absents, invalides, expirés et réutilisés. Vérifier la séparation des clés et les permissions SQL effectives. Aucun test de charge.

## Retour arrière

- Tant que la candidate est locale, le déploiement public n'est pas concerné. La candidate peut être abandonnée ou son commit annulé dans la branche locale.
- Après une future Preview, rétablir le dernier déploiement Preview sain et son périmètre de variables. Si aucun artefact sain compatible n'existe, suspendre la recette en conservant la protection d'accès.
- Après une future mise en Production autorisée, relever l'ID du déploiement sain avant promotion. En cas de régression d'authentification, remettre cet artefact sur l'alias Production après décision explicite. Aucun rollback SQL n'est requis. Le code antérieur n'utilise pas les nouvelles clés de compteur et la purge existante élimine les anciennes lignes. Conserver les sessions et les facteurs MFA pendant l'opération.
