import plugin from "../../../lib/plugins/plugin.js"

let Reg = `(原神|星铁|绝区零|崩三)`

export class Set extends plugin {
  constructor() {
    super({
      name: '崩坏3版本监控',
      dsc: '崩坏3版本更新及预下载推送',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: `^#*${Reg}删除rediskey$`,
          fnc: 'delkey',
          permission: 'master'
        },
        {
            reg: `^#*${Reg}删除预下载rediskey$`,
            fnc: 'delPrekey',
            permission: 'master'
        }
      ]
    })
  }

  async delkey() {
    try {
      const msgMap = {
        "原神": { key: 'YZ:MHY:YS', name: "原神" },
        "星铁": { key: 'YZ:MHY:SR', name: "星铁" },
        "绝区零": { key: 'YZ:MHY:ZZZ', name: "绝区零" },
        "崩三": { key: 'YZ:MHY:BH3', name: "崩坏3" }
      }
  
      const match = Object.keys(msgMap).find(k => this.e.msg.includes(k));
      if (match) {
        const { key, name } = msgMap[match];
        await redis.del(key);
        this.e.reply(`${name} RedisKey已删除`);
      } else {
        this.e.reply("未找到匹配的游戏类型");
      }
    } catch (error) {
      this.e.reply(`删除失败: ${error.message}`);
    }
  }
  
  async delPrekey() {
    try {
      const preKeyMap = {
        "原神": { key: 'YZ:MHY:YS:PRE', name: "原神" },
        "星铁": { key: 'YZ:MHY:SR:PRE', name: "星铁" },
        "绝区零": { key: 'YZ:MHY:ZZZ:PRE', name: "绝区零" },
        "崩三": { key: 'YZ:MHY:BH3:PRE', name: "崩坏3" }
      }
  
      const match = Object.keys(preKeyMap).find(k => this.e.msg.includes(k));
      if (match) {
        const { key, name } = preKeyMap[match];
        await redis.del(key);
        this.e.reply(`${name} 预下载RedisKey已删除`);
      } else {
        this.e.reply("未找到匹配的游戏类型");
      }
    } catch (error) {
      this.e.reply(`删除失败: ${error.message}`);
    }
  }
}