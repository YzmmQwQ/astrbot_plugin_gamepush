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
