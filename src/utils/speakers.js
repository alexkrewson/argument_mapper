/** Returns the speaker display name, optionally translated through the active theme. */
export const spk = (speaker) => speaker ?? "";

/** Theme-aware display name: "Blue" → theme.a.name, "Green" → theme.b.name */
export function speakerName(speaker, theme) {
  if (speaker === "Blue")  return theme?.a.name ?? "Blue";
  if (speaker === "Green") return theme?.b.name ?? "Green";
  return speaker ?? "";
}

/** Theme-aware border/accent color for a speaker. */
export function speakerBorder(speaker, theme) {
  if (speaker === "Blue")  return theme?.a.border ?? "#3b82f6";
  if (speaker === "Green") return theme?.b.border ?? "#22c55e";
  return "#475569"; // Moderator
}

/** Theme-aware background color for a speaker. */
export function speakerBackground(speaker, theme) {
  if (speaker === "Blue")  return theme?.a.bg ?? "#dbeafe";
  if (speaker === "Green") return theme?.b.bg ?? "#dcfce7";
  return "#ede9fe"; // Moderator
}
