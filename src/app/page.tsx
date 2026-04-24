'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { AlertCircle, FileJson, Network, Layers, RefreshCw, Info } from 'lucide-react'
import { ReactFlow, MiniMap, Controls, Background, Node, Edge, Position, useNodesState, useEdgesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'

interface HierarchyObject {
  root: string
  tree: Record<string, unknown>
  depth?: number
  has_cycle?: true
}

interface ApiResponse {
  user_id: string
  email_id: string
  college_roll_number: string
  hierarchies: HierarchyObject[]
  invalid_entries: string[]
  duplicate_edges: string[]
  summary: {
    total_trees: number
    total_cycles: number
    largest_tree_root: string
  }
}

const VALID_EDGE_RE = /^[A-Z]->[A-Z]$/

const dagreGraph = new dagre.graphlib.Graph()
dagreGraph.setDefaultEdgeLabel(() => ({}))

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 })

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 100, height: 40 })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    return {
      ...node,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: {
        x: nodeWithPosition.x - 50,
        y: nodeWithPosition.y - 20,
      },
    }
  })

  return { nodes: newNodes, edges }
}

function getRenderableEdges(entries: string[]) {
  const seenEdges = new Set<string>()
  const childParent = new Map<string, string>()
  const edges: Array<{ source: string; target: string }> = []

  for (const raw of entries) {
    const entry = raw.trim()
    if (!VALID_EDGE_RE.test(entry)) continue

    const [parent, child] = entry.split('->')
    if (parent === child) continue
    if (seenEdges.has(entry)) continue

    seenEdges.add(entry)
    if (childParent.has(child)) continue

    childParent.set(child, parent)
    edges.push({ source: parent, target: child })
  }

  return edges
}

function getComponentForRoot(root: string, edges: Array<{ source: string; target: string }>) {
  const undirected = new Map<string, Set<string>>()

  for (const { source, target } of edges) {
    if (!undirected.has(source)) undirected.set(source, new Set())
    if (!undirected.has(target)) undirected.set(target, new Set())
    undirected.get(source)!.add(target)
    undirected.get(target)!.add(source)
  }

  if (!undirected.has(root)) return { nodes: new Set<string>([root]), edges: [] as Array<{ source: string; target: string }> }

  const queue: string[] = [root]
  const visited = new Set<string>([root])

  while (queue.length > 0) {
    const node = queue.shift()!
    for (const neighbor of undirected.get(node) ?? []) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      queue.push(neighbor)
    }
  }

  return {
    nodes: visited,
    edges: edges.filter(({ source, target }) => visited.has(source) && visited.has(target)),
  }
}

function parseHierarchiesToFlow(hierarchies: HierarchyObject[], entries: string[]) {
  const initialNodes: Node[] = []
  const initialEdges: Edge[] = []
  const addedNodes = new Set<string>()
  const addedEdges = new Set<string>()
  const renderableEdges = getRenderableEdges(entries)

  hierarchies.forEach((h) => {
    if (h.has_cycle) {
      const component = getComponentForRoot(h.root, renderableEdges)

      component.nodes.forEach((nodeId) => {
        if (addedNodes.has(nodeId)) return
        addedNodes.add(nodeId)
        const isRoot = nodeId === h.root
        initialNodes.push({
          id: nodeId,
          data: { label: isRoot ? `${nodeId} (Cycle Detected)` : nodeId },
          style: {
            background: '#fee2e2',
            border: isRoot ? '1.5px solid #dc2626' : '1px solid #ef4444',
            color: '#991b1b',
            borderRadius: '8px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
          position: { x: 0, y: 0 },
        })
      })

      component.edges.forEach(({ source, target }) => {
        const edgeId = `${source}-${target}`
        if (addedEdges.has(edgeId)) return
        addedEdges.add(edgeId)
        initialEdges.push({
          id: edgeId,
          source,
          target,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#dc2626', strokeWidth: 2 },
        })
      })

      return
    }

    const traverse = (nodeId: string, treeNode: Record<string, unknown>) => {
      if (!addedNodes.has(nodeId)) {
        addedNodes.add(nodeId)
        initialNodes.push({
          id: nodeId,
          data: { label: nodeId },
          style: {
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            color: '#0f172a',
            borderRadius: '8px',
            fontWeight: 600,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
          position: { x: 0, y: 0 },
        })
      }

      Object.entries(treeNode).forEach(([childId, grandChildren]) => {
        const edgeId = `${nodeId}-${childId}`
        if (!addedEdges.has(edgeId)) {
          addedEdges.add(edgeId)
          initialEdges.push({
            id: edgeId,
            source: nodeId,
            target: childId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2 },
          })
        }

        traverse(childId, grandChildren as Record<string, unknown>)
      })
    }

    const rootChildren = (h.tree as Record<string, Record<string, unknown>>)[h.root] ?? {}
    traverse(h.root, rootChildren)
  })

  return getLayoutedElements(initialNodes, initialEdges)
}

function HierarchyFlow({ hierarchies, submittedEntries }: { hierarchies: HierarchyObject[]; submittedEntries: string[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = parseHierarchiesToFlow(hierarchies, submittedEntries)
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [hierarchies, submittedEntries, setNodes, setEdges])

  return (
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView attributionPosition="bottom-right" className="bg-slate-50">
      <Background color="#cbd5e1" gap={16} />
      <Controls />
      <MiniMap zoomable pannable nodeColor="#cbd5e1" maskColor="rgba(248, 250, 252, 0.7)" />
    </ReactFlow>
  )
}

const PLACEHOLDER = `A->B, A->C, B->D, C->E, E->F,
X->Y, Y->Z, Z->X,
P->Q, Q->R,
G->H, G->H, G->I,
hello, 1->2, A->`

export default function Home() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rawJson, setRawJson] = useState(true)
  const [submittedEntries, setSubmittedEntries] = useState<string[]>([])

  async function handleSubmit() {
    setError(null)
    setResult(null)
    setLoading(true)

    const entries = input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    if (entries.length === 0) {
      setError('Please enter at least one node entry.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/bfhl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: entries }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const json: ApiResponse = await res.json()
      setSubmittedEntries(entries)
      setResult(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error occurred while processing.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100/60 text-foreground px-4 py-10 md:px-8 md:py-14 lg:px-12">
      <div className="mx-auto w-full max-w-7xl space-y-8 lg:space-y-10">
        <div className="flex justify-end">
          <p className="text-sm text-slate-600">
            Visit my portfolio{' '}
            <a href="https://asrithtanniru.dev" target="_blank" rel="noreferrer" className="font-bold underline underline-offset-4 transition-colors hover:text-blue-700">
              @asrithtanniru.dev
            </a>
          </p>
        </div>
        <div className="flex w-full flex-col items-center space-y-3 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl"> BFHL Node Hierarchy Analyzer</h1>
          <p className="w-full max-w-2xl text-base text-slate-600 sm:text-lg">Challenge submission interface for processing hierarchical node relationships.</p>
        </div>

        <div className="flex w-full justify-center">
          <div className="w-full max-w-4xl">
            <Card className="border-slate-200/90 py-5 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Data Input
                </CardTitle>
                <CardDescription>Enter node edges (e.g., A-&gt;B). Separate by commas or newlines.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="nodes">Node Data</Label>
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-600 hover:text-blue-700" onClick={() => setInput(PLACEHOLDER.trim())}>
                      Load Example
                    </Button>
                  </div>
                  <Textarea
                    id="nodes"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={PLACEHOLDER}
                    className="min-h-[180px] resize-y border-slate-300 bg-white px-3 py-2.5 text-sm"
                  />
                </div>
                <Button onClick={handleSubmit} disabled={loading} className="h-11 w-full text-sm">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </span>
                  ) : (
                    'Analyze Hierarchy'
                  )}
                </Button>
              </CardContent>
            </Card>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        {result && (
          <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 xl:grid-cols-[1.06fr_1fr]">
            <div className="flex flex-col space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="border-slate-200/90 py-3 shadow-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Trees</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="text-2xl font-bold">{result.summary.total_trees}</div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/90 py-3 shadow-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cycles</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="text-2xl font-bold">{result.summary.total_cycles}</div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/90 py-3 shadow-sm">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Largest Root</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="text-2xl font-bold text-primary">{result.summary.largest_tree_root || '—'}</div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200/90 py-4 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Validation Issues
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-slate-700">Invalid Entries</h4>
                    {result.invalid_entries.length === 0 ? (
                      <p className="text-sm text-slate-500">No invalid entries.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {result.invalid_entries.map((e, i) => (
                          <Badge key={i} variant="destructive" className="text-xs font-normal">
                            {e || '""'}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-slate-700">Duplicate Edges</h4>
                    {result.duplicate_edges.length === 0 ? (
                      <p className="text-sm text-slate-500">No duplicate edges.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {result.duplicate_edges.map((e, i) => (
                          <Badge key={i} variant="secondary" className="border-amber-200 bg-amber-100 text-xs font-normal text-amber-800 hover:bg-amber-200">
                            {e}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200/90 py-4 shadow-sm">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Request Info
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setRawJson(!rawJson)} className="h-8 gap-2 text-xs">
                    <FileJson className="h-3 w-3" />
                    {rawJson ? 'Hide JSON' : 'View Raw JSON'}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid grid-cols-1 gap-x-4 gap-y-4 text-sm md:grid-cols-2">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase tracking-wider font-semibold">User ID</span>
                      <span className="font-medium text-slate-900">{result.user_id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase tracking-wider font-semibold">Roll Number</span>
                      <span className="font-medium text-slate-900">{result.college_roll_number}</span>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-slate-500 block text-[10px] uppercase tracking-wider font-semibold">Email</span>
                      <span className="font-medium text-slate-900">{result.email_id}</span>
                    </div>
                  </div>

                  {rawJson && (
                    <div className="mt-4 max-h-[360px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <pre className="text-xs leading-relaxed text-slate-700">{JSON.stringify(result, null, 2)}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="relative h-[520px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-auto lg:min-h-[620px]">
              <div className="absolute left-4 top-4 z-10 rounded-md border bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm backdrop-blur-sm">Visual Hierarchy</div>
              <HierarchyFlow hierarchies={result.hierarchies} submittedEntries={submittedEntries} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
