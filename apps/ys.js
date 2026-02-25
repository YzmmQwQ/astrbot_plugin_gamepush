import { GAME_CONFIG } from "#GamePush.model"
import { GamePushBase } from "./base.js"
export class ysPush extends GamePushBase {
  constructor() {
    super({
      gameId: "ys",
      gameName: "原神",
      regPattern: GAME_CONFIG.ys.reg,
      priority: 99
    })
  }
}
