import { GamePushBase } from "./base.js"
import { GAME_CONFIG } from "#GamePush.model"

export class bh3Push extends GamePushBase {
  constructor() {
    super({
      gameId: "bh3",
      gameName: "崩坏3",
      regPattern: GAME_CONFIG.bh3.reg,
      priority: 100
    })
  }
}
