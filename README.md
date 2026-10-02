# Jevagotchi

A Tamagotchi whose entire inner life is a [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
model. Local code owns the body; every *judgment* about it comes from one Jev call.

## Running it

```bash
echo 'TYPESAFE_API_KEY=sk-...' > .env   # early-access key from console.typesafe.ai/keys
npm install
npm run dev                             # API host on :5174, app on :5173
```

Then open http://localhost:5173. The static game works without a Jev key; when the
server is unavailable, the pet continues living but has no model-driven feelings.

## GitHub Pages

The public Pages build is a static app and does not include or use `TYPESAFE_API_KEY`.
Jev calls need a server-side key, so Pages runs the game in its offline mode. Do not
put a personal key into the frontend or a public Actions secret for this static build.
Visitors can still raise their pet, which is saved locally in their browser.

| Command | What it does |
|---|---|
| `npm test` | Offline suite. 85 tests, no network, no key needed |
| `npm run test:live` | Contract test against the real Jev API. Needs the key |
| `npm run test:e2e` | Browser smoke test: boots the dev server on :5199, drives the real app in your installed Chrome (playwright-core, no download; `E2E_CHANNEL=chromium` or `E2E_URL=...` to override). Checks console errors, non-blank canvas, Feed, Mind, Book, new-egg and start-over. Not part of `npm test` |
| `npm run smoke` | One live call, printed. The fastest way to check a key works |
| `npm run dev` | Both servers, for playing |

Dev pages: `/scene-dev.html` (the diorama and its effects), `/audio-dev.html` (soundboard),
`/minigame-dev.html` (the three minigames).

## How it is put together

```
packages/core   pure TS: body physics, the question set, answer interpretation
apps/server     the only thing holding the API key. POST /think
apps/web        canvas, input, persistence. Knows nothing about Jev
```

The split is forced, not stylistic: the SDK sets `dangerouslyAllowBrowser: false` and
throws when constructed in a browser, so the model call has to live server-side.
`core` stays dependency-free and framework-free so a menu bar app can reuse it later.

## The five decisions worth knowing

**Physics is deterministic; Jev is the psyche.** Hunger rising is arithmetic, and the
docs are explicit that Jev is unreliable at arithmetic and clocks. So it is never
asked to do either — it receives pre-computed, human-legible facts and answers
questions about how they feel.

**Behaviour is sampled, not argmax'd.** When connected, `mood` and `wants` are drawn from Jev's
probability distribution, so two pets in identical states diverge. That is the point:
calibrated variation instead of `Math.random()`.

**Except where it is permanent.** `evolution_direction` *is* argmax. Sampling it would
occasionally hand you a creature contradicting how you raised it, with no way back.
Sample the transient, commit to the permanent.

**Nouls stay probabilities.** `is_getting_sick: 0.3` is a 30% roll, never `> 0.5`.
Thresholding a noul to a boolean discards exactly the calibration being paid for.

**Confidence is visible.** High confidence → the creature acts decisively. Medium → it
visibly flickers between its top two feelings. Low → it holds still rather than faking
a conviction it does not have. Model uncertainty rendered as animal indecision.

## Physics is time-additive on purpose

`advance(state, elapsed)` integrates in fixed one-minute steps, so an eight-hour
absence produces bit-identical state to 480 one-minute ticks — asserted in a test.
Offline catch-up is one call with no replay loop and no drift, then a single Jev call
to ask how the pet feels about having been abandoned.

## The Jevons twist

Jev is named for William Stanley Jevons, who observed that making coal use more
efficient *increased* total consumption. The pet inherits the trap: past the teen
stage, an EMA of Jev's `care_efficiency` drives a metabolism multiplier from 1.0 to
1.6. The better you get at caring for it, the faster it consumes. Raise one flawlessly
and it can evolve into **insatiable**.

Locked until teen, so early play is an ordinary, friendly virtual pet.

## Cost

About **$0.00006 per think** at ~1,400 input tokens ($0.042/Mtok, output free). Thinks
fire on each action, on a 45-second heartbeat, and once on return. A long session
costs a fraction of a cent. Live latency measured at 210–430 ms.

## Game systems

All pure and tested in `packages/core`; `apps/web/src/game.ts` wires them to events.

- **Messes.** Eating starts an 18-minute digestion timer; the poop lands only while awake (max 4).
  Each mess drains hygiene faster and, past two, adds a sickness chance per think. `clean` clears all,
  `game.clearMess(i)` scoops one.
- **Happiness** (`pet.happiness`, 0-100, beside `meters` so old fixtures stay valid). Decays with time,
  hunger, sickness and mess; play/minigames raise it with diminishing returns. Jev sees it as
  `fun: { happiness, feeling, minutesSinceLastPlay }`.
- **Minigames** (`apps/web/src/minigames`): `catch`, `rhythm`, `memory`. Results go through
  `game.minigameResult(id, {score, stars})`. Dev harness: `apps/web/minigame-dev.html`.
- **Codex, milestones, journal.** `save.codex` (species, best scores, longest life), one-shot
  `milestone` events, `save.journal` (last 40 diary lines).
- **Speech.** `speechFor` picks a 2-6 word lowercase line, never the same twice in a row; `game.speech` lasts 5s.
- **Away grace.** Gaps over 20 minutes go through `catchUp`: the pet sleeps through the first 6 hours,
  then a pet that would die within 72 hours is left barely alive instead. Beyond that, nature takes over.
  `game.awayReport` carries a summary for a welcome-back card.
- **Saves** are `jevagotchi.v2`; `jevagotchi.v1` saves are read and upgraded, never deleted.
- **Pacing.** No physics constants were changed. A test shows a player checking in every 10 minutes
  keeps a max-metabolism teen healthy for 12 hours.
