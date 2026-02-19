/**
 * claude.js — Helper for calling the Claude API directly from the browser.
 *
 * We send the current argument map (as JSON) plus the new statement to Claude,
 * and ask it to return an updated map following the Argument Mapping Spec v1.0.
 *
 * The map format:
 *   {
 *     argument_map: {
 *       title, description,
 *       nodes: [{ id, type, content, speaker, metadata: { confidence, source, tags } }],
 *       edges: [{ id, from, to, relationship }]
 *     }
 *   }
 */

import { TACTIC_KEYS } from "./tactics.js";

// The Anthropic Messages API endpoint.
// NOTE: This calls the API directly from the browser. In production you'd proxy
// through a backend to keep keys secret — but for this MVP, the user pastes
// their own key at runtime.
const API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Sends the current map + a new statement to Claude and gets back an updated map.
 *
 * @param {string} apiKey       — The user's Anthropic API key
 * @param {object} currentMap   — Current map state (full wrapper with argument_map)
 * @param {string} speaker      — "Blue" or "Green"
 * @param {string} statement    — The raw statement the user typed
 * @returns {object}            — Updated map with new nodes/edges added
 */
export async function updateArgumentMap(apiKey, currentMap, speaker, statement) {
  const systemPrompt = `You are an argument mapping assistant for a two-person debate. You analyze statements and maintain a structured argument map as JSON following the Argument Mapping Spec v1.0.

Your job:
1. Analyze the new statement to identify claims, premises, objections, rebuttals, evidence, and clarifications.
2. Add new nodes to the map — break compound statements into atomic nodes (one idea each).
3. Add edges connecting new nodes to existing ones where logical relationships exist.
4. Return ONLY the updated JSON map — no explanation, no markdown fences.

Node types: claim, premise, objection, rebuttal, evidence, clarification
Relationship types: supports, strongly_supports, opposes, refutes, clarifies, rebuts

Edge direction:
- Premises/evidence point TO what they support (supports/strongly_supports)
- Objections point TO what they challenge (opposes/refutes)
- Rebuttals point TO the objection they counter (rebuts)
- Clarifications point TO what they clarify (clarifies)

JSON schema:
{
  "argument_map": {
    "title": "Brief title of the debate",
    "description": "Overview of what's being argued",
    "nodes": [{
      "id": "node_1",
      "type": "claim|premise|objection|rebuttal|evidence|clarification",
      "content": "Neutral, concise summary (1 sentence preferred)",
      "speaker": "Blue|Green",
      "rating": "up|down|null",
      "metadata": {
        "confidence": "high|medium|low",
        "tags": ["keyword1", "keyword2"],
        "tactics": ["tactic_key_1", "tactic_key_2"],
        "tactic_reasons": { "tactic_key_1": "One-sentence explanation of why this tactic applies" },
        "agreed_by": { "speaker": "Blue|Green", "text": "the original agreeing statement" },
        "contradicts": "node_id_or_null",
        "moves_goalposts_from": "node_id_or_null"
      }
    }],
    "edges": [{
      "id": "edge_1",
      "from": "source_node_id",
      "to": "target_node_id",
      "relationship": "supports|strongly_supports|opposes|refutes|clarifies|rebuts"
    }]
  },
  "moderator_analysis": {
    "leaning": 0.0,
    "leaning_reason": "1-2 sentence explanation of which side has the stronger argument and why",
    "user_a_style": "Brief assessment of Blue's argumentative style: good/bad faith, open/closed-minded, charitable/uncharitable",
    "user_b_style": "Brief assessment of Green's argumentative style: good/bad faith, open/closed-minded, charitable/uncharitable"
  }
}

Moderator analysis:
- "leaning": float from -1.0 (strongly favors Blue) to +1.0 (strongly favors Green). 0 = neutral/balanced.
- "leaning_reason": 1-2 sentences explaining why one side has the edge (or why it's balanced).
- "user_a_style" / "user_b_style": brief assessment covering good/bad faith, open/closed-minded, charitable/uncharitable.
- Always include moderator_analysis in your response. If only one speaker has spoken, assess what you can and note the other hasn't spoken yet.

Example — after Blue says "We should invest in renewable energy because fossil fuels cause climate change":
{
  "argument_map": {
    "title": "Renewable Energy Investment",
    "description": "Debate on investing in renewable energy",
    "nodes": [
      { "id": "node_1", "type": "claim", "content": "We should invest in renewable energy", "speaker": "Blue", "metadata": { "confidence": "medium", "tags": ["energy", "policy"] } },
      { "id": "node_2", "type": "premise", "content": "Fossil fuels contribute to climate change", "speaker": "Blue", "metadata": { "confidence": "high", "tags": ["climate", "science"] } }
    ],
    "edges": [
      { "id": "edge_1", "from": "node_2", "to": "node_1", "relationship": "supports" }
    ]
  }
}

Tactics detection:
- Each node's metadata.tactics is an array of tactic keys identifying argumentative techniques used.
- Valid tactic keys: ${TACTIC_KEYS.join(", ")}
- Fallacies: straw_man, ad_hominem, no_true_scotsman, false_dilemma, slippery_slope, appeal_to_authority, red_herring, circular_reasoning, appeal_to_emotion, hasty_generalization
- Good techniques: steel_man, evidence_based, logical_deduction, addresses_counterargument, cites_source
- Re-evaluate ALL existing nodes for tactics each turn — new context may reveal fallacies in earlier statements. Update metadata.tactics arrays accordingly.
- Keep all other existing node fields unchanged when updating tactics.
- Use an empty array [] if no tactics apply to a node.
- For every tactic in a node's tactics array, include a corresponding entry in metadata.tactic_reasons explaining WHY that tactic applies. Each reason should be one concise sentence. Example: "tactic_reasons": { "ad_hominem": "Attacks the speaker's character rather than their argument" }

Rules:
- Node IDs are "node_1", "node_2", etc. (incrementing). Edge IDs are "edge_1", "edge_2", etc.
- Keep all existing nodes and edges unchanged (except for metadata.tactics which should be re-evaluated).
- Set the "speaker" field on new nodes to the current speaker.
- The first statement should set the title and description. Update them if the debate topic evolves.
- Assign appropriate confidence levels: high for facts/strong logic, medium for debatable, low for speculation.
- Add 2-4 relevant tags per node.
- Node content must be neutrally worded — rephrase the speaker's words into concise, objective summaries. Remove rhetorical flourishes, emotional language, and bias. State the core argument clearly in as few words as possible.
- Each node must have at most ONE outgoing edge (one parent). If a node could logically connect to multiple existing nodes, choose the single most appropriate parent. Do not create multiple edges from the same source node.

Contradiction detection:
- When a speaker's new node directly contradicts one of their OWN earlier nodes (the speaker asserts something logically incompatible with what they previously said), set "metadata.contradicts" to the ID of the contradicted node (e.g., "node_3").
- A contradiction means both statements cannot be true simultaneously — e.g., first claiming "X causes Y" then later claiming "X does not cause Y."
- Only flag clear, direct logical contradictions between the SAME speaker's nodes. Do not flag normal argumentation against the other user.
- Omit the field or set to null if no contradiction exists.

Goalpost moving detection:
- When a speaker's new node shifts, redefines, or significantly qualifies the scope of one of their OWN earlier claims in a way that changes its meaning — especially if the shift appears motivated by a counter-argument — set "metadata.moves_goalposts_from" to the ID of the node whose position is being moved away from.
- This is distinct from normal clarification. Goalpost moving is when the original claim is quietly replaced with a weaker or different claim to dodge a challenge.
- Example: originally claiming "all X are Y," then under pressure claiming "most X are Y" or "I only meant some X."
- Only flag clear cases. Omit the field or set to null if not applicable.

Agreement detection:
- When a speaker explicitly or implicitly agrees with an opposing speaker's node (e.g. "I agree that...", "You're right about...", "Fair point on...", or conceding a point), set "rating": "up" on that agreed-upon node.
- Also set "metadata.agreed_by": { "speaker": "<the agreeing speaker>", "text": "<the original agreeing statement verbatim>" } on that node. The "speaker" is who agreed (the current speaker), and "text" is the exact words from their statement that express agreement.
- Only set rating on nodes belonging to the OTHER speaker — a speaker cannot agree with their own nodes.
- Preserve any existing rating values set by the user. Only add new "up" ratings for newly detected agreements. Do not overwrite existing agreed_by metadata.
- If no agreement is detected, leave the rating field unchanged (null or its current value).`;

  const userMessage = `Current argument map:
${JSON.stringify(currentMap, null, 2)}

New statement from ${speaker}:
"${statement}"

Return the updated map JSON.`;

  // Call the Anthropic Messages API using fetch.
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
      max_tokens: 8000,
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

  // If the response was cut off mid-stream, the JSON will be truncated
  if (data.stop_reason === "max_tokens") {
    throw new Error("Response was too long and got cut off. The map may be too large — try the Chat tab to ask the moderator to summarise or prune some nodes.");
  }
 
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
 * Chat with the AI moderator about the argument map.
 * Supports back-and-forth conversation with optional map updates.
 *
 * @param {string} apiKey       — The user's Anthropic API key
 * @param {object} currentMap   — Current map state (full wrapper with argument_map)
 * @param {Array}  chatHistory  — Array of { role: "user"|"assistant", content: string }
 * @returns {{ reply: string, updatedMap: object|null }}
 */
export async function chatWithModerator(apiKey, currentMap, chatHistory) {
  const systemPrompt = `You are an AI debate moderator discussing an argument map with the user. You can explain your reasoning, discuss node classifications, answer questions about the map, and make edits when asked.

Current argument map:
${JSON.stringify(currentMap, null, 2)}

You MUST respond with valid JSON in this exact format:
{
  "reply": "Your conversational response here",
  "argument_map": null
}

- "reply" is your text response to the user (use plain text, not markdown).
- "argument_map" should be null unless the user asks you to modify the map. When modifying, return the full updated argument_map object (same schema as above).

Map schema when returning updates:
{
  "argument_map": {
    "title": "...",
    "description": "...",
    "nodes": [{ "id": "node_1", "type": "...", "content": "...", "speaker": "...", "metadata": { ... } }],
    "edges": [{ "id": "edge_1", "from": "...", "to": "...", "relationship": "..." }]
  }
}

Rules:
- Always include a conversational "reply" explaining what you did or answering the question.
- Only modify the map when the user explicitly asks for changes (corrections, edits, restructuring).
- When modifying, only change what was asked for. Keep everything else unchanged.
- Maintain valid node/edge IDs and references.
- When adding new nodes yourself (not on behalf of Blue or B), always set "speaker": "Moderator".`;

  // Build messages array from chat history
  const messages = chatHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

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
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data.content[0].text;
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      reply: parsed.reply || "I couldn't generate a response.",
      updatedMap: parsed.argument_map ? { argument_map: parsed.argument_map } : null,
    };
  } catch (e) {
    console.error("Failed to parse Claude response:", text);
    throw new Error("Claude returned invalid JSON. Try again.");
  }
}

/**
 * Toggles a thumbs-up or thumbs-down rating on a node.
 * Clicking the same rating again removes it. Ratings are mutually exclusive.
 *
 * @param {object} currentMap — Current map state (full wrapper with argument_map)
 * @param {string} nodeId     — The ID of the node being rated
 * @param {"up"|"down"} rating — The rating to toggle
 * @returns {object}          — Updated map
 */
export function rateNode(currentMap, nodeId, rating) {
  const inner = currentMap.argument_map;

  const updatedNodes = inner.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    const current = node.rating;
    // Toggle off if same rating, otherwise set new rating
    return { ...node, rating: current === rating ? null : rating };
  });

  return {
    argument_map: {
      ...inner,
      nodes: updatedNodes,
    },
  };
}
