import { cfg } from "#GamePush.components"
import { plugin, redis, makeForwardMsg } from "#GamePush.lib"
import { db, api, getRedisKeys } from "#GamePush.model"
const ysReg = "(ys|YS|原神)"

export class ysPush extends plugin {
  constructor() {
    super({
      name: "[GamePush-Plugin]原神功能",
      dsc: "原神版本更新及预下载推送",
      event: "message",
      priority: 7000,
      rule: [
        {
          reg: `^#*${ysReg}?版本监控$`,
          fnc: "ysCheck",
          permission: "master"
        },
        {
          reg: `^#*${ysReg}?(开启|关闭)版本推送$`,
          fnc: "ysPushSet",
          permission: "master"
        },
        {
          reg: `^#*${ysReg}?当前版本$`,
          fnc: "ysVer"
        },
        {
          reg: `^#*${ysReg}?版本数据(.*)$`,
          fnc: "ysVersionData"
        }
      ]
    })

    this.task = {
      cron: cfg.getGameConfig("ys").cron || "0 0/5 * * * *",
      name: "[GamePush-Plugin] 原神版本监控",
      fnc: () => api.autoCheck("ys"),
      log: cfg.getGameConfig("ys").log
    }
  }

  /**
   * 手动检查原神版本
   */
  async ysCheck() {
    await api.checkVersion(true, "ys")
    return this.reply("✅ 已执行手动检查", true)
  }

  /**
   * 设置原神版本推送
   */
  async ysPushSet(e) {
    if (!e.isGroup) {
      return this.reply("❌ 该功能仅限群聊中使用", true)
    }

    const groupId = String(e.group_id)
    const botId = String(e.self_id || e.selfId)
    const isEnable = e.msg.includes("开启")

    if (isEnable) {
      cfg.addPushGroup("ys", botId, groupId)
    } else {
      cfg.removePushGroup("ys", botId, groupId)
    }

    const action = isEnable
      ? `已添加本群到推送列表（ID：${groupId}）`
      : `已移除本群推送（ID：${groupId}）`
    return this.reply(`✅ 已${isEnable ? "开启" : "关闭"}原神版本推送，${action}`, true)
  }

  /**
   * 查询原神当前版本
   */
  async ysVer() {
    const { main, pre } = getRedisKeys("ys")
    const [mainVer, preVer] = await Promise.all([redis.get(main), redis.get(pre)])

    const msg = [
      "📌 原神当前版本信息",
      `正式版本：${mainVer || "未知"}`,
      `预下载版本：${preVer || "未开启"}`
    ].join("\n")

    return this.reply(msg, true)
  }

  async ysVersionData() {
    const input = this.e.msg.replace(new RegExp(`#*${ysReg}?版本数据`, "i"), "").trim()
    if (!input) return this.showAllVersionData()
    return this.showSpecificVersionData(input)
  }

  async showAllVersionData() {
    const mainVersions = await (await db).getMainData("ys")
    const preVersions = await (await db).getPreData("ys")

    if ((!mainVersions || mainVersions.length === 0) && (!preVersions || preVersions.length === 0))
      return this.reply("暂无原神版本数据", true)

    let message = "📊 原神历史版本数据：\n"

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
    const mainVersion = await (await db).getMainData("ys", version)
    const preVersion = await (await db).getPreData("ys", version)

    if ((!mainVersion || mainVersion.length === 0) && (!preVersion || preVersion.length === 0)) {
      return this.reply(`未找到原神版本 ${version} 的数据`, true)
    }
    let message = `📊 原神版本 ${version} 数据：\n`

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
