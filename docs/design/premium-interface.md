# Système visuel ESSAFARIA

La connexion ouvre l’espace de travail avec le logo officiel et le hublot approuvé. Dans le portail, le dossier, le voyageur et la prochaine action occupent cette place. Chaque nouvelle page reçoit sa propre maquette avant de reprendre ces fondations.

## Fondations

Les styles de `src/app/premium-foundations.css` s’activent sur un conteneur `.premium-ui`. La feuille de la connexion porte sa propre composition. Les règles communes sont utilisables indépendamment du hublot.

| Usage | Convention |
| --- | --- |
| Surface et texte | Blanc `#FFFFFF`, bleu nuit `#071A33`, texte secondaire `#43536A`. Réserver l’or à l’identité et aux repères ponctuels. |
| Typographie | Sans-serif du système pour le latin, IBM Plex Sans Arabic fourni par le projet pour l’arabe. Libellés en 16 px, notes en 13–15 px. Le titre éditorial sur deux lignes est propre à la connexion. |
| Rythme | Échelle de 4, 8, 12, 16, 24 et 32 px. Les groupes de champs ont un espacement plus important que le couple libellé–champ. |
| Grille | Sur ordinateur, l’axe du formulaire aligne titre, champs, contrôle de sécurité et action. Sous 736 px, le hublot rejoint le titre et les champs prennent la largeur disponible. |
| Contrôles | Champs d’au moins 48 px, action principale de 50 px, cibles tactiles d’au moins 44 px. Rayon de 8 px et contour constant. |

## Composants et états

| Composant | Usage |
| --- | --- |
| `.premium-button`, `.input`, `.label` | Action principale, saisie, libellé visible. Le focus est immédiat. L’action conserve ses états indisponible et en cours, avec texte localisé pendant l’envoi. |
| `.premium-panel` | Regrouper des informations qui constituent une unité métier. Un simple séparateur suffit entre les champs d’une tâche unique. |
| `.premium-table` | Utiliser un tableau sémantique, des en-têtes de colonnes et des chiffres tabulaires. Prévoir un conteneur de défilement local si les données exigent une largeur minimale. |
| `.premium-nav`, menu de langues | L’élément actif porte `aria-current`. Les liens déplacent, les boutons exécutent une action. Le menu compact reste utilisable au clavier. |
| `.premium-dialog` | Sur un dialogue natif ou le dialogue accessible existant. Donner un titre, un bouton de fermeture et rendre le focus au déclencheur. |
| `.premium-notice` | Présenter une information avec `role="status"` et une erreur avec `role="alert"`. Le texte explique l’état et son action possible. |

Sur ordinateur, la signature horizontale officielle partage un axe avec « Visa OS ». Sur mobile, la version empilée garde les deux écritures lisibles. Le filet du pied de page reprend les marges du bandeau.

Le trait bleu passe derrière le hublot et s’affine à ses extrémités. Au focus du champ e-mail, le filet doré se prolonge en 200 ms. L’entrée de la page dure de 440 à 680 ms. Dans la photographie, seuls les nuages sous l’horizon se déplacent de deux pixels sur un cycle de 24 secondes. Avec la préférence de mouvement réduit, la page présente directement la composition fixe.

En arabe, le flux de lecture inverse les colonnes, le menu et l’œil du mot de passe. Le logo, le paysage et les adresses e-mail gardent leur orientation. Le widget Cloudflare affiche son propre état et possède son propre rendu.
