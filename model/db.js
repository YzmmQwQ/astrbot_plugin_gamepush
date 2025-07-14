import sqlite3 from "sqlite3"
import path from "path"
import fs from "fs"
import https from "https"
import { BotName } from "#GamePush.components"

const DB_DIR = path.join(
  process.cwd(),
  BotName === "Karin" ? "@karinjs/karin-plugin-gamepush/data" : "data"
)
const DB_PATH = path.join(DB_DIR, "GamePush-Plugin.db")

let db

const ensureDirExists = () => {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
    logger.debug(`📂 创建数据库目录: ${DB_DIR}`)
  }
}

const downloadDatabase = () => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(DB_PATH)
    logger.debug("⬇️ 开始下载数据库文件...")
    https
      .get(
        "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin.db",
        (response) => {
          const { statusCode } = response

          if (statusCode !== 200) {
            fs.unlinkSync(DB_PATH)
            return reject(new Error(`下载失败，HTTP状态码: ${statusCode}`))
          }
          response.pipe(file)
          file.on("finish", () => {
            file.close()
            logger.debug(`✅ 数据库文件已下载: ${DB_PATH}`)
            resolve(true)
          })
        }
      )
      .on("error", (err) => {
        fs.unlinkSync(DB_PATH)
        logger.error(`❌ 下载失败: ${err.message}`, err)
        reject(err)
      })
  })
}

const checkDatabase = async () => {
  try {
    ensureDirExists()
    if (!fs.existsSync(DB_PATH)) {
      logger.debug("🔍 检测到数据库文件不存在")
      await downloadDatabase()
    } else {
      logger.debug(`📁 数据库文件已存在: ${DB_PATH}`)
    }
    return true
  } catch (err) {
    logger.error("❌ 数据库初始化前检查失败:", err)
    throw err
  }
}

const initializeDatabase = async () => {
  try {
    await checkDatabase()
    return new Promise((resolve, reject) => {
      db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          logger.error(`❌ 无法打开数据库连接: ${err.message}`, err)
          return reject(err)
        }

        logger.debug(`📊 数据库已打开: ${DB_PATH}`)

        db.run("PRAGMA foreign_keys = ON;")

        db.serialize(() => {
          db.run(`
            CREATE TABLE IF NOT EXISTS main (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              game TEXT NOT NULL,
              version TEXT NOT NULL,
              size TEXT NOT NULL
            );
          `)

          db.run(
            `
            CREATE TABLE IF NOT EXISTS pre (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              game TEXT NOT NULL,
              ver TEXT NOT NULL,
              oldver TEXT NOT NULL,
              size TEXT NOT NULL
            );
          `,
            (err) => {
              if (err) return reject(err)
              logger.debug("✅ 数据库表结构已准备就绪")
              logger.debug(`📊 数据库包含表: main, pre`)
              resolve(true)
            }
          )
        })
      })
    })
  } catch (err) {
    logger.error("❌ 数据库初始化失败:", err)
    throw err
  }
}

const storeMainSizeData = (game, version, size) => {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO main (game, version, size) VALUES (?, ?, ?)
    `,
      [game, version, size],
      function (err) {
        if (err) {
          logger.error(`❌ 存储main表数据失败: ${err.message}`, err)
          reject(err)
          return
        }
        logger.debug(`💾 存储到main表: ${game}-${version} | ${size}`)
        resolve(true)
      }
    )
  })
}

const storePreSizeData = (game, version, oldver, size) => {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO pre (game, ver, oldver, size) VALUES (?, ?, ?, ?)
    `,
      [game, version, oldver, size],
      function (err) {
        if (err) {
          logger.error(`❌ 存储pre表数据失败: ${err.message}`, err)
          reject(err)
          return
        }
        logger.debug(`💾 存储到pre表: ${game}-${version} | old: ${oldver} | size: ${size}`)
        resolve(true)
      }
    )
  })
}

/**
 * 获取main表数据
 * @param {string} game - 游戏ID
 * @param {string} [version] - 可选，指定版本号
 * @returns {Promise<Array>} 返回匹配的数据记录
 */
const getMainData = (game, version = null) => {
  return new Promise((resolve, reject) => {
    let sql = `SELECT * FROM main WHERE game = ?`
    const params = [game]

    if (version) {
      sql += ` AND version = ?`
      params.push(version)
    }

    db.all(sql, params, (err, rows) => {
      if (err) {
        logger.error(`❌ 查询main表失败: ${err.message}`, err)
        reject(err)
        return
      }
      resolve(rows)
    })
  })
}

/**
 * 获取pre表数据
 * @param {string} game - 游戏ID
 * @param {string} [ver] - 可选，指定预下载版本号
 * @returns {Promise<Array>} 返回匹配的数据记录
 */
const getPreData = (game, ver = null) => {
  return new Promise((resolve, reject) => {
    let sql = `SELECT * FROM pre WHERE game = ?`
    const params = [game]

    if (ver) {
      sql += ` AND ver = ?`
      params.push(ver)
    }

    db.all(sql, params, (err, rows) => {
      if (err) {
        logger.error(`❌ 查询pre表失败: ${err.message}`, err)
        reject(err)
        return
      }
      resolve(rows)
    })
  })
}
const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    if (!db) return resolve()

    db.close((err) => {
      if (err) {
        logger.error(`❌ 关闭数据库连接失败: ${err.message}`, err)
        reject(err)
        return
      }
      logger.info("🔌 数据库连接已关闭")
      resolve()
    })
  })
}

initializeDatabase()
  .then(() => {
    logger.debug("✅ 数据库模块已成功初始化")
  })
  .catch((err) => {
    logger.error("❌ 数据库初始化失败:", err)
  })

export default {
  storeMainSizeData,
  storePreSizeData,
  getMainData,
  getPreData,
  closeDatabase
}
