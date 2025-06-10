import { pluginRoot } from '#GamePush'
import fs from 'node:fs'
import path from 'node:path'

const packageJsonPath = path.resolve(pluginRoot, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
logger.info(`GamePush-Plugin ${packageJson.version} 加载中`)
if ( packageJson.version < '1.0.1') {
  logger.warn(`新版本现已适配锅巴建议各位使用者更新`)
  logger.info(`Created By ${packageJson.author}`)
} else {
  logger.info(`Created By ${packageJson.author}`)
}

const files = fs.readdirSync('./plugins/GamePush-Plugin/apps').filter(file => file.endsWith('.js'))

let ret = []

files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  let name = files[i].replace('.js', '')

  if (ret[i].status != 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}
export { apps }
