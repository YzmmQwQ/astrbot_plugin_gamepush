import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(__dirname, "../..")

const SQLITE3_VERSION = "5.1.7" 

function removeDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) return
  const entries = fs.readdirSync(dirPath)
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry)
    const stat = fs.lstatSync(fullPath)
    if (stat.isDirectory()) {
      removeDirSync(fullPath)
    } else {
      fs.unlinkSync(fullPath)
    }
  }
  fs.rmdirSync(dirPath)
}

function moveDirSync(src, dest) {
  if (!fs.existsSync(src)) return
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

  const entries = fs.readdirSync(src)
  for (const entry of entries) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    const stat = fs.lstatSync(srcPath)

    if (stat.isDirectory()) {
      moveDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }

  removeDirSync(src)
}

function needRebuild() {
  const nodeBinary = path.join(pluginRoot, "node_modules/sqlite3/build/Release/node_sqlite3.node")
  const pkgJsonPath = path.join(pluginRoot, "node_modules/sqlite3/package.json")

  if (!fs.existsSync(nodeBinary) || !fs.existsSync(pkgJsonPath)) return true

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"))
    if (pkg.version !== SQLITE3_VERSION) return true
    return false
  } catch {
    return true
  }
}

async function run() {
  try {
    if (!needRebuild()) {
      console.log(`[sqlite3] 已存在且版本匹配，跳过编译。`)
      return
    }
    
    console.log(`[sqlite3] 开始编译 sqlite3@${SQLITE3_VERSION}...`)

    execSync(
      `pnpx @karinjs/prebuild-install -r napi --target 6 --pkg_version=${SQLITE3_VERSION} --pkg_name=sqlite3`,
      { stdio: "inherit" }
    )

    console.log(`[sqlite3] 编译完成，准备移动文件...`)

    const buildPath = path.join(pluginRoot, "build")
    const targetPath = path.join(pluginRoot, "node_modules/sqlite3/build")

    if (!fs.existsSync(buildPath)) {
      console.error(`[sqlite3] 未找到 build 目录，编译可能失败。`)
      process.exit(1)
    }

    removeDirSync(targetPath)
    moveDirSync(buildPath, targetPath)
    console.log(`[sqlite3] 成功移动 build 到 node_modules/sqlite3`)
  } catch (err) {
    console.error(`[sqlite3] 编译或移动失败：`, err)
    process.exit(1)
  }
}

run()
