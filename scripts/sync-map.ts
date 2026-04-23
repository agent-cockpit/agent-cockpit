import fs from 'node:fs'
import path from 'node:path'

type WalkResult = {
  files: string[]
  dirs: string[]
}

function walkDirectory(rootPath: string): WalkResult {
  const files: string[] = []
  const dirs: string[] = []

  function visit(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      const relativePath = path.relative(rootPath, fullPath)
      if (entry.isDirectory()) {
        dirs.push(relativePath)
        visit(fullPath)
      } else if (entry.isFile()) {
        files.push(relativePath)
      }
    }
  }

  visit(rootPath)
  return { files, dirs }
}

function ensureDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function main(): void {
  const sourceRoot = path.resolve('assets/raw/Cockpit Map Export')
  const destinationRoot = path.resolve('packages/ui/public/map')

  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`Source map directory not found: ${sourceRoot}`)
  }

  fs.mkdirSync(destinationRoot, { recursive: true })

  const sourceWalk = walkDirectory(sourceRoot)
  const sourceFileSet = new Set(sourceWalk.files)

  for (const relativeFilePath of sourceWalk.files) {
    const sourceFilePath = path.join(sourceRoot, relativeFilePath)
    const destinationFilePath = path.join(destinationRoot, relativeFilePath)
    ensureDirectory(destinationFilePath)
    fs.copyFileSync(sourceFilePath, destinationFilePath)
  }

  const destinationWalk = walkDirectory(destinationRoot)

  for (const relativeFilePath of destinationWalk.files) {
    if (sourceFileSet.has(relativeFilePath)) continue
    fs.rmSync(path.join(destinationRoot, relativeFilePath), { force: true })
  }

  // Remove empty directories, deepest first.
  const sortedDirs = destinationWalk.dirs.sort((a, b) => b.length - a.length)
  for (const relativeDirPath of sortedDirs) {
    const absoluteDirPath = path.join(destinationRoot, relativeDirPath)
    if (!fs.existsSync(absoluteDirPath)) continue
    const remainingEntries = fs.readdirSync(absoluteDirPath)
    if (remainingEntries.length === 0) {
      fs.rmdirSync(absoluteDirPath)
    }
  }
}

main()
