import { describe, expect, it } from 'vitest'
import { planPath, type WalkGrid } from '../NpcPathfinding.js'

function makeGrid(cols: number, rows: number): WalkGrid {
  return {
    cellSize: 32,
    cols,
    rows,
    walkable: new Uint8Array(cols * rows).fill(1),
  }
}

function blockCell(grid: WalkGrid, col: number, row: number): void {
  grid.walkable[row * grid.cols + col] = 0
}

describe('planPath', () => {
  it('finds a deterministic route around obstacles', () => {
    const grid = makeGrid(6, 6)
    blockCell(grid, 2, 0)
    blockCell(grid, 2, 1)
    blockCell(grid, 2, 2)
    blockCell(grid, 2, 4)
    blockCell(grid, 2, 5)

    const start = { x: 0, y: 0 }      // cell (0, 0)
    const goal = { x: 160, y: 0 }     // cell (5, 0)

    const first = planPath(start, goal, grid)
    const second = planPath(start, goal, grid)

    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(0)
    const last = first[first.length - 1]
    expect(last).toEqual(goal)
    // The wall with one gap should force path below row 0 before reaching goal.
    expect(first.some((waypoint) => waypoint.y > 0)).toBe(true)
  })

  it('returns empty path when start/goal islands are disconnected', () => {
    const grid = makeGrid(4, 4)
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        blockCell(grid, col, row)
      }
    }
    grid.walkable[0] = 1         // (0,0)
    grid.walkable[15] = 1        // (3,3)

    const path = planPath({ x: 0, y: 0 }, { x: 96, y: 96 }, grid)
    expect(path).toEqual([])
  })
})
