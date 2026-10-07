const invalid = () => { throw Object.assign(new Error("Invalid OpenRouter Decisions response"), { code: "semantic_response_invalid" }); };
export const openrouterDecisions = Object.freeze({
  id: "openrouter-decisions", endpoint: "https://openrouter.ai/api/alpha/decisions", credential: "OPENROUTER_API_KEY",
  validateModel(model) { return model === "typesafe/jev-1.13"; },
  encode(request, model) {
    return { model, state: request.state, questions: Object.fromEntries(request.questions.map(q => [q.id,
      { type: "noul", instructions: q.instructions, criteria: q.criteria }])) };
  },
  decode(raw, model) {
    if (raw?.provider !== "TypeSafe" || typeof raw.id !== "string" || !raw.id || raw.id.length > 256
      || !(raw.model === model || typeof raw.model === "string" && /^typesafe\/jev-1\.13-\d{8}$/.test(raw.model))
      || !raw.answers || typeof raw.answers !== "object" || Array.isArray(raw.answers)) invalid();
    const probabilities = Object.entries(raw.answers).map(([id, answer]) => {
      if (answer?.type !== "noul") invalid();
      return { id, probability_true: answer.noul };
    });
    const usage = Object.fromEntries(Object.entries(raw.usage ?? {}).filter(([key, value]) =>
      ["input_tokens", "output_tokens", "cost"].includes(key) && typeof value === "number" && Number.isFinite(value) && value >= 0));
    return { probabilities, metadata: { provider: "TypeSafe", requested_model: model, returned_model: raw.model,
      resolved_snapshot: raw.model === model ? null : raw.model, request_id: raw.id, usage } };
  }
});
