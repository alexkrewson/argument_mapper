// Estimates the cost of the next AI turn based on current map size.
// All costs in cents.

const SYSTEM_PROMPT_TOKENS = 3500; // approximate — the updateArgumentMap prompt is very long
const USER_MSG_TOKENS      = 300;  // statement + wrapper text
const INPUT_CENTS_PER_TOKEN  = 0.0006;
const OUTPUT_CENTS_PER_TOKEN = 0.0030;

export function estimateNextTurnCents(currentMap) {
  const mapJson    = JSON.stringify(currentMap ?? {});
  const mapTokens  = Math.ceil(mapJson.length / 4);

  const inputTokens  = SYSTEM_PROMPT_TOKENS + mapTokens + USER_MSG_TOKENS;
  // Output = Claude rewrites the whole map + adds new nodes + moderator analysis
  const outputTokens = mapTokens + 1000;

  return inputTokens * INPUT_CENTS_PER_TOKEN + outputTokens * OUTPUT_CENTS_PER_TOKEN;
}

export function formatCostCents(cents) {
  if (cents < 1) return `${(cents).toFixed(2)}¢`;
  if (cents < 100) return `${cents.toFixed(1)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}
