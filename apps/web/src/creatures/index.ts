/** Procedural jelly creatures. Public contract: contracts.ts CreatureView. */
import type { CreatureView } from "../contracts.js";
import { Creature } from "./creature.js";

export function createCreature(): CreatureView {
  return new Creature();
}

export { DEFS as SPECIES_DEFS } from "./species.js";
export { makePalette } from "./render.js";
export { drawAccessoryIcon } from "./accessories.js";
