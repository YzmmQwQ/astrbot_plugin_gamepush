import { GamePushBase } from "./base.js"

const ysReg = "(ys|YS|原神)"

export class ysPush extends GamePushBase {
  constructor() {
    super({
      gameId: "ys",
      gameName: "原神",
      regPattern: ysReg,
      priority: 99
    })
  }
}
