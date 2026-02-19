/** Maps internal speaker IDs ("User A", "User B") to short display labels ("A", "B"). */
export const spk = (speaker) => speaker?.replace(/^User /, "") ?? speaker;
