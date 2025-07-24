import { cfg } from "#GamePush.components"
import { plugin, redis, makeForwardMsg } from "#GamePush.lib"
import { db, api, download, getRedisKeys } from "#GamePush.model"

const bh3Reg = "(!|！|崩坏三|崩坏3|崩三|崩3|bbb|三崩子)"
export class bh3Push extends plugin {
  constructor() {
    super({
      name: "[GamePush-Plugin]崩坏3功能",
      dsc: "崩坏3版本更新及预下载推送",
      event: "message",
      priority: 7000,
      rule: [
        {
          reg: `^#*${bh3Reg}版本监控$`,
          fnc: "bh3Check",
          permission: "master"
        },
        {
          reg: `^#*${bh3Reg}(开启|关闭)版本推送$`,
          fnc: "bh3PushSet",
          permission: "master"
        },
        {
          reg: `^#*${bh3Reg}当前版本$`,
          fnc: "bh3Ver",
          permission: "all"
        },
        {
          reg: `^#*${bh3Reg}获取下载链接$`,
          fnc: "bh3DownloadLinks"
        },
        {
          reg: `^#*${bh3Reg}获取预下载链接$`,
          fnc: "bh3PreDownloadLinks"
        },
        {
          reg: `^#*${bh3Reg}版本数据(.*)$`,
          fnc: "bh3VersionData"
        }
      ]
    })

    this.task = {
      name: "[GamePush-Plugin] 崩坏3版本监控",
      cron: cfg.getGameConfig("bh3").cron || "0 0/5 * * * *",
      fnc: () => api.autoCheck("bh3"),
      log: cfg.getGameConfig("bh3").log
    }
  }

  /**
   * 手动检查崩坏3版本
   */
  async bh3Check() {
    await api.checkVersion(true, "bh3")
    return this.reply("✅ 已执行手动检查", true)
  }

  /**
   * 设置崩坏3版本推送
   */
  async bh3PushSet() {
    const e = this.e
    const groupId = String(e.group_id)
    if (!e.isGroup) {
      return this.reply("❌ 该功能仅限群聊中使用", true)
    }

    const isEnable = e.msg.includes("开启")
    const botid = e.self_id || e.selfId
    const groupIdentifier = `${botid}:${groupId}`

    cfg.updateGameConfig("bh3", (config) => {
      config.pushGroups = config.pushGroups || []

      if (isEnable) {
        config.pushGroups.push(groupIdentifier)
      }

      config.enable = isEnable
      config.log = config.log || false
      config.cron = config.cron || "0 0/5 * * * *"
      config.pushChangeType = config.pushChangeType || "1"
    })

    const action = isEnable ? `已添加本群到推送列表（ID：${groupIdentifier}）` : "已移除本群推送"
    return this.reply(`✅ 已${isEnable ? "开启" : "关闭"}崩坏3版本推送，${action}`, true)
  }

  /**
   * 查询崩坏3当前版本
   */
  async bh3Ver() {
    const { main, pre } = getRedisKeys("bh3")
    const [mainVer, preVer] = await Promise.all([redis.get(main), redis.get(pre)])

    const msg = [
      "📌 崩坏3当前版本信息",
      `正式版本：${mainVer || "未知"}`,
      `预下载版本：${preVer || "未开启"}`
    ].join("\n")

    this.reply(msg)
  }

  /**
   * 获取崩坏3下载链接
   */
  async bh3DownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("bh3", "main")
      if (!data) return this.reply("当前没有可用的正式版本下载", true)

      const { msg, client } = download.formatDownloadInfo("bh3", data, "main", patch)
      return this.reply(await makeForwardMsg(e, [msg, client]))
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }

  /**
   * 获取崩坏3预下载链接
   */
  async bh3PreDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("bh3", "pre")
      if (!data) return this.reply("🚫 崩坏3当前未开放预下载", true)

      const { msg, client } = download.formatDownloadInfo("bh3", data, "pre", patch)
      return this.reply(await makeForwardMsg(e, [msg, client]))
    } catch (err) {
      return this.reply(`❌ 预下载获取失败：${err.message}`, true)
    }
  }

  async bh3VersionData() {
    const input = this.e.msg.replace(new RegExp(`#*${bh3Reg}版本数据`, "i"), "").trim()
    if (!input) return this.showAllVersionData()
    return this.showSpecificVersionData(input)
  }

  async showAllVersionData(e) {
    const mainVersions = await db.getMainData("bh3")
    const preVersions = await db.getPreData("bh3")

    if ((!mainVersions || mainVersions.length === 0) && (!preVersions || preVersions.length === 0))
      return this.reply("暂无崩坏3版本数据", true)

    let message = "📊 崩坏3历史版本数据：\n"

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

    message += "\n\n📝 提示：发送 #崩三版本数据 [版本号] 查看详细数据"
    return this.reply(await makeForwardMsg(this.e, [message]))
  }

  /**
   * 显示指定版本数据
   * @param {string} version - 版本号
   */
  async showSpecificVersionData(version) {
    const mainVersion = await db.getMainData("bh3", version)
    const preVersion = await db.getPreData("bh3", version)

    if ((!mainVersion || mainVersion.length === 0) && (!preVersion || preVersion.length === 0)) {
      return this.reply(`未找到崩坏3版本 ${version} 的数据`, true)
    }
    let message = `📊 崩坏3版本 ${version} 数据：\n`

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
