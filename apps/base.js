import { cfg } from "#GamePush.components"
import { plugin, redis, makeForwardMsg } from "#GamePush.lib"
import { db, api, getRedisKeys } from "#GamePush.model"

/**
 * 通用游戏应用基类
 * 抽象各个游戏应用的重复逻辑，提供统一的接口和实现
 */
export class GamePushBase extends plugin {
  /**
   * 构造函数
   * @param {Object} options - 插件配置
   * @param {string} options.gameId - 游戏ID（如ys、sr、zzz等）
   * @param {string} options.gameName - 游戏名称（如原神、星铁等）
   * @param {string} options.regPattern - 正则表达式匹配模式
   * @param {Array} options.extraRules - 额外的规则配置
   */
  constructor(options) {
    const { gameId, gameName, regPattern, extraRules = [], priority = 100 } = options
    super({
      name: `[GamePush-Plugin]${gameName}功能`,
      dsc: `${gameName}版本更新及预下载推送`,
      event: "message",
      priority: priority,
      rule: [
        {
          reg: `^#*${regPattern}?版本监控$`,
          fnc: `${gameId}Check`,
          permission: "master"
        },
        {
          reg: `^#*${regPattern}?(开启|关闭)版本推送$`,
          fnc: `${gameId}PushSet`,
          permission: "master"
        },
        {
          reg: `^#*${regPattern}?当前版本$`,
          fnc: `${gameId}Ver`
        },
        {
          reg: `^#*${regPattern}?版本数据(.*)$`,
          fnc: `${gameId}VersionData`
        },
        ...extraRules
      ]
    })

    this.gameId = gameId
    this.gameName = gameName
    this.regPattern = regPattern

    this.task = {
      cron: cfg.getGameConfig(gameId).cron || "0 0/5 * * * *",
      name: `[GamePush-Plugin] ${gameName}版本监控`,
      fnc: () => api.autoCheck(gameId),
      log: cfg.getGameConfig(gameId).log
    }

    // 绑定方法到实例
    this[`${gameId}Check`] = this.versionCheck.bind(this)
    this[`${gameId}PushSet`] = this.pushSet.bind(this)
    this[`${gameId}Ver`] = this.currentVersion.bind(this)
    this[`${gameId}VersionData`] = this.versionData.bind(this)
  }

  /**
   * 版本检查方法
   */
  async versionCheck() {
    await api.checkVersion(true, this.gameId)
    return this.reply("✅ 已执行手动检查", true)
  }

  /**
   * 推送设置方法
   */
  async pushSet(e) {
    if (!e.isGroup) {
      return this.reply("❌ 该功能仅限群聊中使用", true)
    }

    const groupId = String(e.group_id)
    const botId = String(e.self_id || e.selfId)
    const isEnable = e.msg.includes("开启")

    if (isEnable) {
      cfg.addPushGroup(this.gameId, botId, groupId)
    } else {
      cfg.removePushGroup(this.gameId, botId, groupId)
    }

    const action = isEnable
      ? `已添加本群到推送列表（ID：${groupId}）`
      : `已移除本群推送（ID：${groupId}）`
    return this.reply(`✅ 已${isEnable ? "开启" : "关闭"}${this.gameName}版本推送，${action}`, true)
  }

  /**
   * 当前版本查询方法
   */
  async currentVersion() {
    const { main, pre } = getRedisKeys(this.gameId)
    const [mainVer, preVer] = await Promise.all([redis.get(main), redis.get(pre)])

    const msg = [
      `📌 ${this.gameName}当前版本信息`,
      `正式版本：${mainVer || "未知"}`,
      `预下载版本：${preVer || "未开启"}`
    ].join("\n")

    return this.reply(msg, true)
  }

  /**
   * 版本数据查询方法
   */
  async versionData() {
    const input = this.e.msg.replace(new RegExp(`#*${this.regPattern}?版本数据`, "i"), "").trim()
    if (!input) return this.showAllVersionData()
    return this.showSpecificVersionData(input)
  }

  /**
   * 显示所有版本数据
   */
  async showAllVersionData() {
    const mainVersions = await (await db).getMainData(this.gameId)
    const preVersions = await (await db).getPreData(this.gameId)

    if (
      (!mainVersions || mainVersions.length === 0) &&
      (!preVersions || preVersions.length === 0)
    ) {
      return this.reply(`暂无${this.gameName}版本数据`, true)
    }

    let message = `📊 ${this.gameName}历史版本数据：\n`

    if (mainVersions && mainVersions.length > 0) {
      message += "\n📦 正式版本：\n"
      message += mainVersions
        .map((record, index) => `${index + 1}. 版本号：${record.version}，占用大小：${record.size}`)
        .join("\n")
    }

    if (preVersions && preVersions.length > 0) {
      message += "\n\n🎁 预下载版本：\n"
      message += preVersions
        .map(
          (record, index) =>
            `${index + 1}. 版本号：${record.ver}，旧版本：${record.oldver}，更新大小：${record.size}`
        )
        .join("\n")
    }

    message += "\n\n📝 提示：发送 #版本数据 [版本号] 查看详细数据"

    return this.reply(await makeForwardMsg(this.e, [message]))
  }

  /**
   * 显示指定版本数据
   * @param {string} version - 版本号
   */
  async showSpecificVersionData(version) {
    const mainVersion = await (await db).getMainData(this.gameId, version)
    const preVersion = await (await db).getPreData(this.gameId, version)

    if ((!mainVersion || mainVersion.length === 0) && (!preVersion || preVersion.length === 0)) {
      return this.reply(`未找到${this.gameName}版本 ${version} 的数据`, true)
    }

    let message = `📊 ${this.gameName}版本 ${version} 数据：\n`

    if (mainVersion && mainVersion.length > 0) {
      const record = mainVersion[0]
      message += `\n📦 正式版本：\n`
      message += `版本号：${record.version}\n`
      message += `占用大小：${record.size}\n`
    }

    if (preVersion && preVersion.length > 0) {
      const record = preVersion[0]
      message += `\n\n🎁 预下载版本：\n`
      message += `版本号：${record.ver}\n`
      message += `旧版本：${record.oldver}\n`
      message += `更新大小：${record.size}\n`
    }

    return this.reply(message, true)
  }
}
