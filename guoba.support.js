import Config from './model/config.js'

const cfg = new Config()
const gameIds = ['ys', 'sr', 'zzz', 'bh3', 'ww']
const gameMap = {
  ys: '原神',
  sr: '星穹铁道',
  zzz: '绝区零',
  bh3: '崩坏3',
  ww: '鸣潮'
}

export function supportGuoba () {
  return {
    pluginInfo: {
      name: 'GamePush-Plugin',
      title: '游戏推送',
      description: '自动监控游戏版本更新并推送通知',
      author: 'rainbowwarmth',
      link: 'https://gitcode.com/rainbowwarmth/GamePush-Plugin.git',
      isV3: true,
      showInMenu: true,
      icon: 'mdi:gamepad-square-outline',
      iconColor: '#FF5722'
    },
    configInfo: {
      schemas: [
        ...gameIds.map(gameId => {
          const gameName = gameMap[gameId]
          return [
            {
              label: `${gameName}配置`,
              component: 'Divider'
            },
            {
              field: `${gameId}.enable`,
              label: `启用${gameName}推送`,
              component: 'Switch',
              value: true,
              componentProps: {
                defaultChecked: true
              }
            },
            {
              field: `${gameId}.cron`,
              label: '检查频率',
              bottomHelpMessage: '版本检查的时间表达式',
              component: 'EasyCron',
              value: '0 0/5 * * * *',
              componentProps: {
                placeholder: '默认: 0 0/5 * * * * (每5分钟检查一次)'
              }
            },
            {
              field: `${gameId}.pushGroups`,
              label: '推送群组',
              bottomHelpMessage: '选择需要推送通知的群组',
              component: 'GSubForm',
              value: [],
              componentProps: {
                multiple: true,
                schemas: [
                  {
                    field: 'groupId',
                    label: '群组ID',
                    component: 'Input',
                    required: true,
                    componentProps: {
                      placeholder: '请输入群号',
                      style: { width: '100%' }
                    }
                  }
                ],
                itemProps: {
                  style: {
                    width: '100%',
                    marginBottom: '16px'
                  }
                }
              }
            }
          ]
        }).flat()
      ],
      actions: {},
      getConfigData () {
        try {
          const config = cfg.loadConfig()
          logger.info('[GamePush-Plugin] 从文件加载配置')
          return config
        } catch (error) {
          logger.error('[GamePush-Plugin] 获取配置失败', error)
          return cfg.generateDefaultConfig()
        }
      },
      setConfigData (data, { Result }) {
        try {
          logger.info('[GamePush-Plugin] 收到前端配置数据:', data)

          if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            return Result.error('无效的配置数据')
          }
          const formattedData = {}
          gameIds.forEach(gameId => {
            const gameData = data[gameId]
            if (gameData && typeof gameData === 'object') {
              formattedData[gameId] = {
                enable: !!gameData.enable,
                cron: gameData.cron || '0 0/5 * * * *',
                pushGroups: Array.isArray(gameData.pushGroups)
                  ? gameData.pushGroups.map(item => String(item.groupId || item).trim())
                  : []
              }
            } else {
              formattedData[gameId] = {
                enable: false,
                cron: '0 0/5 * * * *',
                pushGroups: []
              }

              const prefix = `${gameId}.`
              Object.keys(data).forEach(key => {
                if (key.startsWith(prefix)) {
                  const prop = key.substring(prefix.length)
                  if (prop === 'enable') {
                    formattedData[gameId].enable = !!data[key]
                  } else if (prop === 'cron') {
                    formattedData[gameId].cron = data[key] || '0 0/5 * * * *'
                  } else if (prop === 'pushGroups') {
                    if (Array.isArray(data[key])) {
                      formattedData[gameId].pushGroups = data[key]
                        .map(item => String(item.groupId || item).trim())
                        .filter(Boolean)
                    }
                  }
                }
              })
            }
          })

          logger.info('[GamePush-Plugin] 格式化后的配置:', formattedData)
          if (cfg.saveConfig(formattedData)) {
            return Result.ok({}, '游戏推送配置已保存！')
          } else {
            return Result.error('保存失败，请查看日志')
          }
        } catch (error) {
          logger.error('保存配置失败:', error)
          return Result.error('保存失败: ' + error.message)
        }
      }
    }
  }
}
