import fs from "node:fs"
import { BotName, pluginName, PluginPackage } from "#GamePush.components"

const startTime = Date.now()
let apps = {}

if (BotName !== "karin") {
  // 获取应用目录下的所有JS文件，排除task.js
  const appsDir = `./plugins/${pluginName}/apps`
  const files = fs
    .readdirSync(appsDir)
    .filter((file) => file.endsWith(".js") && file.toLowerCase() !== "task.js")
    .filter((file) => file.toLowerCase() !== "base.js")
  const loadPromises = files.map((file) => import(`./apps/${file}`))
  const results = await Promise.allSettled(loadPromises)

  results.forEach((result, index) => {
    const file = files[index]
    const name = file.replace(".js", "")
    if (result.status === "fulfilled") {
      const exports = Object.keys(result.value)
      if (exports.length > 0) {
        apps[name] = result.value[exports[0]]
      }
    } else {
      logger.error(`载入插件错误：${logger.red(name)}`)
      logger.error(result.reason)
    }
  })
}

export { apps }

logger.info("-----------------")
logger.info(`${pluginName} v${PluginPackage.version} 加载成功~ 耗时: ${Date.now() - startTime}ms`)
logger.info("-------^_^-------")
