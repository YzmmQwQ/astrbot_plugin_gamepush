import { Sequelize, DataTypes } from "sequelize"
import path from "path"
import fs from "fs"
import https from "https"
import { BotName } from "#GamePush.components"

const DB_DIR = path.join(
  process.cwd(),
  BotName === "Karin" ? "@karinjs/karin-plugin-gamepush/data" : "data"
)
const DB_PATH = path.join(DB_DIR, "GamePush-Plugin.db")
const VERSION_JSON_PATH = path.join(DB_DIR, "GamePush-Plugin-version.json")
const REMOTE_VERSION_URL =
  "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin-version.json"

const ensureDirExists = () => {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
    logger.debug(`📂 创建数据库目录: ${DB_DIR}`)
  }
}

const fetchRemoteVersionInfo = async () => {
  return new Promise((resolve, reject) => {
    logger.debug("🌐 开始获取远程版本信息...")
    https
      .get(REMOTE_VERSION_URL, (response) => {
        let data = ""

        response.on("data", (chunk) => {
          data += chunk
        })

        response.on("end", () => {
          try {
            const jsonData = JSON.parse(data)
            logger.debug(`✅ 远程版本信息获取成功: ${jsonData.version}`)
            resolve(jsonData)
          } catch (e) {
            logger.error("❌ 远程版本信息解析失败", e)
            reject(new Error("Failed to parse remote version info"))
          }
        })
      })
      .on("error", (err) => {
        logger.error("❌ 获取远程版本信息失败", err)
        reject(err)
      })
  })
}

const downloadDatabase = async () => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(DB_PATH)
    logger.debug("⬇️ 开始下载数据库文件...")

    https
      .get(
        "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin.db",
        (response) => {
          const { statusCode } = response

          if (statusCode !== 200) {
            if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)
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
        if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)
        logger.error(`❌ 下载失败: ${err.message}`, err)
        reject(err)
      })
  })
}

const saveLocalVersionInfo = (versionInfo) => {
  try {
    fs.writeFileSync(VERSION_JSON_PATH, JSON.stringify(versionInfo, null, 2))
    logger.debug(`💾 本地版本信息已更新: ${versionInfo.version}`)
    return true
  } catch (err) {
    logger.error("❌ 保存本地版本信息失败", err)
    return false
  }
}

const checkDatabase = async () => {
  try {
    ensureDirExists()

    const dbExists = fs.existsSync(DB_PATH)
    const versionFileExists = fs.existsSync(VERSION_JSON_PATH)

    let remoteVersionInfo
    try {
      remoteVersionInfo = await fetchRemoteVersionInfo()
    } catch (err) {
      logger.error("⚠️ 无法获取远程版本信息，跳过版本检查", err)
      if (dbExists) return true
    }

    let localVersionInfo = {}
    if (versionFileExists) {
      try {
        localVersionInfo = JSON.parse(fs.readFileSync(VERSION_JSON_PATH, "utf8"))
        logger.debug(`📄 本地版本信息: ${localVersionInfo.version || "不存在"}`)
      } catch (err) {
        logger.error("❌ 解析本地版本信息失败", err)
        localVersionInfo = {}
      }
    }

    let needDownload = false
    if (!dbExists) {
      logger.debug("🔍 检测到数据库文件不存在")
      needDownload = true
    } else if (remoteVersionInfo && localVersionInfo.version !== remoteVersionInfo.version) {
      logger.debug(
        `🔍 检测到版本不一致 (本地: ${localVersionInfo.version || "无"}, 远程: ${remoteVersionInfo.version})`
      )
      needDownload = true
    }

    if (needDownload) {
      logger.debug("⏫ 开始更新数据库...")
      await downloadDatabase()

      if (remoteVersionInfo) {
        saveLocalVersionInfo(remoteVersionInfo)
      } else if (versionFileExists) {
        const newVersion = localVersionInfo.version
          ? `${localVersionInfo.version}_local`
          : `v${new Date().toISOString().slice(0, 10)}`
        saveLocalVersionInfo({ ...localVersionInfo, version: newVersion })
      }
      return true
    }

    logger.debug(`📁 数据库文件已存在且版本一致: ${DB_PATH}`)
    return true
  } catch (err) {
    logger.error("❌ 数据库初始化前检查失败:", err)
    throw err
  }
}

let sequelize
let MainModel
let PreModel

const initializeModels = () => {
  MainModel = sequelize.define(
    "main",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      game: {
        type: DataTypes.STRING,
        allowNull: false
      },
      version: {
        type: DataTypes.STRING,
        allowNull: false
      },
      size: {
        type: DataTypes.STRING,
        allowNull: false
      }
    },
    {
      tableName: "main",
      timestamps: false
    }
  )

  PreModel = sequelize.define(
    "pre",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      game: {
        type: DataTypes.STRING,
        allowNull: false
      },
      ver: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "ver"
      },
      oldver: {
        type: DataTypes.STRING,
        allowNull: false
      },
      size: {
        type: DataTypes.STRING,
        allowNull: false
      }
    },
    {
      tableName: "pre",
      timestamps: false,
      underscored: false
    }
  )
}

const initializeDatabase = async () => {
  try {
    await checkDatabase()

    sequelize = new Sequelize({
      dialect: "sqlite",
      storage: DB_PATH,
      logging: false,
      define: {
        freezeTableName: true,
        timestamps: false
      },
      dialectOptions: {
        foreign_keys: "ON"
      }
    })

    await sequelize.authenticate()
    logger.debug(`📊 数据库连接成功: ${DB_PATH}`)

    initializeModels()
    await sequelize.sync()
    logger.debug("✅ 数据库模型同步完成")

    return true
  } catch (err) {
    logger.error("❌ 数据库初始化失败:", err)
    throw err
  }
}

const storeMainSizeData = async (game, version, size) => {
  try {
    const existing = await MainModel.findOne({
      where: { game, version }
    })

    if (existing) {
      logger.debug(`⏩ 跳过重复记录: ${game}-${version}`)
      return false
    }
    await MainModel.create({ game, version, size })
    logger.debug(`💾 存储到 main 表: ${game}-${version} | ${size}`)
    return true
  } catch (err) {
    logger.error(`❌ 存储 main 表数据失败: ${err.message}`, err)
    throw err
  }
}

const storePreSizeData = async (game, ver, oldver, size) => {
  try {
    const existing = await PreModel.findOne({
      where: { game, ver, oldver }
    })

    if (existing) {
      logger.debug(`⏩ 跳过重复预下载记录: ${game}-${ver} | ${oldver}`)
      return false
    }

    await PreModel.create({ game, ver, oldver, size })
    logger.debug(`💾 存储到 pre 表: ${game}-${ver} | old: ${oldver} | size: ${size}`)
    return true
  } catch (err) {
    logger.error(`❌ 存储 pre 表数据失败: ${err.message}`, err)
    throw err
  }
}

/**
 * 获取main表数据
 * @param {string} game - 游戏ID
 * @param {string} [version] - 可选，指定版本号
 * @returns {Promise<Array>} 返回匹配的数据记录
 */
const getMainData = async (game, version = null) => {
  try {
    const where = { game }
    if (version) where.version = version

    const data = await MainModel.findAll({ where })
    return data
  } catch (err) {
    logger.error(`❌ 查询 main 表失败: ${err.message}`, err)
    throw err
  }
}

/**
 * 获取pre表数据
 * @param {string} game - 游戏ID
 * @param {string} [ver] - 可选，指定预下载版本号
 * @returns {Promise<Array>} 返回匹配的数据记录
 */
const getPreData = async (game, ver = null) => {
  try {
    const where = { game }
    if (ver) where.ver = ver

    const data = await PreModel.findAll({ where })
    return data
  } catch (err) {
    logger.error(`❌ 查询 pre 表失败: ${err.message}`, err)
    throw err
  }
}

const closeDatabase = async () => {
  try {
    if (sequelize) {
      await sequelize.close()
      logger.info("🔌 数据库连接已关闭")
    }
  } catch (err) {
    logger.error(`❌ 关闭数据库连接失败: ${err.message}`, err)
    throw err
  }
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
