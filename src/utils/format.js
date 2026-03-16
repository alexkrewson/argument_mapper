/** Convert internal "node_N" id to display format "Node N": "node_3" → "Node 3" */
export const fmtNodeId = (id) => id.replace(/^node_(\d+)/i, "Node $1");

/** Just the number, for use in compact badges: "node_3" → "3" */
export const fmtNodeNum = (id) => id.replace(/^node_/i, "");
