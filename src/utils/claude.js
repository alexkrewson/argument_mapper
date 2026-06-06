/**
 * claude.js — Helper for calling the Claude API via a Supabase Edge Function proxy.
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
import { supabase } from "./supabase.js";

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const err = new Error("Please sign in to use AI features.");
    err.code = "sign_in_required";
    throw err;
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}`,
  };
}

function handleProxyError(status, body) {
  if (status === 401) {
    const err = new Error("Please sign in to use AI features.");
    err.code = "sign_in_required";
    throw err;
  }
  if (status === 402) {
    const err = new Error("You're out of credits. Add more to continue.");
    err.code = "out_of_credits";
    throw err;
  }
  throw new Error(`Claude API error (${status}): ${body}`);
}

/**
 * Sends the current map + a new statement to Claude and gets back an updated map.
 *
 * @param {object} currentMap   — Current map state (full wrapper with argument_map)
 * @param {string} speaker      — "Blue" or "Green"
 * @param {string} statement    — The raw statement the user typed
 * @returns {object}            — Updated map with new nodes/edges added
 */
export async function updateArgumentMap(currentMap, speaker, statement, speakerNames = { a: "Blue", b: "Green" }, onCreditsUpdate = null) {
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
      "rating": "up|null",
      "metadata": {
        "confidence": "high|medium|low",
        "tags": ["keyword1", "keyword2"],
        "tactics": ["tactic_key_1", "tactic_key_2"],
        "tactic_reasons": { "tactic_key_1": "One-sentence explanation of why this tactic applies" },
        "agreed_by": { "speaker": "Blue|Green", "text": "the original agreeing statement" },
        "contradicts": "node_id_or_null",
        "moves_goalposts_from": "node_id_or_null",
        "non_sequitur": true,
        "twins": ["node_id_of_twin"],
        "despite_concession_of": "node_id"
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
- Rhetorical devices: analogy (tag any node whose original statement used a comparison or analogy to make a point; the content field must still express the argument in literal terms)
- Re-evaluate ALL existing nodes for tactics each turn — new context may reveal fallacies in earlier statements. Update metadata.tactics arrays accordingly.
- Keep all other existing node fields unchanged when updating tactics.
- Use an empty array [] if no tactics apply to a node.
- For every tactic in a node's tactics array, include a corresponding entry in metadata.tactic_reasons explaining WHY that tactic applies. Each reason should be one concise sentence. Example: "tactic_reasons": { "ad_hominem": "Attacks the speaker's character rather than their argument" }

Rules:
- Node IDs are "node_1", "node_2", etc. (incrementing). Edge IDs are "edge_1", "edge_2", etc.
- Keep all existing nodes and edges unchanged (except for metadata.tactics which should be re-evaluated).
- Set the "speaker" field on new nodes to the current speaker.
- The "speaker" JSON field must always be "Blue" or "Green" (internal identifiers). However, when referring to speakers inside node content, summaries, or any prose text, use their display names: "${speakerNames.a}" for Blue and "${speakerNames.b}" for Green.
- The first statement should set the title and description. Update them if the debate topic evolves.
- Assign appropriate confidence levels: high for facts/strong logic, medium for debatable, low for speculation.
- Add 2-4 relevant tags per node.
- Node content must be neutrally worded — rephrase the speaker's words into concise, objective summaries. Remove rhetorical flourishes, emotional language, and bias. State the core argument clearly in as few words as possible. If the speaker uses an analogy, strip the analogy from the content entirely and state the underlying argument in plain, literal terms; tag the node with the "analogy" tactic.
- Each node must have at most ONE outgoing edge (one parent). Do not create multiple edges from the same source node.
- TWIN NODES: If a new statement applies meaningfully to multiple separate branches of the tree (i.e., it logically supports or challenges nodes in branches that are not ancestors/descendants of each other), do NOT connect one node to multiple parents. Instead, create separate "twin" nodes — one per relevant parent branch — each with a unique node ID and exactly one outgoing edge. Link them by setting metadata.twins to an array of the other twins' node IDs on EACH twin node. Example: if node_8 and node_9 are twins, set node_8.metadata.twins = ["node_9"] and node_9.metadata.twins = ["node_8"]. Twins share the same speaker and nearly identical content. When one twin is conceded or contradicted, that consequence applies equally to all of its twins.
- SINGLE ROOT CONSTRAINT: There must be exactly ONE root node at all times. The root is the node that has no incoming edges (no edge has it as a "to" target). The very first statement creates this root claim. Every subsequent node you add MUST connect to the existing tree via an outgoing edge — a node with no edge is never allowed, UNLESS it is flagged as a non-sequitur (see below). If a new statement reveals that the debate concerns a broader topic and the initial root was merely a sub-case of it, UPDATE the existing root claim node's content to reflect the broader scope rather than creating a new disconnected node.

Non-sequitur detection:
- When a speaker's new statement does not logically connect to any existing node in the argument map — it introduces a wholly unrelated topic, switches the subject without any argumentative link, or is simply off-topic — set "metadata.non_sequitur": true on the new node and DO NOT create an edge for it (leave it disconnected from the tree).
- Only flag genuine non-sequiturs. A statement that challenges, supports, clarifies, or even loosely relates to the debate topic should be connected normally.
- Omit the field entirely (do not set it to false) when the statement logically belongs in the tree.

Contradiction detection:
- When a speaker's new node directly contradicts one of their OWN earlier nodes (the speaker asserts something logically incompatible with what they previously said), set "metadata.contradicts" to the ID of the contradicted node (e.g., "node_3").
- A contradiction means both statements cannot be true simultaneously — e.g., first claiming "X causes Y" then later claiming "X does not cause Y."
- Only flag clear, direct logical contradictions between the SAME speaker's nodes. A contradiction CANNOT occur between nodes belonging to different speakers — that is just normal debate. Do not flag normal argumentation against the other user.
- Omit the field or set to null if no contradiction exists.

Goalpost moving detection:
- When a speaker's new node shifts, redefines, or significantly qualifies the scope of one of their OWN earlier claims in a way that changes its meaning — especially if the shift appears motivated by a counter-argument — set "metadata.moves_goalposts_from" to the ID of the node whose position is being moved away from.
- This is distinct from normal clarification. Goalpost moving is when the original claim is quietly replaced with a weaker or different claim to dodge a challenge.
- Example: originally claiming "all X are Y," then under pressure claiming "most X are Y" or "I only meant some X."
- Only flag goalpost-moving within the SAME speaker's nodes. A speaker cannot move the goalposts of the OTHER speaker — that is just normal counter-argument. Only flag clear cases. Omit the field or set to null if not applicable.

Concessive rebuttal detection ("yeah, but..."):
- When a speaker implicitly or explicitly acknowledges that an OPPONENT's node is valid, but continues to argue their own position anyway, this is a concessive rebuttal. Signals: "yeah, but...", "even if that's true...", "granted, but...", "I'll concede that, however...", "that may be so, but...", or any phrasing that accepts a point while continuing to dispute the conclusion.
- Do TWO things when you detect this:
  1. On the conceded node (the opponent's node being acknowledged): set metadata.agreed_by = { "speaker": "<current speaker>", "text": "<exact phrase from their statement that expresses the concession>" }.
  2. Create the new rebuttal node as a SIBLING of the conceded node — connect it to the conceded node's PARENT (not to the conceded node itself). Set metadata.despite_concession_of = "<conceded_node_id>" on the new node. Use relationship "rebuts" or "opposes" to the parent.
- The new node represents "despite that being true, here is why my argument still stands." It belongs at the SAME level as the conceded node, not below it — making it a child of the conceded node would imply it supports or follows from it, which is wrong.
- Only apply this when the concession is genuine and explicit enough that a neutral observer would clearly read it as an acknowledgment. Omit despite_concession_of if not applicable.
- When a speaker explicitly or implicitly agrees with an opposing speaker's node (e.g. "I agree that...", "You're right about...", "Fair point on...", or conceding a point), set "rating": "up" on that agreed-upon node.
- Also set "metadata.agreed_by": { "speaker": "<the agreeing speaker>", "text": "<the original agreeing statement verbatim>" } on that node. The "speaker" is who agreed (the current speaker), and "text" is the exact words from their statement that express agreement.
- Only set rating "up" on nodes belonging to the OTHER speaker — a speaker cannot agree with their own nodes.
- Preserve any existing rating values set by the user. Only add new "up" ratings for newly detected agreements. Do not overwrite existing agreed_by metadata.
- If no agreement is detected, leave the rating field unchanged (null or its current value).

Self-concession detection (retracting own point):
- When a speaker explicitly concedes that one of their OWN earlier nodes was wrong or invalid (e.g. "I was wrong about...", "I admit my point about X was incorrect", "I concede that argument"), set "rating": "down" on that own node.
- Also set "metadata.conceded_by": { "speaker": "<current speaker>", "text": "<the verbatim words expressing self-concession>" } on that node.
- Only set rating "down" on nodes belonging to the CURRENT speaker (same speaker as the statement being submitted). Never set "down" on the opposing speaker's nodes.
- Only flag clear, explicit self-retractions — not normal qualification, updating, or clarification.
- If no self-concession is detected, leave all ratings unchanged.`;

  const displayName = speaker === "Blue" ? speakerNames.a : speakerNames.b;
  const userMessage = `Current argument map:
${JSON.stringify(currentMap, null, 2)}

New statement from ${displayName} (speaker: "${speaker}"):
"${statement}"

Return the updated map JSON.`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const creditsHeader = response.headers.get("X-Credits-Remaining");
  if (creditsHeader != null) onCreditsUpdate?.(parseFloat(creditsHeader));

  if (!response.ok) {
    const errorBody = await response.text();
    handleProxyError(response.status, errorBody);
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
    const parsed = JSON.parse(cleaned);
    parsed._usage = data.usage || null;
    return parsed;
  } catch (e) {
    console.error("Failed to parse Claude response:", text);
    throw new Error("Claude returned invalid JSON. Try again.");
  }
}

/**
 * Parse a pasted back-and-forth conversation into ordered turns.
 * The first distinct speaker maps to Blue (speakerNames.a), the second to Green.
 * Uses Haiku since this is a simple parsing task.
 *
 * @param {string} text         — Raw pasted conversation text
 * @param {object} speakerNames — { a: "...", b: "..." }
 * @returns {Array<{ speaker: "Blue"|"Green", text: string }>}
 */
export async function parseConversation(text, speakerNames, onCreditsUpdate = null) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: `Parse the following conversation into an ordered list of turns.
The first distinct speaker maps to "${speakerNames.a}" (use "Blue"). The second distinct speaker maps to "${speakerNames.b}" (use "Green").
Return ONLY a JSON array — no explanation, no markdown fences:
[{"speaker":"Blue","text":"..."},{"speaker":"Green","text":"..."},...]

Handle any of these common formats:
- WhatsApp: "[HH:MM, DD/MM/YYYY] Name: message" or "[date] Name: message"
- iMessage/SMS: "Name\nmessage" blocks or just alternating messages
- Slack: "Name [time]\nmessage" or "Name: message"
- Discord: "Name — Today at HH:MM\nmessage"
- Plain: "Name: message" on each line
- Transcripts: "SPEAKER\nmessage" blocks

Strip all timestamps, read receipts, reactions, and UI chrome from the text field — keep only the spoken content.
If someone sends multiple consecutive messages, treat each as a separate object.`,
      messages: [{ role: "user", content: text }],
    }),
  });

  const creditsHeader2 = response.headers.get("X-Credits-Remaining");
  if (creditsHeader2 != null) onCreditsUpdate?.(parseFloat(creditsHeader2));

  if (!response.ok) {
    const errorBody = await response.text();
    handleProxyError(response.status, errorBody);
  }

  const data = await response.json();
  const raw = data.content[0].text.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Could not parse the conversation. Make sure it contains two distinct speakers.");
  }
}

/**
 * Extracts a conversation from a screenshot image using Claude vision.
 * Returns turns in the same format as parseConversation.
 */
export async function extractConversationFromImage(imageBase64, mimeType, speakerNames, onCreditsUpdate = null) {
  const headers = await getAuthHeaders();
  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: `Extract the conversation from this screenshot. Return ONLY a JSON array — no explanation, no markdown fences:
[{"speaker":"Name","text":"message"},...]
Rules:
- Use the actual display names visible in the screenshot
- Strip timestamps, read receipts, reactions, and all UI chrome
- Preserve the exact message order
- If someone sends multiple consecutive messages, make each a separate object
- Include only spoken content`,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
          { type: "text", text: "Extract all conversation turns from this screenshot." }
        ]
      }]
    }),
  });

  const creditsHeader = response.headers.get("X-Credits-Remaining");
  if (creditsHeader != null) onCreditsUpdate?.(parseFloat(creditsHeader));

  if (!response.ok) {
    const errorBody = await response.text();
    handleProxyError(response.status, errorBody);
  }

  const data = await response.json();
  const raw = data.content[0].text.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const extracted = JSON.parse(raw);
    // Map first unique speaker → Blue, second → Green
    const speakerMap = {};
    let speakerCount = 0;
    return extracted.map(turn => {
      if (!(turn.speaker in speakerMap)) {
        speakerMap[turn.speaker] = speakerCount === 0 ? "Blue" : "Green";
        speakerCount++;
      }
      return { speaker: speakerMap[turn.speaker] ?? "Blue", text: turn.text };
    });
  } catch {
    throw new Error("Could not extract conversation from screenshot. Try pasting the text instead.");
  }
}

/**
 * Chat with the AI moderator about the argument map.
 * Supports back-and-forth conversation with optional map updates.
 *
 * @param {object} currentMap   — Current map state (full wrapper with argument_map)
 * @param {Array}  chatHistory  — Array of { role: "user"|"assistant", content: string }
 * @returns {{ reply: string, updatedMap: object|null }}
 */
export async function chatWithModerator(currentMap, chatHistory, speakerNames = { a: "Blue", b: "Green" }, onCreditsUpdate = null) {
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
- When adding new nodes yourself (not on behalf of Blue or Green), always set "speaker": "Moderator".
- The "speaker" JSON field must always be "Blue" or "Green" (internal identifiers). When referring to speakers in your reply or in node content, use their display names: "${speakerNames.a}" for Blue and "${speakerNames.b}" for Green.`;

  // Build messages array from chat history (truncate to last 20 to avoid token overflow)
  const recentHistory = chatHistory.length > 20 ? chatHistory.slice(-20) : chatHistory;
  const messages = recentHistory.map((msg) => ({ role: msg.role, content: msg.content }));

  const response = await fetch(API_URL, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  });

  const creditsHeader3 = response.headers.get("X-Credits-Remaining");
  if (creditsHeader3 != null) onCreditsUpdate?.(parseFloat(creditsHeader3));

  if (!response.ok) {
    const errorBody = await response.text();
    handleProxyError(response.status, errorBody);
  }

  const data = await response.json();

  if (data.stop_reason === "max_tokens") {
    return {
      reply: "My response was too long and got cut off. Try asking a more focused question, or ask me to summarise the map first.",
      updatedMap: null,
    };
  }

  const text = data.content[0].text;
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      reply: parsed.reply || "I couldn't generate a response.",
      updatedMap: parsed.argument_map ? { argument_map: parsed.argument_map } : null,
    };
  } catch (e) {
    if (text && text.trim().length > 0) {
      return { reply: text.trim(), updatedMap: null };
    }
    throw new Error("The moderator didn't respond. Try sending your message again.");
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
