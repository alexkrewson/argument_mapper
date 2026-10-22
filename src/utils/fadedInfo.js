// Compute faded/colored node sets for visual invalidation:
// - fadedNodeIds: opacity-faded due to thumbs-up (agreement) or thumbs-down (retraction)
// - contradictionFadedIds: light-red background (contradiction-affected)
// - walkbackFadedIds: light-orange background (goalpost-moving-affected)
// - contradictionBorderIds: thick red border (the two contradicting nodes)
// - walkbackBorderIds: thick orange border (the two walkback nodes)
//
// Shared by App and the view-only SharedView, so a shared map fades and
// borders exactly like the owner's.
export function computeFadedInfo(nodes, edges) {
  // Build predecessor map: targetId → Set of sourceIds
  const predecessorMap = new Map();
  for (const edge of edges) {
    if (!predecessorMap.has(edge.to)) predecessorMap.set(edge.to, new Set());
    predecessorMap.get(edge.to).add(edge.from);
  }

  function bfsBack(startIds) {
    const visited = new Set(startIds);
    const queue = [...startIds];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const predId of predecessorMap.get(current) || []) {
        if (!visited.has(predId)) {
          visited.add(predId);
          queue.push(predId);
        }
      }
    }
    return visited;
  }

  // Thumbs-up/down opacity fading (agreement + retraction).
  // Expand rated sets to include twins before BFS so twin subtrees fade together.
  const expandWithTwins = (ids) => {
    const expanded = new Set(ids);
    for (const id of ids) {
      for (const twinId of (nodes.find((n) => n.id === id)?.metadata?.twins ?? [])) {
        expanded.add(twinId);
      }
    }
    return [...expanded];
  };
  const agreedIds = nodes.filter((n) => n.rating === "up").map((n) => n.id);
  const downIds = nodes.filter((n) => n.rating === "down").map((n) => n.id);
  const fadedNodeIds = new Set([...bfsBack(expandWithTwins(agreedIds)), ...bfsBack(expandWithTwins(downIds))]);

  // Contradiction borders: both the flagging node AND the node being contradicted
  const contradictionBorderIds = new Set();
  const walkbackBorderIds = new Set();
  for (const node of nodes) {
    if (node.metadata?.contradicts) {
      contradictionBorderIds.add(node.id);
      contradictionBorderIds.add(node.metadata.contradicts);
    }
    if (node.metadata?.moves_goalposts_from) {
      walkbackBorderIds.add(node.id);
      walkbackBorderIds.add(node.metadata.moves_goalposts_from);
    }
  }

  // Contradiction colored backgrounds: contradicted node + predecessors + all border nodes
  const contradictionTargetIds = nodes
    .filter((n) => n.metadata?.contradicts)
    .map((n) => n.metadata.contradicts);
  const contradictionFadedIds = bfsBack(contradictionTargetIds);
  for (const id of contradictionBorderIds) contradictionFadedIds.add(id);

  // Walkback colored backgrounds: walked-back node + predecessors + all border nodes
  const walkbackTargetIds = nodes
    .filter((n) => n.metadata?.moves_goalposts_from)
    .map((n) => n.metadata.moves_goalposts_from);
  const walkbackFadedIds = bfsBack(walkbackTargetIds);
  for (const id of walkbackBorderIds) walkbackFadedIds.add(id);

  return { fadedNodeIds, contradictionFadedIds, walkbackFadedIds, contradictionBorderIds, walkbackBorderIds };
}
