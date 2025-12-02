import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { gameIds, getGameName } from "#GamePush.model"
import { BotName, pluginName } from "#GamePush.components"

const CONFIG_DIR = path.join(
  process.cwd(),
  BotName === "Karin" ? "@karinjs/karin-plugin-gamepush/config" : "data"
)
const CONFIG_PATH = path.join(CONFIG_DIR, "GamePush-Plugin.yaml")
const DEFAULT_CRON = "0 0/5 * * * *"

class Config {
  configCache = {}
  watcher = null

  constructor() {
    this.init()
  }

  /** 初始化配置管理器 */
  init() {
    try {
      if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
      if (!fs.existsSync(CONFIG_PATH)) this.saveConfig(this.getDefaultConfig())
      this.loadConfig()
      this.setupWatcher()
    } catch (err) {
      logger.error(`[${pluginName}] 配置初始化失败`, err)
      this.configCache = this.getDefaultConfig()
    }
  }

  /** 默认配置 */
  getDefaultConfig() {
    return Object.fromEntries(
      gameIds.map((id) => [
        id,
        {
          enable: true,
          log: false,
          cron: DEFAULT_CRON,
          pushGroups: [],
          pushChangeType: "1",
          html: "default"
        }
      ])
    )
  }

  /** 格式化 pushGroups */
  static formatPushGroups(list = []) {
    return list
      .map((item) => {
        if (typeof item === "string") {
          const [botId, groupId] = item.split(":")
          return botId && groupId ? { botId, groupId } : null
        }
        return item && typeof item === "object" ? item : null
      })
      .filter(Boolean)
  }

  /** 序列化 pushGroups（保存时用） */
  static serializePushGroups(list = []) {
    return list.map((item) => (typeof item === "string" ? item : `${item.botId}:${item.groupId}`))
  }

  /** 加载配置 */
  loadConfig() {
    try {
      const raw = fs.existsSync(CONFIG_PATH) ? YAML.parse(fs.readFileSync(CONFIG_PATH, "utf8")) : {}
      this.configCache = this.getDefaultConfig()

      for (const gameId of gameIds) {
        if (raw[gameId]) {
          const cfg = raw[gameId]
          this.configCache[gameId] = {
            enable: !!cfg.enable,
            log: !!cfg.log,
            cron: cfg.cron || DEFAULT_CRON,
            pushGroups: Config.formatPushGroups(cfg.pushGroups),
            pushChangeType: cfg.pushChangeType || "1",
            html: cfg.html || "default"
          }
        }
      }
    } catch (err) {
      logger.error(`[${pluginName}] 配置加载失败`, err)
      this.configCache = this.getDefaultConfig()
    }
  }

  /** 保存配置 */
  saveConfig(newConfig) {
    try {
      const saveData = Object.fromEntries(
        Object.entries(newConfig).map(([gameId, cfg]) => [
          gameId,
          {
            enable: cfg.enable,
            log: cfg.log,
            cron: cfg.cron,
            pushGroups: Config.serializePushGroups(cfg.pushGroups),
            pushChangeType: cfg.pushChangeType,
            html: cfg.html
          }
        ])
      )
      fs.writeFileSync(CONFIG_PATH, YAML.stringify(saveData, { indent: 2 }), "utf8")
      this.configCache = newConfig
      return true
    } catch (err) {
      logger.error(`[${pluginName}] 配置保存失败`, err)
      return false
    }
  }

  /** 文件监视器 */
  async setupWatcher() {
    if (this.watcher) return
    try {
      const chokidar = await import("chokidar")
      this.watcher = chokidar.watch(CONFIG_PATH).on("change", () => {
        logger.info(`[${pluginName}] 配置变更，重新加载`)
        this.loadConfig()
      })
    } catch (err) {
      logger.error(`[${pluginName}] 设置配置监视器失败`, err)
    }
  }

  /** 获取单个游戏配置 */
  getGameConfig(game) {
    return this.configCache[game] || this.getDefaultConfig()[game]
  }

  /** 更新单个游戏配置 */
  updateGameConfig(game, updater) {
    const config = structuredClone(this.configCache)
    config[game] ||= this.getDefaultConfig()[game]
    updater(config[game])
    this.saveConfig(config)
  }

  /** 添加推送群（避免重复） */
  addPushGroup(gameId, botId, groupId) {
    this.updateGameConfig(gameId, (cfg) => {
      const exists = cfg.pushGroups.some((g) => g.botId === botId && g.groupId === groupId)
      if (!exists) {
        cfg.pushGroups.push({ botId, groupId })
        logger.debug(
          `[${pluginName}] 游戏${getGameName(gameId)} 添加机器人: ${botId} 群聊：${groupId} 推送配置`
        )
      } else {
        logger.debug(
          `[${pluginName}] 游戏${getGameName(gameId)} 存在机器人: ${botId} 群聊：${groupId} 推送配置，跳过重复写入`
        )
      }
    })
  }

  /** 移除推送群 */
  removePushGroup(gameId, botId, groupId) {
    this.updateGameConfig(gameId, (cfg) => {
      const before = cfg.pushGroups.length
      cfg.pushGroups = cfg.pushGroups.filter((g) => !(g.botId === botId && g.groupId === groupId))
      if (cfg.pushGroups.length < before) {
        logger.debug(
          `[${pluginName}] 游戏${getGameName(gameId)} 移除机器人: ${botId} 群聊：${groupId} 推送配置`
        )
      } else {
        logger.debug(
          `[${pluginName}] 游戏${getGameName(gameId)} 不存在机器人: ${botId} 群聊：${groupId} 推送配置，无需移除`
        )
      }
    })
  }

  /** 获取前端配置 */
  getFrontendConfig() {
    if (BotName !== "Karin") return this.configCache

    logger.debug("当前配置缓存:", JSON.stringify(this.configCache, null, 2))
    const frontendConfig = {}

    for (const gameId of gameIds) {
      const cfg = this.getGameConfig(gameId)
      frontendConfig[gameId] = [
        {
          enable: cfg.enable,
          log: false,
          cron: cfg.cron || DEFAULT_CRON,
          pushGroups: Config.formatPushGroups(cfg.pushGroups),
          pushChangeType: cfg.pushChangeType || "1",
          html: cfg.html || "default"
        }
      ]
    }

    logger.debug(`[${pluginName}] 生成的前端配置:`, JSON.stringify(frontendConfig, null, 2))
    return frontendConfig
  }

  /** 处理前端传入配置（兼容 Yunzai / Karin） */
  parseFrontendConfig(data) {
    let isYunzai = gameIds.some((id) => data[`${id}.enable`] !== undefined)
    const saveData = {}
    for (const gameId of gameIds) {
      if (isYunzai) {
        saveData[gameId] = {
          enable: Boolean(data[`${gameId}.enable`] ?? true),
          log: Boolean(data[`${gameId}.log`] ?? false),
          cron: data[`${gameId}.cron`] || DEFAULT_CRON,
          pushGroups: Config.formatPushGroups(data[`${gameId}.pushGroups`] || []),
          pushChangeType: data[`${gameId}.pushChangeType`] || "1",
          html: data[`${gameId}.html`] || "default"
        }
      } else {
        const cfg = (data[gameId] || [])[0] || {}
        saveData[gameId] = {
          enable: Boolean(cfg.enable ?? true),
          log: Boolean(cfg.log ?? true),
          cron: cfg.cron || DEFAULT_CRON,
          pushGroups: Config.formatPushGroups(cfg.pushGroups || []),
          pushChangeType: cfg.pushChangeType || "1",
          html: cfg.html || "default"
        }
      }
    }
    return saveData
  }

  /** 从前端保存配置 */
  saveFromFrontend(data) {
    try {
      logger.debug(`[${pluginName}] 接收到的原始数据:`, JSON.stringify(data, null, 2))
      let saveData = this.parseFrontendConfig(data)

      for (const gameId of gameIds) {
        saveData[gameId].pushGroups = [
          ...new Map(
            saveData[gameId].pushGroups.map((g) => [`${g.botId}:${g.groupId}`, g])
          ).values()
        ]
      }

      logger.debug(`[${pluginName}] 处理后的配置数据:`, JSON.stringify(saveData, null, 2))

      if (this.saveConfig(saveData)) {
        logger.info(`[${pluginName}] 配置保存成功`)
        return { success: true, message: "游戏推送配置已保存！" }
      }
      return { success: false, message: "保存配置文件时出错" }
    } catch (err) {
      logger.error(`[${pluginName}] 前端配置保存失败`, err)
      return { success: false, message: `配置保存失败: ${err.message}` }
    }
  }
}

export default new Config()
