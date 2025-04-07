import api from "../model/api.js"
import cfg from "../model/config.js"
import { getRedisKeys } from "../model/util.js"
import plugin from "../../../lib/plugins/plugin.js"

let zzzReg = `(绝区零|zzz|ZZZ)`

export class zzzPush extends plugin {
  constructor() {
    super({
      name: '绝区零版本监控',
      dsc: '绝区零版本更新及预下载推送',
      event: 'message',
      priority: 7000,
      rule: [
        {
          reg: `^#*${zzzReg}?版本监控$`,
          fnc: 'zzzCheck',
          permission: 'master'
        },
        {
          reg: `^#*(开启|关闭)${zzzReg}版本推送$`,
          fnc: 'zzzPushSet',
          permission: 'master'
        },
        {
          reg: `^#*${zzzReg}当前版本$`,
          fnc: 'zzzVer'
        },
        {
          reg: `^#*获取${zzzReg}下载链接$`,
          fnc: 'zzzDownloadLinks'
        },
        {
          reg: `^#*获取${zzzReg}预下载链接$`,
          fnc: 'zzzPreDownloadLinks'
        }
      ]
    })

    this.task = {
      cron: '0/1 * * * * *',
      name: '绝区零版本监控',
      fnc: () => api.autoCheck('zzz'),
      log: false
    }
  }

  async zzzCheck() {
    await api.checkVersion(false, 'zzz')
    return this.reply('✅ 已执行手动检查', true)
  }
  
  async zzzPushSet() {
    const e = this.e
    const groupId = String(e.group_id)
    if (!e.isGroup) {
        return this.reply('❌ 该功能仅限群聊中使用', true)
    }

    const isEnable = e.msg.includes('开启')
    
    cfg.updateGameConfig('zzz', (config) => {
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
    return this.reply(`✅ 已${isEnable ? '开启' : '关闭'}绝区零版本推送，${action}`, true)
}

  async zzzVer() {
    const { main, pre } = getRedisKeys('zzz')
    const [mainVer, preVer] = await Promise.all([
      redis.get(main),
      redis.get(pre)
    ])
    
    const msg = [
      '📌 绝区零当前版本信息',
      `正式版本：${mainVer || '未知'}`,
      `预下载版本：${preVer || '未开启'}`
    ].join('\n')
    
    return this.reply(msg, true)
  }

  async zzzDownloadLinks() {
    try {
      const { data } = await api.getDownloadData('zzz')
      if (!data) return this.reply('当前没有可用的正式版本下载', true)
      
      const msg = api.formatDownloadInfo('zzz', data)
      return this.reply(await Bot.makeForwardArray([msg]));
    } catch (err) {
      return this.reply(`❌ 获取失败：${err.message}`, true)
    }
  }

  async zzzPreDownloadLinks() {
    try {
      const { data } = await api.getDownloadData('zzz', 'pre')
      if (!data) return this.reply('🚫 绝区零当前未开放预下载', true)
      
      const msg = api.formatDownloadInfo('zzz', data, 'pre')
      return this.reply(await Bot.makeForwardArray([msg]))
    } catch (err) {
      return this.reply(`❌ 预下载获取失败：${err.message}`, true)
    }
  }
}