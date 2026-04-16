export interface NpcPosition {
  x: number
  y: number
}

export interface WalkGrid {
  cellSize: number
  cols: number
  rows: number
  walkable: Uint8Array
}

export interface WalkGridBuildInput {
  worldWidth: number
  worldHeight: number
  cellSize?: number
  spriteSizePx?: number
  hitbox: { offsetX: number; offsetY: number; w: number; h: number }
  overlaps: (x: number, y: number, w: number, h: number) => boolean
}

interface GridCell {
  col: number
  row: number
}

const DEFAULT_CELL_SIZE = 32
const DEFAULT_SPRITE_SIZE = 64
const DIAGONAL_COST = Math.SQRT2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toIndex(col: number, row: number, cols: number): number {
  return row * cols + col
}

function isInsideGrid(cell: GridCell, grid: WalkGrid): boolean {
  return cell.col >= 0 && cell.col < grid.cols && cell.row >= 0 && cell.row < grid.rows
}

function gridCellFromWorld(pos: NpcPosition, grid: WalkGrid): GridCell {
  const col = clamp(Math.round(pos.x / grid.cellSize), 0, grid.cols - 1)
  const row = clamp(Math.round(pos.y / grid.cellSize), 0, grid.rows - 1)
  return { col, row }
}

function gridCellToWorld(cell: GridCell, grid: WalkGrid): NpcPosition {
  return {
    x: cell.col * grid.cellSize,
    y: cell.row * grid.cellSize,
  }
}

function isWalkable(cell: GridCell, grid: WalkGrid): boolean {
  if (!isInsideGrid(cell, grid)) return false
  return grid.walkable[toIndex(cell.col, cell.row, grid.cols)] === 1
}

function heuristic(a: GridCell, b: GridCell): number {
  // Octile distance for 8-neighbor movement.
  const dx = Math.abs(a.col - b.col)
  const dy = Math.abs(a.row - b.row)
  const diagonal = Math.min(dx, dy)
  const straight = Math.max(dx, dy) - diagonal
  return diagonal * DIAGONAL_COST + straight
}

function findNearestWalkableCell(origin: GridCell, grid: WalkGrid): GridCell | null {
  if (isWalkable(origin, grid)) return origin

  const queue: GridCell[] = [origin]
  const visited = new Uint8Array(grid.cols * grid.rows)
  visited[toIndex(origin.col, origin.row, grid.cols)] = 1

  const neighbors: ReadonlyArray<GridCell> = [
    { col: 0, row: -1 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: -1, row: 0 },
    { col: 1, row: -1 },
    { col: 1, row: 1 },
    { col: -1, row: 1 },
    { col: -1, row: -1 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    for (const delta of neighbors) {
      const next = { col: current.col + delta.col, row: current.row + delta.row }
      if (!isInsideGrid(next, grid)) continue
      const nextIndex = toIndex(next.col, next.row, grid.cols)
      if (visited[nextIndex] === 1) continue
      visited[nextIndex] = 1
      if (isWalkable(next, grid)) return next
      queue.push(next)
    }
  }

  return null
}

function buildPath(goalIndex: number, cameFrom: Int32Array, grid: WalkGrid): NpcPosition[] {
  const pathCells: GridCell[] = []
  let cursor = goalIndex
  while (cursor >= 0) {
    const row = Math.floor(cursor / grid.cols)
    const col = cursor % grid.cols
    pathCells.push({ col, row })
    cursor = cameFrom[cursor]
  }
  pathCells.reverse()
  return pathCells.map((cell) => gridCellToWorld(cell, grid))
}

function getNeighbors(cell: GridCell, grid: WalkGrid): Array<{ cell: GridCell; cost: number }> {
  const candidates: ReadonlyArray<{ dc: number; dr: number; cost: number }> = [
    { dc: 0, dr: -1, cost: 1 },
    { dc: 1, dr: 0, cost: 1 },
    { dc: 0, dr: 1, cost: 1 },
    { dc: -1, dr: 0, cost: 1 },
    { dc: 1, dr: -1, cost: DIAGONAL_COST },
    { dc: 1, dr: 1, cost: DIAGONAL_COST },
    { dc: -1, dr: 1, cost: DIAGONAL_COST },
    { dc: -1, dr: -1, cost: DIAGONAL_COST },
  ]

  const out: Array<{ cell: GridCell; cost: number }> = []

  for (const candidate of candidates) {
    const next = { col: cell.col + candidate.dc, row: cell.row + candidate.dr }
    if (!isWalkable(next, grid)) continue

    // Block diagonal corner-cutting through adjacent solid cells.
    if (candidate.dc !== 0 && candidate.dr !== 0) {
      const sideA = { col: cell.col + candidate.dc, row: cell.row }
      const sideB = { col: cell.col, row: cell.row + candidate.dr }
      if (!isWalkable(sideA, grid) || !isWalkable(sideB, grid)) continue
    }

    out.push({ cell: next, cost: candidate.cost })
  }

  return out
}

export function buildWalkGrid(input: WalkGridBuildInput): WalkGrid {
  const cellSize = Math.max(1, Math.floor(input.cellSize ?? DEFAULT_CELL_SIZE))
  const spriteSizePx = Math.max(1, Math.floor(input.spriteSizePx ?? DEFAULT_SPRITE_SIZE))
  const cols = Math.max(1, Math.floor((input.worldWidth - spriteSizePx) / cellSize) + 1)
  const rows = Math.max(1, Math.floor((input.worldHeight - spriteSizePx) / cellSize) + 1)
  const walkable = new Uint8Array(cols * rows)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const worldX = col * cellSize
      const worldY = row * cellSize
      const blocked = input.overlaps(
        worldX + input.hitbox.offsetX,
        worldY + input.hitbox.offsetY,
        input.hitbox.w,
        input.hitbox.h,
      )
      walkable[toIndex(col, row, cols)] = blocked ? 0 : 1
    }
  }

  return { cellSize, cols, rows, walkable }
}

export function planPath(start: NpcPosition, goal: NpcPosition, grid: WalkGrid): NpcPosition[] {
  if (grid.cols <= 0 || grid.rows <= 0) return []
  const requestedGoalCell = gridCellFromWorld(goal, grid)
  const startCell = findNearestWalkableCell(gridCellFromWorld(start, grid), grid)
  const goalCell = findNearestWalkableCell(requestedGoalCell, grid)
  if (!startCell || !goalCell) return []

  const startIndex = toIndex(startCell.col, startCell.row, grid.cols)
  const goalIndex = toIndex(goalCell.col, goalCell.row, grid.cols)
  if (startIndex === goalIndex) return [gridCellToWorld(goalCell, grid)]

  const totalNodes = grid.cols * grid.rows
  const gScore = new Float64Array(totalNodes)
  const fScore = new Float64Array(totalNodes)
  const cameFrom = new Int32Array(totalNodes)
  const inOpenSet = new Uint8Array(totalNodes)
  const closedSet = new Uint8Array(totalNodes)
  gScore.fill(Number.POSITIVE_INFINITY)
  fScore.fill(Number.POSITIVE_INFINITY)
  cameFrom.fill(-1)

  const openSet: number[] = [startIndex]
  inOpenSet[startIndex] = 1
  gScore[startIndex] = 0
  fScore[startIndex] = heuristic(startCell, goalCell)

  while (openSet.length > 0) {
    let bestIdx = 0
    let bestNode = openSet[0]!
    for (let i = 1; i < openSet.length; i++) {
      const candidate = openSet[i]!
      if (
        fScore[candidate] < fScore[bestNode] ||
        (fScore[candidate] === fScore[bestNode] && gScore[candidate] < gScore[bestNode]) ||
        (fScore[candidate] === fScore[bestNode] && gScore[candidate] === gScore[bestNode] && candidate < bestNode)
      ) {
        bestIdx = i
        bestNode = candidate
      }
    }

    if (bestNode === goalIndex) {
      const path = buildPath(goalIndex, cameFrom, grid)
      if (path.length === 0) return []
      // Keep exact requested goal as final waypoint (for smooth arrival at non-grid aligned targets).
      const final = path[path.length - 1]!
      const requestedGoalIndex = toIndex(requestedGoalCell.col, requestedGoalCell.row, grid.cols)
      if (goalIndex === requestedGoalIndex && Math.hypot(final.x - goal.x, final.y - goal.y) > 0.1) {
        path.push({ x: goal.x, y: goal.y })
      }
      return path
    }

    openSet.splice(bestIdx, 1)
    inOpenSet[bestNode] = 0
    closedSet[bestNode] = 1

    const current = { col: bestNode % grid.cols, row: Math.floor(bestNode / grid.cols) }
    const neighbors = getNeighbors(current, grid)
    for (const neighbor of neighbors) {
      const neighborIndex = toIndex(neighbor.cell.col, neighbor.cell.row, grid.cols)
      if (closedSet[neighborIndex] === 1) continue

      const tentativeG = gScore[bestNode] + neighbor.cost
      if (tentativeG >= gScore[neighborIndex]) continue

      cameFrom[neighborIndex] = bestNode
      gScore[neighborIndex] = tentativeG
      fScore[neighborIndex] = tentativeG + heuristic(neighbor.cell, goalCell)

      if (inOpenSet[neighborIndex] === 0) {
        openSet.push(neighborIndex)
        inOpenSet[neighborIndex] = 1
      }
    }
  }

  return []
}
