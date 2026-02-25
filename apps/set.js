import fs from "fs"
import { plugin, redis, common } from "#GamePush.lib"
import { GAME_CONFIG, db, getGameName, getRedisKeys } from "#GamePush.model"

export class Set extends plugin {
  constructor() {
    super({
      name: "[GamePush-Plugin]主人功能",
      dsc: "[GamePush-Plugin]主人功能",
      event: "message",
      priority: 100,
      rule: [
        {
          reg: buildReg("删除rediskey"),
          fnc: "delkey",
          permission: "master"
        },
        {
          reg: buildReg("删除预下载rediskey"),
          fnc: "delPrekey",
          permission: "master"
        },
        {
          reg: buildReg("设置rediskey\\s*(.+)"),
          fnc: "setkey",
          permission: "master"
        },
        {
          reg: buildReg("设置预下载rediskey\\s*(.+)"),
          fnc: "setPrekey",
          permission: "master"
        },
        {
          reg: "#更新游戏版本数据",
          fnc: "updatedb",
          permission: "master"
        }
      ]
    })
  }

  /**
   * 根据消息匹配游戏
   */
  getMatchGame(msg) {
    for (const [gameId, config] of Object.entries(GAME_CONFIG)) {
      const regex = new RegExp(config.reg)
      if (regex.test(msg)) return gameId
    }
    if (/^#*(删除|设置)(预下载)?rediskey/.test(msg)) {
      return "ys"
    }
    return null
  }

  async delkey() {
    try {
      const gameId = this.getMatchGame(this.e.msg)
      if (!gameId) return this.e.reply("未找到匹配的游戏类型")

      const keys = getRedisKeys(gameId)
      if (!keys?.main) return this.e.reply("配置中未找到主RedisKey")

      await redis.del(keys.main)
      this.e.reply(`${getGameName(gameId)} RedisKey已删除`)
    } catch (error) {
      this.e.reply(`删除失败: ${error.message}`)
    }
  }

  async delPrekey() {
    try {
      const gameId = this.getMatchGame(this.e.msg)
      if (!gameId) return this.e.reply("未找到匹配的游戏类型")

      const keys = getRedisKeys(gameId)
      if (!keys?.pre) return this.e.reply("配置中未找到预下载RedisKey")

      await redis.del(keys.pre)
      this.e.reply(`${getGameName(gameId)} 预下载RedisKey已删除`)
    } catch (error) {
      this.e.reply(`删除失败: ${error.message}`)
    }
  }

  async setkey() {
    try {
      const gameId = this.getMatchGame(this.e.msg)
      if (!gameId) return this.e.reply("未找到匹配的游戏类型")

      const keys = getRedisKeys(gameId)
      if (!keys?.main) return this.e.reply("配置中未找到主RedisKey")

      const [, value] = this.e.msg.match(/设置rediskey\s*(.+)/i) || []
      if (!value) return this.e.reply("请提供要设置的值")

      await redis.set(keys.main, value.trim())
      this.e.reply(`${getGameName(gameId)} RedisKey已设置为: ${value}`)
    } catch (error) {
      this.e.reply(`设置失败: ${error.message}`)
    }
  }

  async setPrekey() {
    try {
      const gameId = this.getMatchGame(this.e.msg)
      if (!gameId) return this.e.reply("未找到匹配的游戏类型")

      const keys = getRedisKeys(gameId)
      if (!keys?.pre) return this.e.reply("配置中未找到预下载RedisKey")

      const [, value] = this.e.msg.match(/设置预下载rediskey\s*(.+)/i) || []
      if (!value) return this.e.reply("请提供要设置的值")

      await redis.set(keys.pre, value.trim())
      this.e.reply(`${getGameName(gameId)} 预下载RedisKey已设置为: ${value}`)
    } catch (error) {
      this.e.reply(`设置失败: ${error.message}`)
    }
  }

  async updatedb() {
    const DB_DOWNLOAD_URL = (await db).DB_DOWNLOAD_URL
    const DB_PATH = (await db).DB_PATH
    const VERSION_JSON_PATH = (await db).VERSION_JSON_PATH
    await this.e.reply(`正在更新版本数据，请稍候...`)
    await common.downFile(DB_DOWNLOAD_URL, DB_PATH)
    const localInfo = JSON.parse(fs.readFileSync(VERSION_JSON_PATH, "utf8") || "{}")
    await this.e.reply(`版本数据更新完成！, 当前数据版本：${localInfo.version || "未知"}`)
  }
}

/**
 * 构建正则：支持所有游戏别名
 */
function buildReg(action) {
  const allPatterns = Object.values(GAME_CONFIG)
    .map((config) => config.reg)
    .join("|")
  return new RegExp(`^#*(?:(?:${allPatterns})\\s*)?${action}$`)
}
