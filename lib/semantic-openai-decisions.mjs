const invalid = () => { throw Object.assign(new Error("Invalid OpenAI Decisions response"), { code: "semantic_response_invalid" }); };
export const openaiDecisions = Object.freeze({
  id: "openai-decisions", endpoint: "https://api.openai.com/v1/decisions", credential: "OPENAI_DECISIONS_API_KEY",
  validateModel(model) { return model === "gpt-6-luna"; },
  encode(request, model) {
    return { model, input: JSON.stringify(request.state), questions: request.questions.map(q => ({ name: q.id, type: "predicate",
      instructions: `${q.instructions}\nTRUE: ${q.criteria.true}\nFALSE: ${q.criteria.false}` })) };
  },
  decode(raw, model) {
    if (raw?.model !== model || !Array.isArray(raw.answers)) invalid();
    const probabilities = raw.answers.map(answer => {
      if (typeof answer?.name !== "string") invalid();
      if (answer.type === "refusal") return { id: answer.name, probability_true: null };
      if (answer.type !== "predicate") invalid();
      return { id: answer.name, probability_true: answer.probability };
    });
    return { probabilities, metadata: { provider: "OpenAI", requested_model: model, returned_model: raw.model, resolved_snapshot: null,
      request_id: null, usage: usage(raw.usage) } };
  }
});

function usage(raw) {
  return Object.fromEntries(Object.entries(raw ?? {}).filter(([key, value]) =>
    ["input_tokens", "output_tokens", "total_tokens", "compute_units"].includes(key) && Number.isSafeInteger(value) && value >= 0));
}
