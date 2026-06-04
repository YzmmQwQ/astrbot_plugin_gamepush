import { GamePushBase } from "./base.js"
import { GAME_CONFIG, download } from "#GamePush.model"
import { makeForwardMsg } from "#GamePush.lib"

export class zmdPush extends GamePushBase {
  constructor() {
    super({
      gameId: "zmd",
      gameName: GAME_CONFIG.zmd.name,
      regPattern: GAME_CONFIG.zmd.reg,
      priority: 100,
      extraRules: [
        {
          reg: `^#*${GAME_CONFIG.zmd.reg}获取下载链接$`,
          fnc: "zmdDownloadLinks"
        },
        {
          reg: `^#*${GAME_CONFIG.zmd.reg}获取预下载链接$`,
          fnc: "zmdPreDownloadLinks"
        }
      ]
    })
  }

  /**
   * 获取鸣潮下载链接
   */
  async zmdDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("zmd", "main")
      if (!data) return this.reply("当前没有可用的正式版本下载", true)

      const { msg, client, patch_client } = download.formatDownloadInfo("zmd", data, "main", patch)
      return this.reply(await makeForwardMsg(e, [msg, client, patch_client]))
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }

  /**
   * 获取鸣潮预下载链接
   */
  async zmdPreDownloadLinks(e) {
    try {
      const { data, patch } = await download.getDownloadData("zmd", "pre")
      if (!data) return this.reply("🚫 终末地当前未开放预下载", true)

      const { msg, client, patch_client } = download.formatDownloadInfo("zmd", data, "pre", patch)
      return this.reply(await makeForwardMsg(e, [msg, client, patch_client]))
    } catch (err) {
      return this.reply(`❌ 预下载获取失败：${err.message}`, true)
    }
  }
}
