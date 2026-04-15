import { describe, it, expect, beforeEach } from 'vitest'
import { CollisionMap } from '../CollisionMap.js'

describe('CollisionMap append + origins', () => {
  let map: CollisionMap

  beforeEach(() => {
    map = new CollisionMap()
  })

  it('loadTerrain with append=true preserves tiles from first load', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: -43, y: -40, terrainId: 3 }],
    })

    map.loadTerrain(
      {
        defaultTerrain: 0,
        cells: [{ x: -42, y: -40, terrainId: 3 }],
      },
      { append: true },
    )

    expect(map.overlaps(96, 96, 32, 32)).toBe(true)
    expect(map.overlaps(128, 96, 32, 32)).toBe(true)
  })

  it('loadTerrain with append=false (default) clears previous tiles', () => {
    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: -43, y: -40, terrainId: 3 }],
    })

    map.loadTerrain({
      defaultTerrain: 0,
      cells: [{ x: -42, y: -40, terrainId: 3 }],
    })

    expect(map.overlaps(96, 96, 32, 32)).toBe(false)
    expect(map.overlaps(128, 96, 32, 32)).toBe(true)
  })

  it('loadTerrain with worldOriginX=3200 shifts solid tile world position by offset', () => {
    map.loadTerrain(
      {
        defaultTerrain: 0,
        cells: [{ x: 0, y: 0, terrainId: 3 }],
      },
      {
        tileOriginX: -46,
        tileOriginY: -43,
        worldOriginX: 3200,
        worldOriginY: 0,
      },
    )

    expect(map.overlaps(4672, 1376, 32, 32)).toBe(true)
  })

  it('loadObjects with worldOriginX places object rect at correct world position', () => {
    map.loadTerrain({ defaultTerrain: 0, cells: [] })
    map.loadObjects(
      [
        {
          description: 'Desk',
          visible: true,
          boundingBox: { x: 400, y: 400, width: 96, height: 64 },
        },
      ],
      {},
      {
        tileOriginX: -46,
        tileOriginY: -43,
        worldOriginX: 3200,
        worldOriginY: 0,
      },
    )

    expect(map.overlaps(5104, 1840, 96, 64)).toBe(true)
  })
})
