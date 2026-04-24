import { NextRequest, NextResponse } from "next/server";

const USER_ID = "tanniruyuvasaiasrith_15052006";
const EMAIL_ID = "yuvasaiasrith_tanniru@srmap.edu.in";   
const COLLEGE_ROLL_NUMBER = "AP23110010708";    

interface HierarchyObject {
  root: string;
  tree: Record<string, unknown>;
  depth?: number;
  has_cycle?: true;
}

interface ResponseBody {
  user_id: string;
  email_id: string;
  college_roll_number: string;
  hierarchies: HierarchyObject[];
  invalid_entries: string[];
  duplicate_edges: string[];
  summary: {
    total_trees: number;
    total_cycles: number;
    largest_tree_root: string;
  };
}

const VALID_EDGE_RE = /^[A-Z]->[A-Z]$/;

function validateEntry(raw: string): { valid: boolean; entry: string } {
  const entry = raw.trim();
  if (!VALID_EDGE_RE.test(entry)) return { valid: false, entry: raw }; 
  const [parent, child] = entry.split("->");
  if (parent === child) return { valid: false, entry: raw };
  return { valid: true, entry };
}

function buildAdjacency(edges: string[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const [p, c] = edge.split("->");
    if (!adj.has(p)) adj.set(p, []);
    adj.get(p)!.push(c);
    if (!adj.has(c)) adj.set(c, []); 
  }
  return adj;
}

function findRoots(nodes: Set<string>, edges: string[]): string[] {
  const hasParent = new Set<string>();
  for (const edge of edges) {
    const [, c] = edge.split("->");
    hasParent.add(c);
  }
  return [...nodes].filter((n) => !hasParent.has(n)).sort();
}

function hasCycle(start: string, adj: Map<string, string[]>, groupNodes: Set<string>): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    stack.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (!groupNodes.has(neighbor)) continue;
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (stack.has(neighbor)) {
        return true;
      }
    }
    stack.delete(node);
    return false;
  }
  return dfs(start);
}

function buildTree(
  node: string,
  adj: Map<string, string[]>
): Record<string, unknown> {
  const children: Record<string, unknown> = {};
  for (const child of adj.get(node) ?? []) {
    children[child] = buildTree(child, adj);
  }
  return children;
}

function calcDepth(node: string, adj: Map<string, string[]>): number {
  const children = adj.get(node) ?? [];
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map((c) => calcDepth(c, adj)));
}

function getComponents(nodes: Set<string>, edges: string[]): Set<string>[] {
  const parent = new Map<string, string>();
  for (const n of nodes) parent.set(n, n);

  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(a: string, b: string) {
    parent.set(find(a), find(b));
  }

  for (const edge of edges) {
    const [p, c] = edge.split("->");
    union(p, c);
  }

  const groups = new Map<string, Set<string>>();
  for (const n of nodes) {
    const root = find(n);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root)!.add(n);
  }

  return [...groups.values()];
}


//api
export async function POST(req: NextRequest) {
  let body: { data?: unknown };
  try {
    body = await req.json();
    console.log("req body:", JSON.stringify(body));
  } catch (err) {
    console.error("json parse error:", err);
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const rawData = body?.data;
  if (!Array.isArray(rawData)) {
    return NextResponse.json({ error: "'data' must be an array" }, { status: 400 });
  }

  //validation
  const invalidEntries: string[] = [];
  const duplicateEdges: string[] = [];
  const seenEdges = new Set<string>();
  const validEdges: string[] = [];

  for (const raw of rawData) {
    const str = typeof raw === "string" ? raw : String(raw);
    const { valid, entry } = validateEntry(str);

    if (!valid) {
      invalidEntries.push(str.trim() === "" ? str : str);
      continue;
    }

    if (seenEdges.has(entry)) {
      if (!duplicateEdges.includes(entry)) duplicateEdges.push(entry);
    } else {
      seenEdges.add(entry);
      validEdges.push(entry);
    }
  }

  //building graph
  const childParent = new Map<string, string>();
  const filteredEdges: string[] = [];
  const allNodes = new Set<string>();

  for (const edge of validEdges) {
    const [p, c] = edge.split("->");
    allNodes.add(p);
    allNodes.add(c);
    if (!childParent.has(c)) {
      childParent.set(c, p);
      filteredEdges.push(edge);
    }
    // silently discard subsequent parent assignments
  }

  const adj = buildAdjacency(filteredEdges);

  const components = getComponents(allNodes, filteredEdges);
  const hierarchies: HierarchyObject[] = [];

  for (const group of components) {
    const groupEdges = filteredEdges.filter((e) => {
      const [p] = e.split("->");
      return group.has(p);
    });

    // cycle detection
    const candidateRoots = findRoots(group, groupEdges);
    const cycleDetected = [...group].some((n) => hasCycle(n, adj, group));

    if (cycleDetected) {
      const root = [...group].sort()[0];
      hierarchies.push({ root, tree: {}, has_cycle: true });
    } else {
      const roots = candidateRoots.length > 0 ? candidateRoots : [[...group].sort()[0]];
      for (const root of roots) {
        const children = buildTree(root, adj);
        const tree = { [root]: children };
        const depth = calcDepth(root, adj);
        hierarchies.push({ root, tree, depth });
      }
    }
  }

  //sorting
  hierarchies.sort((a, b) => {
    if (a.has_cycle && !b.has_cycle) return 1;
    if (!a.has_cycle && b.has_cycle) return -1;
    return a.root.localeCompare(b.root);
  });


  const trees = hierarchies.filter((h) => !h.has_cycle);
  const cycles = hierarchies.filter((h) => h.has_cycle);
  const totalTrees = trees.length;
  const totalCycles = cycles.length;

  let largestTreeRoot = "";
  let maxDepth = -1;
  for (const t of trees) {
    const d = t.depth ?? 0;
    if (d > maxDepth || (d === maxDepth && t.root < largestTreeRoot)) {
      maxDepth = d;
      largestTreeRoot = t.root;
    }
  }

  const response: ResponseBody = {
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: COLLEGE_ROLL_NUMBER,
    hierarchies,
    invalid_entries: invalidEntries,
    duplicate_edges: duplicateEdges,
    summary: {
      total_trees: totalTrees,
      total_cycles: totalCycles,
      largest_tree_root: largestTreeRoot,
    },
  };

  return NextResponse.json(response, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
