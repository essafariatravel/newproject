# ESSAFARIA VISA OS — VFS Chine | Mise en service contrôlée

> **État : branch Preview uniquement. Production inchangée.**
> La validation VFS « Online review completed » constitue une approbation
> commerciale selon la convention ESSAFARIA. Ne pas la présenter comme une
> vignette visa apposée dans un passeport.

## Architecture et opérations

1. Une agence dépose le document Passeport (type `COD-PASS`) dans VISA OS.
2. Le **travailleur OCR local** (Tesseract + pdftoppm) lit le PDF/JPEG/PNG
   depuis l'API privée via HMAC. Le numéro est extrait uniquement si les
   quatre chiffres de vérification ICAO MRZ sont corrects. Le serveur stocke
   le numéro normalisé dans `applicants.passport_number` et conserve la preuve
   documentaire dans `passport_mrz_evidence`; aucun OCR brut n'est conservé.
   Les dossiers ambigus ne sont pas modifiés.
3. Un Staff ESSAFARIA renseigne **manuellement soit la référence ALG, soit le numéro de formulaire VFS numérique** sur son dossier Chine. Le numéro de formulaire peut être disponible avant l'e-mail final. Une contrainte UNIQUE interdit qu'une référence appartienne à deux demandes, et chaque saisie est journalisée.
4. Un **Google Apps Script** installé par le propriétaire du compte Gmail
   recherche les messages envoyés à l'alias `visa@essafariavoyages.com`.
   Il vérifie les en-têtes Gmail, convertit temporairement le PDF en Google
   Doc pour en extraire le texte, puis supprime **définitivement** ce document
   temporaire de Drive. Le PDF d'origine et le texte sont transmis via HTTPS
   avec signature HMAC à l'API VISA OS.
5. L'API vérifie la provenance du message, l'intégrité PDF, la référence,
   le numéro de passeport extrait du certificat et le passeport OCR vérifié.
   Une correspondance unique avec un dossier Chine encore éligible est
   obligatoire. Les e-mails offline ne créent **aucun dossier**.
6. Si la décision automatique est activée et toutes les vérifications
   passent, le système utilise **`recordApplicationDecision()`** : document
   officiel en sécurité, état APPROVED, date de décision, dossier clôturé,
   historique/audit, notification **uniquement à l'agence propriétaire**.
7. Une table privée `vfs_china_mail_events` journalise message + hash PDF
   et gère les doublons, les tentatives et la récupération après perte de
   réponse. En cas d'incertitude, le résultat est `REVIEW_REQUIRED` sans
   approbation. Un dossier déjà approuvé ne peut être approuvé une seconde fois.

## Ce qui a été implémenté

- Endpoint `GET /api/integrations/vfs-china/ocr?action=queue` (liste minimale)
- Endpoint `GET /api/integrations/vfs-china/ocr?action=file&documentId=UUID`
- Endpoint `POST /api/integrations/vfs-china/ocr` (résultat Tesseract/MRZ)
- Endpoint `POST /api/integrations/vfs-china/mail` (message Gmail signé)
- `scripts/workers/vfs_china_passport_ocr.py` (OCR local Python stdlib +
  exécutables `tesseract` et `pdftoppm`; les fichiers temporaires sont supprimés)
- `scripts/integrations/vfs-china-gmail-apps-script.js` (mail/Drive)
- `migrations/0036*`, `0037*`, `0038*`, `0039*` (tables privées et formats VFS)
- Staff : champ de saisie de référence VFS, visible uniquement quand le
  drapeau d'activation correspondant est activé
- Tests unitaires/contrats (HMAC, MRZ, états, isolation).

## Prérequis de lancement

### Vercel Preview uniquement

Configurer en variables **serveur privées** (sans `NEXT_PUBLIC_`) :

| Clé | Valeur |
|---|---|
| `VFS_CHINA_STAFF_BINDING_ENABLED` | `true` (après migrations) |
| `VFS_CHINA_INTEGRATION_ENABLED` | `true` (uniquement en Preview test) |
| `VFS_CHINA_OCR_ENABLED` | `true` après qualification Tesseract |
| `VFS_CHINA_AUTO_DECISION_ENABLED` | **`false` initialement** |
| `VFS_CHINA_OCR_HMAC_SECRET` | Secret aléatoire distinct, 40+ caractères |
| `VFS_CHINA_MAIL_HMAC_SECRET` | Autre secret aléatoire, 40+ caractères |
| `VFS_CHINA_SERVICE_ACTOR_ID` | UUID d'un compte technique VISA_AGENT dédié et actif, créé par l'administrateur |

La connexion ChatGPT Gmail **n'autorise pas à elle seule** l'application
Next.js à lire la boîte. Il faut installer et autoriser le script sur le
compte Gmail propriétaire de l'alias. **Ne jamais coller les secrets dans
un chat, un commit, des logs ou une capture.**

### Installation OCR locale (ordinateur/système maîtrisé)

Installer Tesseract OCR avec les données `eng` et Poppler `pdftoppm`.
Les deux exécutables doivent être dans le `PATH`. Installer Python 3.10+
(aucune dépendance pip obligatoire). Puis définir dans les variables locales
`VISA_OS_URL` (URL Preview HTTPS), `VFS_CHINA_OCR_HMAC_SECRET` et,
éventuellement, `VFS_CHINA_OCR_MAX_DOCS=10`.
Lancer :

```sh
python scripts/workers/vfs_china_passport_ocr.py
```

Sur Windows, créer une tâche planifiée uniquement après tests positifs.
Le PC ou serveur local doit rester allumé et connecté pour la tâche
récurrente. Si Vercel protège Preview, obtenir une autorisation d'accès
Preview contrôlée avant les essais : ne jamais désactiver la protection
globale pour ce projet.

### Installation Gmail — action explicite du propriétaire

1. Ouvrir Apps Script sur **le compte Gmail principal** recevant
   `visa@essafariavoyages.com` comme alias.
2. Coller `scripts/integrations/vfs-china-gmail-apps-script.js`.
3. Activer le service avancé **Drive API v3**, puis autoriser Gmail, Drive,
   Docs et UrlFetch. La conversion du PDF utilise Google Drive (déjà
   l'écosystème de la boîte), avec suppression immédiate du temporaire.
4. Définir les propriétés de script `VISA_OS_URL` et
   `VFS_CHINA_MAIL_HMAC_SECRET`.
5. Conserver **l'unique déclencheur horaire existant** `runVfsChinaSweep` (type `Time-driven`) : ne pas créer de second déclencheur, ne pas accélérer la fréquence et ne pas activer les décisions automatiques.
6. Après revue, le propriétaire de Gmail remplace le code dans **le projet Apps Script déjà installé**, sans modifier les propriétés ni les autorisations. Le code GitHub n'est pas synchronisé automatiquement avec Apps Script.
7. Vérifier les compteurs `processed`, `offline`, `review` et `error` lors de l'exécution horaire suivante. Le curseur `VFS_CHINA_LAST_SCANNED_MESSAGE_ID` permet de passer aux autres confirmations tout en conservant un seul PDF par exécution.
6. Ne pas activer les décisions tant que les cas tests ne passent pas.

### Qualification avant décisions réelles

Tester sur la **base de test isolée uniquement** :
- VFS authentifié + référence unique + MRZ valide -> MATCHED_DRY_RUN
- Dossier offline absent -> IGNORED_OFFLINE sans dossier créé
- Reference dupliquée -> refus par contrainte
- Mauvais passeport / OCR illisible / scan remplacé -> REVIEW_REQUIRED
- Faux expéditeur, signature manquante, deux comptes, mauvais tenant -> refus
- Dossier déjà clôturé -> aucune nouvelle approbation
- PDF corrompu ou >2MB -> refus
- Rejeu du même message / timeout / arrêt du worker -> jamais deux approbations
- Validation réelle dans Preview -> document officiel, date décision, audit,
  notifications seulement agence, compteur figé; tests rollback.
- Mesures CPU/mémoire du worker local, quotas Apps Script et consommation
  Vercel/Supabase avant toute activation. Les logiciels sont open source,
  mais l'utilisation des services cloud peut compter dans les quotas.

### Limites non levées par le code

- **Le travailleur OCR doit être installé et exécuté** sur une machine
  contrôlée. Vercel ne fournit pas Tesseract/Poppler en permanence.
- **L'Apps Script doit être installé et autorisé** par le propriétaire Gmail.
- **L'identité de service doit être créée** sans réutiliser les identifiants
  d'un membre du Staff.
- Le code compilé Preview ne vaut pas un test complet de documents réels.
- Un dossier déjà traité ne doit jamais recevoir une nouvelle décision
  sans procédure de réconciliation Staff.
- Production reste sur la version en service tant que ces prérequis ne sont
  pas validés; flags false ou absents par défaut.

## Vérification actuelle (branch Preview)

- Les compilations Next.js/TypeScript Vercel du code sont READY.
- Les migrations 0036 à 0039 existent dans le schéma **visa_os_preview**,
  pas dans le schéma Production **visa_os**.
- Le PDF VFS réel fourni a été contrôlé en lecture seule : ses champs
  Certificate No., Application Form No. et Passport No. ont chacun un
  résultat unique avec les expressions prévues, sans OCR du certificat.
- Les essais d'acceptation avec une session Staff, le moteur Tesseract sur
  les passeports des agences, et la réception Gmail en condition réelle
  restent à effectuer. Ne pas annoncer le service comme actif.
