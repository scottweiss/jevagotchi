import type { Species } from "@jevagotchi/core";

/** Every mood keeps one colour everywhere: the Mind bars, the orb, the toasts. */
export const MOOD_COLOR: Record<string, string> = {
  happy: "#FFB58A",
  content: "#38D6B8",
  bored: "#7FA9B8",
  lonely: "#8FA8FF",
  grumpy: "#FF7A45",
  anxious: "#FFE58F",
  sick: "#C8F26B",
  sleepy: "#9C86F0",
};
export const moodColor = (m: string): string => MOOD_COLOR[m] ?? "#ECE9FF";

export const WANT_TEXT: Record<string, string> = {
  food: "to be fed", play: "to play", sleep: "to sleep", cleaning: "to be cleaned",
  attention: "your attention", medicine: "medicine", nothing: "nothing",
};

export const REFUSAL_TEXT: Record<string, string> = {
  asleep: "It's asleep. Turn the lights on first.",
  "not sick": "It isn't sick.",
  "too full": "It's full.",
  "already clean": "Nothing to clean.",
  "still an egg": "Still an egg. Give it a minute.",
  gone: "It's gone.",
  "too tired": "Too tired to play. Let it rest.",
  "already awake": "It's already awake.",
};

export const CAUSE_TEXT: Record<string, { short: string; epitaph: string }> = {
  starvation: { short: "went hungry", epitaph: "It waited by an empty bowl. It was very brave about it." },
  illness: { short: "fell ill", epitaph: "It was unwell for a long while and never complained." },
  filth: { short: "was left in the mess", epitaph: "The room got away from everyone. It was a good room once." },
  exhaustion: { short: "ran out of rest", epitaph: "It stayed up to keep you company, and it was too tired to say so." },
};

export const SPECIES_INFO: Record<string, { name: string; hue: string; blurb: string }> = {
  egg: { name: "Egg", hue: "#F3EEFF", blurb: "Speckled and quiet. Something is thinking in there." },
  blobule: { name: "Blobule", hue: "#38D6B8", blurb: "The first shape anyone takes. Soft, curious, easily delighted." },
  jevling: { name: "Jevling", hue: "#C8F26B", blurb: "A bright, restless child that is starting to have opinions." },
  placid: { name: "Placid", hue: "#8FA8FF", blurb: "Grew up calm because you were steady." },
  feral: { name: "Feral", hue: "#FF7A45", blurb: "Grew up wild. Nobody told it no, or nobody was there." },
  needy: { name: "Needy", hue: "#FF8FC7", blurb: "Adores you and would like you to stay exactly where you are." },
  stoic: { name: "Stoic", hue: "#5F8F9E", blurb: "Learned to expect little. Rarely disappointed, rarely thrilled." },
  insatiable: { name: "Insatiable", hue: "#B36BFF", blurb: "The better you cared, the more it needed. That's the Jevons trap." },
};

export const speciesName = (s: Species | string): string => SPECIES_INFO[s]?.name ?? s;

export const STAGE_NAME: Record<string, string> = { egg: "egg", baby: "baby", child: "child", teen: "teen", adult: "adult" };
