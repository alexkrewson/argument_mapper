import { supabase } from "./supabase";

// Two-person debates. A shared debate (turn_side not null) is only ever
// written through argument_mapper.submit_turn(), which checks that it's the
// caller's turn and that their copy of the map is the latest (migration
// 20261022130000). Solo debates keep the plain UPDATE in App's auto-save.

export const SIDE_TO_SPEAKER = { a: "Blue", b: "Green" };

/** Errors submit_turn raises on purpose; anything else is a real failure. */
export const TURN_CONFLICTS = ["not_your_turn", "stale_version"];

export function isTurnConflict(error) {
  return TURN_CONFLICTS.some((code) => error?.message?.includes(code));
}

/** The signed-in user's side in a debate, or null if they aren't a member. */
export async function getMySide(debateId, userId) {
  const { data, error } = await supabase
    .from("debate_members")
    .select("side")
    .eq("debate_id", debateId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.side ?? null;
}

/**
 * Save this turn's map. `row` carries title, map_data, theme_key, speaker_a
 * and speaker_b; pass `row = null` to only pass the turn (Skip Turn).
 * Resolves to { version, turn_side } as the server now has them.
 */
export async function submitTurn(debateId, expectedVersion, row, passTurn) {
  const { data, error } = await supabase.rpc("submit_turn", {
    p_debate_id: debateId,
    p_expected_version: expectedVersion,
    p_map_data: row?.map_data ?? null,
    p_title: row?.title ?? null,
    p_theme_key: row?.theme_key ?? null,
    p_speaker_a: row?.speaker_a ?? null,
    p_speaker_b: row?.speaker_b ?? null,
    p_pass_turn: passTurn,
  });
  if (error) throw error;
  return data[0];
}

/** The full row, for reloading after a conflict. */
export async function fetchDebate(debateId) {
  const { data, error } = await supabase
    .from("debates")
    .select("id, title, created_at, updated_at, speaker_a, speaker_b, theme_key, map_data, turn_side, version")
    .eq("id", debateId)
    .single();
  if (error) throw error;
  return data;
}
