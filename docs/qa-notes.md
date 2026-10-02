# QA notes

Sweep run at 390x844 and 1440x900 (system Chrome via playwright-core, no Jev server, and with a stubbed /think for evolve/mind states).

## Fixed
- Top bar subtitle was cut to "Child jevling, ..." on phones; it now wraps to two lines under 460px.
- Onboarding card covered the creature on desktop; it now sits in the empty right side of the room.
- Toast stack could reach four cards and hide the creature; capped at three.
- Evolve toast read "Jevling became jevling." for same-species growth; now "Now a teen."
- `startOver()` on a dead pet that was never buried (save written mid-death) skipped the graveyard.
- Added adaptive resolution: if the slowest 5% of 150 frames exceed 22ms the canvas scale drops 2 -> 1.5 -> 1 (never raised again).

## Checked, fine
Six actions and their animations, refusals (full, asleep), mess tap, hatch, evolve cinematic, death and new egg, start-over lands in graveyard, Book tabs, Mind drawer, menu, welcome-back, wardrobe buy (auto-wears, star counter drops), hat tracks the body during squash, all three minigames open/quit with Escape, hotkeys ignored under overlays, reduced motion, weather stays inside the window pane, no console errors.

## Not covered
Awarding stars by actually finishing a minigame (needs real play; reward code is unit-tested in core), Safari/iOS, real GPU frame times (measured headless Chrome, software-composited).
