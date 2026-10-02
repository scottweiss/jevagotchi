# Jevagotchi — art & design bible (shared by every workstream)

**Premise.** A glossy, soft-bodied spirit lives in a little lit-from-within diorama.
Not a 1-bit LCD toy any more: think jelly, glass, rim light, squash & stretch,
enormous readable eyes. Emotion must read in 200 ms at a glance. The Jev model's
uncertainty is the game's signature: a hesitant creature visibly wavers.

**Palette (named, use these).**
- Night Ink `#1B1638` — deepest background / night sky
- Dusk Plum `#3A2A6B` — mid shadows, night walls
- Lagoon `#38D6B8` — health, clean, "good" signals, Blobule base
- Peach Glow `#FFB58A` — warm light, sunset, happy
- Hot Coral `#FF5C7A` — urgency, hunger, hearts, alarm
- Butter `#FFE58F` — highlights, stars, sparkles, lamp light
- Fog `#ECE9FF` — UI text on dark, paper highlights
Species hues (base, shaded via HSL): blobule lagoon, jevling butter-lime `#C8F26B`,
placid periwinkle `#8FA8FF`, feral ember `#FF7A45`, needy pink `#FF8FC7`,
stoic slate-teal `#5F8F9E`, insatiable violet `#B36BFF`, egg pearl `#F3EEFF` with speckles.

**Type.** Bricolage Grotesque (display + UI, variable 200-800, use optical size/width)
and Figtree (body). Sentence case everywhere. No ALL-CAPS tracked eyebrows, no
mono-for-labels, no "→" on buttons, no middle-dot meta strings.

**Rendering.** Canvas 2D, high-DPI aware, 60fps, no image assets (everything
procedural). Soft shadows, gradients, additive glows, rim light from the light
source (window/lamp). Colour-managed: every layer is built from the palette above.

**Motion.** Springs, not linear tweens. Squash & stretch preserves volume.
Everything breathes. Idle is never still. One-shot reactions ease out with overshoot.

**Voice.** The creature is not chatty. Speech is at most 4-6 words, lowercase,
sweet or dry. UI copy is plain, active, consistent: an action keeps one name
("Feed" → "Fed"). Errors say what happened and what to do.

**Quality floor.** Responsive to 360px wide, keyboard reachable with visible focus,
`prefers-reduced-motion` respected, sound off until user gesture and mutable,
no console errors, `npm run typecheck` and `npm test` stay green.
