import { cfg } from "#GamePush.components"
import { plugin, redis, makeForwardMsg } from "#GamePush.lib"
import { db, api, download, getRedisKeys } from "#GamePush.model"

const srReg = "(\\*|星铁|星轨|穹轨|星穹|崩铁|星穹铁道|崩坏星穹铁道|铁道)"

export class srPush extends plugin {
  constructor() {
    super({
      name: "[GamePush-Plugin]星铁功能",
      dsc: "星铁版本更新及预下载推送",
      event: "message",
      priority: 100,
      rule: [
        {
          reg: `^#*${srReg}版本监控$`,
          fnc: "srCheck",
          permission: "master"
        },
        {
          reg: `^#*${srReg}(开启|关闭)版本推送$`,
          fnc: "srPushSet",
          permission: "master"
        },
        {
          reg: `^#*${srReg}当前版本$`,
          fnc: "srVer"
        },
        {
          reg: `^#*${srReg}获取下载链接$`,
          fnc: "srDownloadLinks"
        },
        {
          reg: `^#*${srReg}获取预下载链接$`,
          fnc: "srPreDownloadLinks"
        },
        {
          reg: `^#*${srReg}版本数据(.*)$`,
          fnc: "srVersionData"
        }
      ]
    })

    this.task = {
      cron: cfg.getGameConfig("sr").cron || "0 0/5 * * * *",
      name: "[GamePush-Plugin] 星铁版本监控",
      fnc: () => api.autoCheck("sr"),
      log: cfg.getGameConfig("sr").log
    }
  }

  /**
   * 手动检查星铁版本
   */
  async srCheck() {
    await api.checkVersion(true, "sr")
    return this.reply("✅ 已执行手动检查", true)
  }

  /**
   * 设置星铁版本推送
   */
  async srPushSet(e) {
    if (!e.isGroup) {
      return this.reply("❌ 该功能仅限群聊中使用", true)
    }

    const groupId = String(e.group_id)
    const botId = String(e.self_id || e.selfId)
    const isEnable = e.msg.includes("开启")

    if (isEnable) {
      cfg.addPushGroup("sr", botId, groupId)
    } else {
      cfg.removePushGroup("sr", botId, groupId)
    }

    const action = isEnable ? `已添加本群到推送列表（ID：${groupId}）` : "已移除本群推送"
    return this.reply(`✅ 已${isEnable ? "开启" : "关闭"}星铁版本推送，${action}`, true)
  }

  /**
   * 查询星铁当前版本
   */
  async srVer() {
    const { main, pre } = getRedisKeys("sr")
    const [mainVer, preVer] = await Promise.all([redis.get(main), redis.get(pre)])

    const msg = [
      "📌 星铁当前版本信息",
      `正式版本：${mainVer || "未知"}`,
      `预下载版本：${preVer || "未开启"}`
    ].join("\n")

    return this.reply(msg, true)
  }

  /**
   * 获取星铁下载链接
   */
  async srDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("sr", "main")
      if (!data) return this.reply("当前没有可用的正式版本下载", true)

      const { msg, client, audio, patch_client, patch_audio } = download.formatDownloadInfo(
        "sr",
        data,
        "main",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, client, audio, patch_client, patch_audio]))
    } catch (err) {
      logger.error("[GamePush-Plugin] 获取星铁下载链接失败", err)
      return this.reply(`❌ 获取下载链接失败: ${err.message}`, true)
    }
  }

  /**
   * 获取星铁预下载链接
   */
  async srPreDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("sr", "pre")
      if (!data) return this.reply("当前没有可用的预下载版本", true)

      const { msg, client, audio, patch_client, patch_audio } = download.formatDownloadInfo(
        "sr",
        data,
        "pre",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, client, audio, patch_client, patch_audio]))
    } catch (err) {
      logger.error("[GamePush-Plugin] 获取星铁预下载链接失败", err)
      return this.reply(`❌ 获取预下载链接失败: ${err.message}`, true)
    }
  }

  async srVersionData() {
    const input = this.e.msg.replace(new RegExp(`#*${srReg}版本数据`, "i"), "").trim()
    if (!input) return this.showAllVersionData()
    return this.showSpecificVersionData(input)
  }

  async showAllVersionData() {
    const mainVersions = await (await db).getMainData("sr")
    const preVersions = await (await db).getPreData("sr")

    if ((!mainVersions || mainVersions.length === 0) && (!preVersions || preVersions.length === 0))
      return this.reply("暂无崩坏星穹铁道版本数据", true)

    let message = "📊 崩坏星穹铁道历史版本数据：\n"

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

    message += "\n\n📝 提示：发送 #星铁版本数据 [版本号] 查看详细数据"

    return this.reply(await makeForwardMsg(this.e, [message]))
  }

  /**
   * 显示指定版本数据
   * @param {string} version - 版本号
   */
  async showSpecificVersionData(version) {
    const mainVersion = await (await db).getMainData("sr", version)
    const preVersion = await (await db).getPreData("sr", version)

    if ((!mainVersion || mainVersion.length === 0) && (!preVersion || preVersion.length === 0)) {
      return this.reply(`未找到崩坏星穹铁道版本 ${version} 的数据`, true)
    }
    let message = `📊 崩坏星穹铁道版本 ${version} 数据：\n`

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
