# ESSAFARIA travel editorial redesign

## Direction
One agency identity, three densities. The public website is an editorial departure experience: original logo, expansive natural airport photography, deep navy, white/off-white, strong Barlow type, Arabic Plex, discreet warm accent. No artificial analytics, floating widgets, glass cards, giant rounded pills or repeated icon-feature grids. Gold remains an accent from the existing artwork, not a page fill.

The public hero is a single full-width photographic opening with left-aligned title and existing actions. It hands off to a crisp paper-colored introduction, a clear partner workflow and useful links. Existing About, contact, legal and CMS text retain their source and meaning. No invented destination offers, metrics, testimonials or claims.

Agency: destination selection and new dossier action, followed by action-required dossiers, recent records and wallet. Staff: compact queue counters, priority table, existing finance and activity. Both use stable white work surfaces, restrained navy chrome, quiet separators and readable tabular numerals. No travel wallpaper in operational tasks.

## Tokens and behavior
Use existing navy (#071a33 / #102a45), ivory (#f8f7f3), slate and original logo. Barlow regular/semibold with Plex Arabic. Editorial headings 40–80px responsive; operational headings 24–32px. Controls keep 44px touch targets. Small 4–8px radii; no card lift. Every control has immediate focus and pressed feedback. Native scrolling. One entrance/photo movement on public hero, below five seconds, transforms/opacity only, fully disabled under reduced motion; all content visible without JS.

## Change plan
Edit public home and public informational presentation, shared public header/footer, public motion, staff/agency dashboard markup and shared workspace styles. Preserve server logic, all handlers, routes, IDs and data-test hooks. Add scoped styles and one generated image. No deletions of routes or component trees. No changes to actions, queries, database, migrations, auth or accounting.

## Evidence required
Typecheck, lint, tests and build. Render public home and representative public forms, staff and agency on desktop/mobile/tablet; FR/EN/AR and Arabic mobile. Verify keyboard, mobile navigation, reduced motion and horizontal overflow. Operational captures require isolated synthetic data or existing authorized Preview access; no claim of role coverage without a rendered role.
