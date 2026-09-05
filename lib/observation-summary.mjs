import { readFile } from "node:fs/promises";

export async function observationSummary(journal) {
  let source;
  try { source = await readFile(journal, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return { source: journal, observation_gaps: null, confirmed_sleep_intervals: null, timing_note: "Observation evidence is unavailable; missing data is not zero." }; throw error; }
  const gaps = [];
  for (const line of source.split("\n").filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.kind !== "observation_gap") continue;
    gaps.push({ observed_at: event.observed_at ?? event.payload?.observed_at ?? null, ...event.payload, confirmed_sleep: false });
  }
  return { source: journal, observation_gaps: gaps, confirmed_sleep_intervals: null,
    timing_note: "Wall duration includes waiting and observation gaps. Gaps do not prove OS sleep. Do not subtract them to estimate model work time; token usage is independent." };
}
