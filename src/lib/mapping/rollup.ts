/**
 * Corporate roll-up: resolve each recipient to the top of its ownership chain so a
 * subsidiary ("SIKORSKY AIRCRAFT") is matched through its parent ("LOCKHEED MARTIN").
 */

export interface RecipientNode {
  id: string;
  name: string;
  parentUei: string | null;
  parentName: string | null;
  ultimateParentUei: string | null;
}

export interface Root {
  /** Recipient id / UEI of the top of the chain (may not exist as a Recipient). */
  id: string;
  /** Raw name of the root (from its own record, else the child's parent name). */
  name: string;
  /** ids from the recipient up to the root. */
  chain: string[];
}

export const MAX_DEPTH = 3;

/** Next hop up: SAM ultimate parent first, then USAspending parent. Null at the top. */
function parentOf(n: RecipientNode): string | null {
  const p = n.ultimateParentUei ?? n.parentUei;
  return p && p !== n.id ? p : null;
}

/** Ids to load to resolve `nodes` one more level (callers fetch them, up to MAX_DEPTH times). */
export function missingParents(nodes: Map<string, RecipientNode>): string[] {
  const out = new Set<string>();
  for (const n of nodes.values()) {
    const p = parentOf(n);
    if (p && !nodes.has(p)) out.add(p);
  }
  return [...out];
}

export function resolveRoot(start: RecipientNode, nodes: Map<string, RecipientNode>): Root {
  const chain = [start.id];
  let current = start;
  let name = start.name;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const p = parentOf(current);
    if (!p || chain.includes(p)) break; // top reached, or a cycle in source data
    chain.push(p);
    const parent = nodes.get(p);
    if (!parent) {
      // Parent isn't a recipient itself; we only know its name from the child's record.
      name = current.parentName ?? name;
      break;
    }
    current = parent;
    name = parent.name;
  }
  return { id: chain[chain.length - 1], name, chain };
}
