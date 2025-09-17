import { cfg } from "#GamePush.components"
import { plugin, redis, makeForwardMsg } from "#GamePush.lib"
import { db, api, download, getRedisKeys } from "#GamePush.model"

const zzzReg = "(%|％|绝区零|zzz|ZZZ|绝区)"

export class zzzPush extends plugin {
  constructor() {
    super({
      name: "[GamePush-Plugin]绝区零功能",
      dsc: "绝区零版本更新及预下载推送",
      event: "message",
      priority: 100,
      rule: [
        {
          reg: `^#*${zzzReg}版本监控$`,
          fnc: "zzzCheck",
          permission: "master"
        },
        {
          reg: `^#*${zzzReg}(开启|关闭)版本推送$`,
          fnc: "zzzPushSet",
          permission: "master"
        },
        {
          reg: `^#*${zzzReg}当前版本$`,
          fnc: "zzzVer"
        },
        {
          reg: `^#*${zzzReg}获取下载链接$`,
          fnc: "zzzDownloadLinks"
        },
        {
          reg: `^#*${zzzReg}获取预下载链接$`,
          fnc: "zzzPreDownloadLinks"
        },
        {
          reg: `^#*${zzzReg}版本数据(.*)$`,
          fnc: "zzzVersionData"
        }
      ]
    })

    this.task = {
      cron: cfg.getGameConfig("zzz").cron || "0 0/5 * * * *",
      name: "[GamePush-Plugin] 绝区零版本监控",
      fnc: () => api.autoCheck("zzz"),
      log: cfg.getGameConfig("zzz").log
    }
  }

  /**
   * 手动检查绝区零版本
   */
  async zzzCheck() {
    await api.checkVersion(true, "zzz")
    return this.reply("✅ 已执行手动检查", true)
  }

  /**
   * 设置绝区零版本推送
   */
  async zzzPushSet(e) {
    if (!e.isGroup) {
      return this.reply("❌ 该功能仅限群聊中使用", true)
    }

    const groupId = String(e.group_id)
    const botId = String(e.self_id || e.selfId)
    const isEnable = e.msg.includes("开启")

    if (isEnable) {
      cfg.addPushGroup("zzz", botId, groupId)
    } else {
      cfg.removePushGroup("zzz", botId, groupId)
    }

    const action = isEnable ? `已添加本群到推送列表（ID：${groupId}）` : "已移除本群推送"
    return this.reply(`✅ 已${isEnable ? "开启" : "关闭"}绝区零版本推送，${action}`, true)
  }

  /**
   * 查询绝区零当前版本
   */
  async zzzVer() {
    const { main, pre } = getRedisKeys("zzz")
    const [mainVer, preVer] = await Promise.all([redis.get(main), redis.get(pre)])

    const msg = [
      "📌 绝区零当前版本信息",
      `正式版本：${mainVer || "未知"}`,
      `预下载版本：${preVer || "未开启"}`
    ].join("\n")

    return this.reply(msg, true)
  }

  /**
   * 获取绝区零下载链接
   */
  async zzzDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("zzz", "main")
      if (!data) return this.reply("当前没有可用的正式版本下载", true)

      const { msg, client, audio, patch_client, patch_audio } = download.formatDownloadInfo(
        "zzz",
        data,
        "main",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, client, audio, patch_client, patch_audio]))
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }

  /**
   * 获取绝区零预下载链接
   */
  async zzzPreDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("zzz", "pre")
      if (!data) return this.reply("🚫 绝区零当前未开放预下载", true)

      const { msg, client, audio, patch_client, patch_audio } = download.formatDownloadInfo(
        "zzz",
        data,
        "pre",
        patch
      )
      return this.reply(await makeForwardMsg(e, [msg, client, audio, patch_client, patch_audio]))
    } catch (err) {
      return this.reply(`❌ 预下载获取失败：${err.message}`, true)
    }
  }

  /**
   * 处理绝区零版本数据查询
   */
  async zzzVersionData() {
    const input = this.e.msg.replace(new RegExp(`#*${zzzReg}版本数据`, "i"), "").trim()
    if (!input) return this.showAllVersionData()
    return this.showSpecificVersionData(input)
  }

  /**
   * 显示绝区零所有版本数据
   */
  async showAllVersionData() {
    const mainVersions = await (await db).getMainData("zzz")
    const preVersions = await (await db).getPreData("zzz")

    if ((!mainVersions || mainVersions.length === 0) && (!preVersions || preVersions.length === 0))
      return this.reply("暂无绝区零版本数据", true)

    let message = "📊 绝区零历史版本数据：\n"

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

    message += "\n\n📝 提示：发送 #绝区零版本数据 [版本号] 查看详细数据"

    return this.reply(await makeForwardMsg(this.e, [message]))
  }

  /**
   * 显示指定版本数据
   * @param {string} version - 版本号
   */
  async showSpecificVersionData(version) {
    const mainVersion = await (await db).getMainData("zzz", version)
    const preVersion = await (await db).getPreData("zzz", version)

    if ((!mainVersion || mainVersion.length === 0) && (!preVersion || preVersion.length === 0)) {
      return this.reply(`未找到绝区零版本 ${version} 的数据`, true)
    }
    let message = `📊 绝区零版本 ${version} 数据：\n`

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
