import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

// View-only share links. The owner turns one on for a debate; anyone with the
// link watches the map at /?view=<token> without an account. The token lives
// in debates.share_token, and argument_mapper.get_shared_debate() is the only
// way to read a debate by it (migration 20261017120000).
//
// The viewer is web-only, so the APK builds its links against the live site;
// its own origin is the WebView's localhost and means nothing to anyone else.
const PROD_ORIGIN = "https://idisagree.trolleysolution.com";

export const VIEW_PARAM = "view";

export function shareUrl(token) {
  const origin = Capacitor.isNativePlatform() ? PROD_ORIGIN : window.location.origin;
  return `${origin}/?${VIEW_PARAM}=${token}`;
}

/** The token in the current URL, or null. Web only: the APK never opens one. */
export function viewTokenFromLocation() {
  if (Capacitor.isNativePlatform()) return null;
  const token = new URLSearchParams(window.location.search).get(VIEW_PARAM);
  return token && /^[0-9a-f-]{36}$/i.test(token) ? token : null;
}

export async function getShareToken(debateId) {
  const { data, error } = await supabase.from("debates").select("share_token").eq("id", debateId).single();
  if (error) throw error;
  return data.share_token;
}

/** Always a fresh token, so a link that was turned off stays dead. */
export async function enableShare(debateId) {
  const token = crypto.randomUUID();
  const { error } = await supabase.from("debates").update({ share_token: token }).eq("id", debateId);
  if (error) throw error;
  return token;
}

export async function disableShare(debateId) {
  const { error } = await supabase.from("debates").update({ share_token: null }).eq("id", debateId);
  if (error) throw error;
}

/** The shared debate, or null when the link is off or never existed. */
export async function fetchSharedDebate(token) {
  const { data, error } = await supabase.rpc("get_shared_debate", { p_token: token });
  if (error) throw error;
  return data?.[0] ?? null;
}
