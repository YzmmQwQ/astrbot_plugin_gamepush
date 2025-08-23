import { plugin, redis } from "#GamePush.lib"
import { getRedisKeys } from "#GamePush.model"

// 各游戏匹配规则
const gameRegexMap = {
  ys: /(ys|YS|原神)/,
  sr: /(\*|星铁|星轨|穹轨|星穹|崩铁|星穹铁道|崩坏星穹铁道|铁道)/,
  zzz: /(%|％|绝区零|zzz|ZZZ|绝区)/,
  bh3: /(!|！|崩坏三|崩坏3|崩三|崩3|bbb|三崩子)/,
  ww:  /(~|～|鸣潮|ww|WW|mc)/
}

// 游戏信息
const gameInfoMap = {
  ys:  { id: "ys",  display: "原神" },
  sr:  { id: "sr",  display: "星铁" },
  zzz: { id: "zzz", display: "绝区零" },
  bh3: { id: "bh3", display: "崩坏3" },
  ww:  { id: "ww",  display: "鸣潮" }
}

export class Set extends plugin {
  constructor() {
    super({
      name: "[GamePush-Plugin]Redis管理",
      dsc: "Redis键值管理",
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
        }
      ]
    })
  }

  /**
   * 根据消息匹配游戏
   */
  getMatchGame(msg) {
    for (const [id, regex] of Object.entries(gameRegexMap)) {
      if (regex.test(msg)) return gameInfoMap[id]
    }
    // 如果没有匹配到游戏别名，但命令是设置rediskey，则默认ys
    if (/^#*(删除|设置)(预下载)?rediskey/.test(msg)) {
      return gameInfoMap["ys"]
    }
    return null
  }

  async delkey() {
    try {
      const match = this.getMatchGame(this.e.msg)
      if (!match) return this.e.reply("未找到匹配的游戏类型")

      const keys = getRedisKeys(match.id)
      if (!keys?.main) return this.e.reply("配置中未找到主RedisKey")

      await redis.del(keys.main)
      this.e.reply(`${match.display} RedisKey已删除`)
    } catch (error) {
      this.e.reply(`删除失败: ${error.message}`)
    }
  }

  async delPrekey() {
    try {
      const match = this.getMatchGame(this.e.msg)
      if (!match) return this.e.reply("未找到匹配的游戏类型")

      const keys = getRedisKeys(match.id)
      if (!keys?.pre) return this.e.reply("配置中未找到预下载RedisKey")

      await redis.del(keys.pre)
      this.e.reply(`${match.display} 预下载RedisKey已删除`)
    } catch (error) {
      this.e.reply(`删除失败: ${error.message}`)
    }
  }

  async setkey() {
    try {
      const match = this.getMatchGame(this.e.msg)
      if (!match) return this.e.reply("未找到匹配的游戏类型")

      const keys = getRedisKeys(match.id)
      if (!keys?.main) return this.e.reply("配置中未找到主RedisKey")

      // 改为安全正则，只匹配设置rediskey后的值
      const [, value] = this.e.msg.match(/设置rediskey\s*(.+)/i) || []
      if (!value) return this.e.reply("请提供要设置的值")

      await redis.set(keys.main, value.trim())
      this.e.reply(`${match.display} RedisKey已设置为: ${value}`)
    } catch (error) {
      this.e.reply(`设置失败: ${error.message}`)
    }
  }

  async setPrekey() {
    try {
      const match = this.getMatchGame(this.e.msg)
      if (!match) return this.e.reply("未找到匹配的游戏类型")

      const keys = getRedisKeys(match.id)
      if (!keys?.pre) return this.e.reply("配置中未找到预下载RedisKey")

      // 改为安全正则，只匹配设置预下载rediskey后的值
      const [, value] = this.e.msg.match(/设置预下载rediskey\s*(.+)/i) || []
      if (!value) return this.e.reply("请提供要设置的值")

      await redis.set(keys.pre, value.trim())
      this.e.reply(`${match.display} 预下载RedisKey已设置为: ${value}`)
    } catch (error) {
      this.e.reply(`设置失败: ${error.message}`)
    }
  }
}

/**
 * 构建正则：支持所有游戏别名
 */
function buildReg(action) {
  const allPatterns = Object.values(gameRegexMap).map(r => r.source).join("|")
  return new RegExp(`^#*(?:(?:${allPatterns})\\s*)?${action}$`)
}
