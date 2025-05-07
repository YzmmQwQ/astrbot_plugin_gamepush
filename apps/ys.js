import api from "../model/api.js"
import cfg from "../model/config.js"
import { getRedisKeys } from "../model/util.js"
import plugin from "../../../lib/plugins/plugin.js"

let ysReg = `(ys|YS|原神)`

export class ysPush extends plugin {
  constructor() {
    super({
      name: '原神版本监控',
      dsc: '原神版本更新及预下载推送',
      event: 'message',
      priority: 7000,
      rule: [
        {
          reg: `^#*${ysReg}版本监控$`,
          fnc: 'ysCheck',
          permission: 'master'
        },
        {
          reg: `^#*(开启|关闭)${ysReg}版本推送$`,
          fnc: 'ysPushSet',
          permission: 'master'
        },
        {
          reg: `^#*${ysReg}当前版本$`,
          fnc: 'ysVer'
        },
        {
          reg: `^#*获取${ysReg}下载链接$`,
          fnc: 'ysDownloadLinks'
        }
      ]
    })

    this.task = {
      cron: '0/5 * * * * *',
      name: '原神版本监控',
      fnc: () => api.autoCheck('ys'),
      log: false
    }
  }

  async ysCheck() {
    await api.checkVersion(false, 'ys')
    return this.reply('✅ 已执行手动检查', true)
  }
  
  async ysPushSet() {
    const e = this.e
    const groupId = String(e.group_id)
    if (!e.isGroup) {
        return this.reply('❌ 该功能仅限群聊中使用', true)
    }

    const isEnable = e.msg.includes('开启')
    
    cfg.updateGameConfig('ys', (config) => {
        config.pushGroups = config.pushGroups || []
        if (isEnable) {
            if (!config.pushGroups.includes(groupId)) {
                config.pushGroups.push(groupId)
            }
        } else {
            config.pushGroups = config.pushGroups.filter(id => id !== groupId)
        }
        config.enable = isEnable
    })

    const action = isEnable ? `已添加本群到推送列表（ID：${groupId}）` : '已移除本群推送'
    return this.reply(`✅ 已${isEnable ? '开启' : '关闭'}原神版本推送，${action}`, true)
}

  async ysVer() {
    const { main, pre } = getRedisKeys('ys')
    const [mainVer, preVer] = await Promise.all([
      redis.get(main),
      redis.get(pre)
    ])
    
    const msg = [
      '📌 原神当前版本信息',
      `正式版本：${mainVer || '未知'}`,
      `预下载版本：${preVer || '未开启'}`
    ].join('\n')
    
    return this.reply(msg, true)
  }

  async ysDownloadLinks() {
    try {
      const { data, patch } = await api.getDownloadData('ys', 'main')
      if (!data) return this.reply('当前没有可用的正式版本下载', true)
      
      const msg = api.formatDownloadInfo('ys', data, 'main', patch)
      return this.reply(await Bot.makeForwardArray([msg]));
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }
}