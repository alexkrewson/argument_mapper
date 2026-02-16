/**
 * claude.js — Helper for calling the Claude API directly from the browser.
 *
 * We send the current argument map (as JSON) plus the new statement to Claude,
 * and ask it to return an updated map with new nodes/edges.
 *
 * The map format we use:
 *   {
 *     nodes: [{ id: "n1", speaker: "User A", claim: "Short summary", original: "Full text", flagged: false }],
 *     edges: [{ id: "e1", source: "n1", target: "n2", label: "supports" | "opposes" | "qualifies" }]
 *   }
 */

// The Anthropic Messages API endpoint.
// NOTE: This calls the API directly from the browser. In production you'd proxy
// through a backend to keep keys secret — but for this MVP, the user pastes
// their own key at runtime.
const API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Sends the current map + a new statement to Claude and gets back an updated map.
 *
 * @param {string} apiKey       — The user's Anthropic API key
 * @param {object} currentMap   — Current map state ({ nodes: [], edges: [] })
 * @param {string} speaker      — "User A" or "User B"
 * @param {string} statement    — The raw statement the user typed
 * @returns {object}            — Updated map with new nodes/edges added
 */
export async function updateArgumentMap(apiKey, currentMap, speaker, statement) {
  // Build the prompt that tells Claude exactly what we need.
  // We give it the current map as JSON and ask it to return an updated version.
  const systemPrompt = `You are an argument mapping assistant. You analyze debate statements and maintain a structured argument map as JSON.

Your job:
1. Summarize the new statement into a concise claim (1 short sentence).
2. Add it as a new node to the map.
3. If it relates to existing nodes, add edges with relationship labels.
4. Return ONLY the updated JSON map — no explanation, no markdown fences.

Edge labels must be one of: "supports", "opposes", "qualifies"

Map format:
{
  "nodes": [{ "id": "n1", "speaker": "User A", "claim": "...", "original": "...", "flagged": false }],
  "edges": [{ "id": "e1", "source": "n1", "target": "n2", "label": "supports" }]
}

Rules:
- Node IDs are "n1", "n2", "n3", etc. (incrementing).
- Edge IDs are "e1", "e2", "e3", etc. (incrementing).
- Keep all existing nodes and edges unchanged.
- Add at least one new node for the new statement.
- Only add edges if there's a clear logical relationship to existing nodes.
- The "claim" field should be a concise summary; "original" is the full text.`;

  const userMessage = `Current argument map:
${JSON.stringify(currentMap, null, 2)}

New statement from ${speaker}:
"${statement}"

Return the updated map JSON.`;

  // Call the Anthropic Messages API using fetch.
  // We need to pass the API key and set the anthropic-version header.
  // The "anthropic-dangerous-direct-browser-access" header is required for
  // browser-based calls (otherwise CORS blocks it).
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  // Check for HTTP errors (bad key, rate limit, etc.)
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  // Claude returns an array of content blocks. The text is in the first one.
  const text = data.content[0].text;

  // Parse the JSON from Claude's response.
  // Sometimes Claude wraps it in markdown code fences — strip those just in case.
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse Claude response:", text);
    throw new Error("Claude returned invalid JSON. Try again.");
  }
}

/**
 * Asks Claude to update the map after a node is vetoed (flagged/removed).
 *
 * @param {string} apiKey     — The user's Anthropic API key
 * @param {object} currentMap — Current map state
 * @param {string} nodeId     — The ID of the node being vetoed
 * @returns {object}          — Updated map with the node flagged
 */
export async function vetoNode(apiKey, currentMap, nodeId) {
  // For veto, we simply flag the node locally and remove its edges.
  // No need to call Claude for this simple operation.
  const updatedNodes = currentMap.nodes.map((node) =>
    node.id === nodeId ? { ...node, flagged: true } : node
  );

  // Remove edges connected to the flagged node
  const updatedEdges = currentMap.edges.filter(
    (edge) => edge.source !== nodeId && edge.target !== nodeId
  );

  return { nodes: updatedNodes, edges: updatedEdges };
}
