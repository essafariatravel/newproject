# ESSAFARIA travel editorial redesign

## Direction
One agency identity, three densities. The public website is an editorial departure experience: original logo, expansive natural airport photography, deep navy, white/off-white, strong Barlow type, Arabic Plex, discreet warm accent. No artificial analytics, floating widgets, glass cards, giant rounded pills or repeated icon-feature grids. Gold remains an accent from the existing artwork, not a page fill.

The public hero pairs the headline “Visa processing for travel agencies” with an editorial photograph of a traveller’s file. A paper-colored service index lets agencies explore preparation, document review and status tracking. A photographic partner section explains how to request access. About and contact pages use the configured company content. Public imagery illustrates the work and carries no destination or approval promises.

Agency: destination selection and new dossier action, followed by action-required dossiers, recent records and wallet. Staff: compact queue counters, priority table, existing finance and activity. Both use stable white work surfaces, restrained navy chrome, quiet separators and readable tabular numerals. No travel wallpaper in operational tasks.

## Tokens and behavior
Use existing navy (#071a33 / #102a45), ivory (#f8f7f3), slate and original logo. Use Barlow regular and semibold with Plex Arabic. Editorial headings scale between 40 and 80px. Operational headings use 24–32px. Controls keep 44px touch targets, visible focus and immediate pressed feedback. The public cover settles once in 3.2 seconds. Other editorial frames move once on entry, and the visa stage selector crossfades on selection. Reduced motion keeps these interactions static. The selector also works with JavaScript off.

## Change plan
Edit public home and public informational presentation, shared public header/footer, public motion, staff/agency dashboard markup and shared workspace styles. Preserve server logic, all handlers, routes, IDs and data-test hooks. Add scoped styles and one generated image. No deletions of routes or component trees. No changes to actions, queries, database, migrations, auth or accounting.

## Evidence required
Typecheck, lint, tests and build. Render public home and representative public forms, staff and agency on desktop/mobile/tablet; FR/EN/AR and Arabic mobile. Verify keyboard, mobile navigation, reduced motion and horizontal overflow. Operational captures require isolated synthetic data or existing authorized Preview access; no claim of role coverage without a rendered role.
