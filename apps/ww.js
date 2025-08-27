import { cfg } from "#GamePush.components"
import { plugin, redis, makeForwardMsg } from "#GamePush.lib"
import { db, api, download, getRedisKeys } from "#GamePush.model"

const wwReg = "(~|～|鸣潮|ww|WW|mc)"

export class wwPush extends plugin {
  constructor() {
    super({
      name: "[GamePush-Plugin]鸣潮功能",
      dsc: "鸣潮版本更新及预下载推送",
      event: "message",
      priority: 100,
      rule: [
        {
          reg: `^#*${wwReg}版本监控$`,
          fnc: "wwCheck",
          permission: "master"
        },
        {
          reg: `^#*${wwReg}(开启|关闭)版本推送$`,
          fnc: "wwPushSet",
          permission: "master"
        },
        {
          reg: `^#*${wwReg}当前版本$`,
          fnc: "wwVer"
        },
        {
          reg: `^#*${wwReg}获取下载链接$`,
          fnc: "wwDownloadLinks"
        },
        {
          reg: `^#*${wwReg}获取预下载链接$`,
          fnc: "wwPreDownloadLinks"
        },
        {
          reg: `^#*${wwReg}版本数据(.*)$`,
          fnc: "wwVersionData"
        }
      ]
    })

    this.task = {
      cron: cfg.getGameConfig("ww").cron || "0 0/5 * * * *",
      name: "[GamePush-Plugin] 鸣潮版本监控",
      fnc: () => api.autoCheck("ww"),
      log: cfg.getGameConfig("ww").log
    }
  }

  /**
   * 手动检查鸣潮版本
   */
  async wwCheck() {
    await api.checkVersion(true, "ww")
    return this.reply("✅ 已执行手动检查", true)
  }

  /**
   * 设置鸣潮版本推送
   */
  async wwPushSet(e) {
    if (!e.isGroup) {
      return this.reply("❌ 该功能仅限群聊中使用", true)
    }

    const groupId = String(e.group_id)
    const botId = String(e.self_id || e.selfId)
    const isEnable = e.msg.includes("开启")

    if (isEnable) {
      cfg.addPushGroup("ww", botId, groupId)
    } else {
      cfg.removePushGroup("ww", botId, groupId)
    }

    const action = isEnable ? `已添加本群到推送列表（ID：${groupId}）` : "已移除本群推送"
    return this.reply(`✅ 已${isEnable ? "开启" : "关闭"}鸣潮版本推送，${action}`, true)
  }

  /**
   * 查询鸣潮当前版本
   */
  async wwVer() {
    const { main, pre } = getRedisKeys("ww")
    const [mainVer, preVer] = await Promise.all([redis.get(main), redis.get(pre)])

    const msg = [
      "📌 鸣潮当前版本信息",
      `正式版本：${mainVer || "未知"}`,
      `预下载版本：${preVer || "未开启"}`
    ].join("\n")

    return this.reply(msg, true)
  }

  /**
   * 获取鸣潮下载链接
   */
  async wwDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("ww", "main")
      if (!data) return this.reply("当前没有可用的正式版本下载", true)

      const { msg, client, patch_client } = download.formatDownloadInfo("ww", data, "main", patch)
      return this.reply(await makeForwardMsg(e, [msg, client, patch_client]))
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }

  /**
   * 获取鸣潮预下载链接
   */
  async wwPreDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("ww", "pre")
      if (!data) return this.reply("🚫 鸣潮当前未开放预下载", true)

      const { msg, client, patch_client } = download.formatDownloadInfo("ww", data, "pre", patch)
      return this.reply(await makeForwardMsg(e, [msg, client, patch_client]))
    } catch (err) {
      return this.reply(`❌ 预下载获取失败：${err.message}`, true)
    }
  }

  async wwVersionData() {
    const input = this.e.msg.replace(new RegExp(`#*${wwReg}版本数据`, "i"), "").trim()
    if (!input) return this.showAllVersionData()
    return this.showSpecificVersionData(input)
  }

  async showAllVersionData() {
    const mainVersions = await (await db).getMainData("ww")
    const preVersions = await (await db).getPreData("ww")

    if ((!mainVersions || mainVersions.length === 0) && (!preVersions || preVersions.length === 0))
      return this.reply("暂无鸣潮版本数据", true)

    let message = "📊 鸣潮历史版本数据：\n"

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

    message += "\n\n📝 提示：发送 #鸣潮版本数据 [版本号] 查看详细数据"

    return this.reply(await makeForwardMsg(this.e, [message]))
  }

  /**
   * 显示指定版本数据
   * @param {string} version - 版本号
   */
  async showSpecificVersionData(version) {
    const mainVersion = await (await db).getMainData("ww", version)
    const preVersion = await (await db).getPreData("ww", version)

    if ((!mainVersion || mainVersion.length === 0) && (!preVersion || preVersion.length === 0)) {
      return this.reply(`未找到鸣潮版本 ${version} 的数据`, true)
    }
    let message = `📊 鸣潮版本 ${version} 数据：\n`

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
