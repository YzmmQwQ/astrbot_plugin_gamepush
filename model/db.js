import path from "path"
import fs from "fs"
import { common } from "#GamePush.lib"
import { Sequelize, DataTypes } from "sequelize"
import { BotName, request } from "#GamePush.components"

class GamePushDB {
  REMOTE_VERSION_URL =
    "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin-version.json"
  DB_DOWNLOAD_URL = "https://cnb.cool/rainbowwarmth/resources/-/git/raw/main/GamePush-Plugin.db"

  constructor() {
    this.DB_DIR = path.join(
      process.cwd(),
      BotName === "Karin" ? "@karinjs/karin-plugin-gamepush/data" : "data"
    )
    this.DB_PATH = path.join(this.DB_DIR, "GamePush-Plugin.db")
    this.VERSION_JSON_PATH = path.join(this.DB_DIR, "GamePush-Plugin-version.json")

    this.initialized = false
    this.initializing = false
  }

  async ensureInitialized() {
    if (this.initialized) return true
    if (this.initializing) {
      return new Promise((resolve) => {
        const check = () => {
          if (this.initialized) resolve(true)
          else setTimeout(check, 100)
        }
        check()
      })
    }

    this.initializing = true
    try {
      await this.initialize()
      this.initialized = true
      return true
    } catch (err) {
      this.initializing = false
      throw err
    }
  }

  ensureDirExists() {
    if (!fs.existsSync(this.DB_DIR)) {
      fs.mkdirSync(this.DB_DIR, { recursive: true })
      logger.debug(`📂 创建数据库目录: ${this.DB_DIR}`)
    }
  }

  async fetchRemoteVersionInfo() {
    logger.debug("🌐 开始获取远程版本信息...")

    try {
      const res = await request.get(this.REMOTE_VERSION_URL, {
        responseType: "json",
        log: true
      })

      if (!res) {
        logger.error("❌ 获取远程版本信息失败：请求返回空")
        throw new Error("Failed to fetch remote version info")
      }

      logger.debug(`✅ 远程版本信息获取成功: ${res.version}`)
      return res
    } catch (err) {
      logger.error("❌ 获取远程版本信息失败", err)
      throw new Error("Failed to fetch remote version info")
    }
  }

  async downloadDatabase() {
    this.ensureDirExists()
    logger.debug("⬇️ 开始下载数据库文件...")

    try {
      const result = await common.downFile(this.DB_DOWNLOAD_URL, this.DB_PATH)

      if (result === true || (result && result.success === true)) {
        logger.debug(`✅ 数据库文件已下载: ${this.DB_PATH}`)
        return true
      } else if (result && result.success === false) {
        const errorMessage = result.message || "下载失败，未知原因"
        throw new Error(errorMessage)
      } else if (result === false) {
        throw new Error("下载失败，未提供具体原因")
      } else {
        throw new Error("下载失败，返回结果格式未知")
      }
    } catch (err) {
      if (fs.existsSync(this.DB_PATH)) fs.unlinkSync(this.DB_PATH)
      logger.error(`❌ 下载失败: ${err.message}`, err)
      throw err
    }
  }

  saveLocalVersionInfo(versionInfo) {
    try {
      fs.writeFileSync(this.VERSION_JSON_PATH, JSON.stringify(versionInfo, null, 2))
      logger.debug(`💾 本地版本信息已更新: ${versionInfo.version}`)
      return true
    } catch (err) {
      logger.error("❌ 保存本地版本信息失败", err)
      return false
    }
  }

  async checkDatabase() {
    try {
      this.ensureDirExists()

      const dbExists = fs.existsSync(this.DB_PATH)
      const versionFileExists = fs.existsSync(this.VERSION_JSON_PATH)

      let remoteVersionInfo
      try {
        remoteVersionInfo = await this.fetchRemoteVersionInfo()
      } catch (err) {
        logger.error("⚠️ 无法获取远程版本信息，跳过版本检查", err)
        if (dbExists) return true
      }

      let localVersionInfo = {}
      if (versionFileExists) {
        try {
          localVersionInfo = JSON.parse(fs.readFileSync(this.VERSION_JSON_PATH, "utf8"))
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
        await this.downloadDatabase()

        if (remoteVersionInfo) {
          this.saveLocalVersionInfo(remoteVersionInfo)
        } else if (versionFileExists) {
          const newVersion = localVersionInfo.version
            ? `${localVersionInfo.version}_local`
            : `v${new Date().toISOString().slice(0, 10)}`
          this.saveLocalVersionInfo({ ...localVersionInfo, version: newVersion })
        }
        return true
      }

      logger.debug(`📁 数据库文件已存在且版本一致: ${this.DB_PATH}`)
      return true
    } catch (err) {
      logger.error("❌ 数据库初始化前检查失败:", err)
      throw err
    }
  }

  initializeModels() {
    if (!this.sequelize) throw new Error("Sequelize not initialized")

    this.MainModel = this.sequelize.define(
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

    this.PreModel = this.sequelize.define(
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

  async initialize() {
    try {
      await this.checkDatabase()

      this.sequelize = new Sequelize({
        dialect: "sqlite",
        storage: this.DB_PATH,
        logging: false,
        define: {
          freezeTableName: true,
          timestamps: false
        },
        dialectOptions: {
          foreign_keys: "ON"
        }
      })

      await this.sequelize.authenticate()
      logger.debug(`📊 数据库连接成功: ${this.DB_PATH}`)

      this.initializeModels()
      await this.sequelize.sync()
      logger.debug("✅ 数据库模型同步完成")

      return true
    } catch (err) {
      logger.error("❌ 数据库初始化失败:", err)
      throw err
    }
  }

  async storeMainSizeData(game, version, size) {
    await this.ensureInitialized()

    try {
      const existing = await this.MainModel.findOne({
        where: { game, version }
      })

      if (existing) {
        logger.debug(`⏩ 跳过重复记录: ${game}-${version}`)
        return false
      }
      await this.MainModel.create({ game, version, size })
      logger.debug(`💾 存储到 main 表: ${game}-${version} | ${size}`)
      return true
    } catch (err) {
      logger.error(`❌ 存储 main 表数据失败: ${err.message}`, err)
      throw err
    }
  }

  async storePreSizeData(game, ver, oldver, size) {
    await this.ensureInitialized()

    try {
      const existing = await this.PreModel.findOne({
        where: { game, ver, oldver }
      })

      if (existing) {
        logger.debug(`⏩ 跳过重复预下载记录: ${game}-${ver} | ${oldver}`)
        return false
      }

      await this.PreModel.create({ game, ver, oldver, size })
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
  async getMainData(game, version = null) {
    await this.ensureInitialized()

    try {
      const where = { game }
      if (version) where.version = version

      const data = await this.MainModel.findAll({ where })
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
  async getPreData(game, ver = null) {
    await this.ensureInitialized()

    try {
      const where = { game }
      if (ver) where.ver = ver

      const data = await this.PreModel.findAll({ where })
      return data
    } catch (err) {
      logger.error(`❌ 查询 pre 表失败: ${err.message}`, err)
      throw err
    }
  }

  async close() {
    try {
      if (this.sequelize) {
        await this.sequelize.close()
        logger.info("🔌 数据库连接已关闭")
      }
    } catch (err) {
      logger.error(`❌ 关闭数据库连接失败: ${err.message}`, err)
      throw err
    }
  }
}

const dbInstance = new GamePushDB()

const dbPromise = dbInstance
  .initialize()
  .then(() => {
    logger.debug("✅ 数据库模块已成功初始化")
    return dbInstance
  })
  .catch((err) => {
    logger.error("❌ 数据库初始化失败:", err)
    throw err
  })

export default dbPromise
