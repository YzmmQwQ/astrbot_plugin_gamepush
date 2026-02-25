import { GamePushBase } from "./base.js"
import { GAME_CONFIG, download } from "#GamePush.model"
import { makeForwardMsg } from "#GamePush.lib"

export class srPush extends GamePushBase {
  constructor() {
    super({
      gameId: "sr",
      gameName: "星铁",
      regPattern: GAME_CONFIG.sr.reg,
      priority: 100,
      extraRules: [
        {
          reg: `^#*${GAME_CONFIG.sr.reg}获取下载链接$`,
          fnc: "srDownloadLinks"
        },
        {
          reg: `^#*${GAME_CONFIG.sr.reg}获取预下载链接$`,
          fnc: "srPreDownloadLinks"
        }
      ]
    })
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
}
