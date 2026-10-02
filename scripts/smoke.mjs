// Step 0: prove the key works and record a real response as a test fixture.
// Deliberately standalone — no project imports, so it can't fail for our reasons.
import { writeFileSync, mkdirSync } from "node:fs";
import { TypeSafeClient, choice, score, noul, VERSION } from "@typesafe-ai/sdk";

if (!process.env.TYPESAFE_API_KEY) {
  console.error("TYPESAFE_API_KEY is not set. Put it in .env or export it.");
  process.exit(1);
}

console.log(`@typesafe-ai/sdk v${VERSION}`);

const client = new TypeSafeClient({ timeout: 20_000 });

// A neglected pet: hungry, filthy, exhausted, ignored for five hours.
const state = {
  pet: { name: "Blobule", species: "blobule", stage: "child", ageHours: 14, weight: 31 },
  body: { hunger: 88, energy: 12, hygiene: 9, health: 41, sickness: 0 },
  care: {
    recentActions: [{ action: "play", minutesAgo: 302 }],
    careStreakHours: 0,
    neglectEvents: 3,
    timesSick: 1,
    timesDisciplined: 0,
  },
  lastInteraction: { action: "play", minutesAgo: 302 },
  minutesSinceYouLeft: 302,
};

const questions = {
  mood: choice("The pet's dominant emotional state right now", {
    content: "At ease, nothing pressing",
    happy: "Actively delighted",
    bored: "Under-stimulated, wants something to happen",
    lonely: "Wants the caretaker's presence specifically",
    grumpy: "Irritable and short-tempered",
    anxious: "Unsettled and worried",
    sick: "Physically unwell and withdrawn",
    sleepy: "Low on energy, wants to rest",
  }),
  wants: choice("What the pet most wants from its caretaker right now", {
    food: "To be fed", play: "To play", sleep: "To be put to bed",
    cleaning: "To have its mess cleaned", attention: "To be noticed and held",
    medicine: "To be treated for illness", nothing: "Nothing; it is satisfied",
  }),
  urgency: score("How urgently the pet needs that thing", [
    "Can wait indefinitely", "Would like it soon", "Needs it now", "Distress; harm if ignored",
  ]),
  feels_neglected: noul("The pet feels neglected by its caretaker"),
  is_getting_sick: noul("The pet's condition is about to tip into illness"),
  affection: score("How much the pet likes its caretaker, all history considered", [
    "Resents them", "Wary", "Neutral", "Fond", "Devoted",
  ]),
  care_efficiency: score("How skillfully and efficiently the caretaker meets this pet's needs", [
    "Neglectful", "Erratic", "Adequate", "Attentive", "Flawlessly optimised",
  ]),
  is_spoiled: noul("The pet has come to expect more care than it actually needs"),
};

const t0 = performance.now();
const result = await client.systemOne({ state, questions });
const ms = Math.round(performance.now() - t0);

console.log(`\nmodel=${result.model}  latency=${ms}ms  input_tokens=${result.usage.input_tokens}  output_tokens=${result.usage.output_tokens}`);
console.log(`est. cost: $${((result.usage.input_tokens / 1e6) * 0.042).toFixed(8)}\n`);

for (const [id, a] of Object.entries(result.answers)) {
  if (a.type === "noul") {
    console.log(`  ${id.padEnd(16)} noul   ${a.noul.toFixed(2)}`);
  } else if (a.type === "choice") {
    const top = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ");
    console.log(`  ${id.padEnd(16)} choice ${a.choice} (conf ${a.confidence.toFixed(2)}) [${top}]`);
  } else {
    console.log(`  ${id.padEnd(16)} score  ${a.score.toFixed(2)} (conf ${a.confidence.toFixed(2)})`);
  }
}

// Sanity checks the plan depends on.
const sums = Object.entries(result.answers)
  .filter(([, a]) => a.type !== "noul")
  .map(([id, a]) => [id, Object.values(a.probabilities).reduce((s, v) => s + v, 0)]);
const bad = sums.filter(([, s]) => Math.abs(s - 1) > 0.02);
console.log(`\nprobabilities sum to 1: ${bad.length === 0 ? "YES" : "NO -> " + JSON.stringify(bad)}`);

mkdirSync("packages/core/test/fixtures", { recursive: true });
writeFileSync("packages/core/test/fixtures/neglected-child.json",
  JSON.stringify({ state, result, latencyMs: ms }, null, 2));
console.log("fixture written -> packages/core/test/fixtures/neglected-child.json");
