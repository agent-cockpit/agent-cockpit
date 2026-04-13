import { describe, it, expect, beforeEach } from 'vitest'
import { CollisionMap, PLAYER_HITBOX } from '../CollisionMap.js'

// Tile coordinate math:
// TILE_SIZE=32, TILE_ORIGIN_X=-46, TILE_ORIGIN_Y=-43
// px = (cell.x - (-46)) * 32 = (cell.x + 46) * 32
// py = (cell.y - (-43)) * 32 = (cell.y + 43) * 32
//
// Cell at tile-space (x=-43, y=-40):
//   px = (-43 + 46) * 32 = 3 * 32 = 96
//   py = (-40 + 43) * 32 = 3 * 32 = 96
//   tileX = 96 / 32 = 3, tileY = 96 / 32 = 3
//
// Player start pixel (1472, 1376):
//   tileX = 1472/32 = 46, tileY = 1376/32 = 43
//   Cell at tile-space would be: x = 46 - 46 = 0, y = 43 - 43 = 0
//   So tile (0, 0) must NOT be solid

const SOLID_TILE_CELL = { x: -43, y: -40 } // → px=96, py=96, tileX=3, tileY=3

describe('CollisionMap — terrain loading', () => {
  let map: CollisionMap

  beforeEach(() => {
    map = new CollisionMap()
  })

  it('loadTerrain marks terrainId=3 cell as solid', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: SOLID_TILE_CELL.x, y: SOLID_TILE_CELL.y, terrainId: 3 }],
    })
    // AABB directly on that tile (96, 96, 32, 32) should overlap
    expect(map.overlaps(96, 96, 32, 32)).toBe(true)
  })

  it('loadTerrain marks terrainId=2 cell as solid', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: SOLID_TILE_CELL.x, y: SOLID_TILE_CELL.y, terrainId: 2 }],
    })
    expect(map.overlaps(96, 96, 32, 32)).toBe(true)
  })

  it('loadTerrain leaves terrainId=1 cell as walkable', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: SOLID_TILE_CELL.x, y: SOLID_TILE_CELL.y, terrainId: 1 }],
    })
    expect(map.overlaps(96, 96, 32, 32)).toBe(false)
  })

  it('loadTerrain treats unspecified tiles (defaultTerrain=0) as walkable (sparse map)', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [], // no cells — everything is open floor
    })
    expect(map.overlaps(500, 500, 32, 32)).toBe(false)
  })

  it('loadTerrain leaves terrainId=4 cell as walkable', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: SOLID_TILE_CELL.x, y: SOLID_TILE_CELL.y, terrainId: 4 }],
    })
    expect(map.overlaps(96, 96, 32, 32)).toBe(false)
  })

  it('loadTerrain leaves terrainId=5 cell as walkable', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: SOLID_TILE_CELL.x, y: SOLID_TILE_CELL.y, terrainId: 5 }],
    })
    expect(map.overlaps(96, 96, 32, 32)).toBe(false)
  })
})

describe('CollisionMap — object loading', () => {
  let map: CollisionMap

  beforeEach(() => {
    map = new CollisionMap()
    map.loadTerrain({ defaultTerrain: 0, cells: [] })
  })

  it('loadObjects skips objects whose description starts with "Character:"', () => {
    map.loadObjects([
      {
        description: 'Character: Astronaut',
        visible: true,
        boundingBox: { x: 200, y: 200, width: 64, height: 64 },
      },
    ])
    expect(map.overlaps(200, 200, 64, 64)).toBe(false)
  })

  it('loadObjects skips objects with visible=false', () => {
    map.loadObjects([
      {
        description: 'Pool Table',
        visible: false,
        boundingBox: { x: 300, y: 300, width: 96, height: 64 },
      },
    ])
    expect(map.overlaps(300, 300, 96, 64)).toBe(false)
  })

  it('loadObjects registers visible furniture AABB as solid', () => {
    map.loadObjects([
      {
        description: 'Pool Table',
        visible: true,
        boundingBox: { x: 400, y: 400, width: 96, height: 64 },
      },
    ])
    // AABB at same location should overlap
    expect(map.overlaps(400, 400, 96, 64)).toBe(true)
  })

  it('loadObjects registers partial overlap of furniture as solid', () => {
    map.loadObjects([
      {
        description: 'Desk',
        visible: true,
        boundingBox: { x: 600, y: 600, width: 64, height: 64 },
      },
    ])
    // Small AABB overlapping just a corner of the furniture
    expect(map.overlaps(630, 630, 32, 32)).toBe(true)
  })
})

describe('CollisionMap — overlaps', () => {
  let map: CollisionMap

  beforeEach(() => {
    map = new CollisionMap()
  })

  it('overlaps returns true when AABB corner lands on solid tile', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: SOLID_TILE_CELL.x, y: SOLID_TILE_CELL.y, terrainId: 3 }],
    })
    // Tile at pixel (96, 96) size 32x32, so placing AABB with just top-left corner there
    expect(map.overlaps(96, 96, 32, 32)).toBe(true)
  })

  it('overlaps returns false when AABB is entirely on open floor', () => {
    map.loadTerrain({ defaultTerrain: 0, cells: [] })
    expect(map.overlaps(500, 500, 32, 32)).toBe(false)
  })

  it('overlaps returns false when AABB is adjacent to (but not touching) solid tile', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: SOLID_TILE_CELL.x, y: SOLID_TILE_CELL.y, terrainId: 3 }],
    })
    // Solid tile covers pixels 96..127 (inclusive), place AABB just after: x=128
    expect(map.overlaps(128, 96, 32, 32)).toBe(false)
  })

  it('PLAYER_HITBOX is exported with correct dimensions', () => {
    expect(PLAYER_HITBOX).toEqual({ offsetX: 16, offsetY: 32, w: 32, h: 32 })
  })
})

describe('CollisionMap — player start position', () => {
  it('player start pixel (1472, 1376) is not in a solid tile when map has no solid cells near start', () => {
    const map = new CollisionMap()
    // Load terrain with no solid cells (all open floor)
    map.loadTerrain({ defaultTerrain: 0, cells: [] })
    map.loadObjects([])

    // Player hitbox at start position: x + offsetX, y + offsetY = 1472+16, 1376+32
    const hitX = 1472 + PLAYER_HITBOX.offsetX
    const hitY = 1376 + PLAYER_HITBOX.offsetY
    expect(map.overlaps(hitX, hitY, PLAYER_HITBOX.w, PLAYER_HITBOX.h)).toBe(false)
  })
})
