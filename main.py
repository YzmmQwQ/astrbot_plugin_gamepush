from __future__ import annotations

import asyncio
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import astrbot.api.message_components as Comp
from astrbot.api import logger
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.star import Context, Star, StarTools, register
from astrbot.core.message.message_event_result import MessageChain

from .gamepush_service import GAME_CONFIG, GamePushService, game_name


def _game_pattern() -> str:
    aliases = [alias for game in GAME_CONFIG.values() for alias in game["aliases"]]
    return "|".join(re.escape(alias) for alias in sorted(aliases, key=len, reverse=True))


GAME_PATTERN = _game_pattern()
GAME_COMMAND_PATTERN = rf"^\s*[#/]?(?:{GAME_PATTERN})(?:版本监控|开启版本推送|关闭版本推送|当前版本|版本数据(?:\s+.*)?|获取下载链接|获取预下载链接)\s*$"
ADMIN_COMMAND_PATTERN = rf"^\s*#?(?:(?:{GAME_PATTERN})\s*)?(?:删除(?:预下载)?rediskey|设置(?:预下载)?rediskey\s+.+)\s*$|^\s*#?更新游戏版本数据\s*$"


@register(
    "astrbot_plugin_gamepush",
    "Yzmm",
    "监控游戏版本更新并推送原有游戏卡片通知",
    "2.0.0",
)
class GamePushPlugin(Star):
    def __init__(self, context: Context, config: dict[str, Any] | None = None) -> None:
        super().__init__(context)
        self.config = config if config is not None else {}
        self.plugin_dir = Path(__file__).parent
        self.service: GamePushService | None = None
        self.monitor_task: asyncio.Task[None] | None = None
        self._last_runs: dict[str, str] = {}

    async def initialize(self) -> None:
        data_dir = Path(StarTools.get_data_dir(self.name))
        self.service = GamePushService(
            self.plugin_dir,
            data_dir,
            self.config,
            self._send_target,
            self._render_card,
        )
        await self.service.initialize()
        self.monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("GamePush AstrBot 插件已加载")

    async def terminate(self) -> None:
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass
        if self.service:
            await self.service.close()

    async def _render_card(self, style: str, data: dict[str, Any]) -> str:
        assert self.service
        data |= {
            "bot": {"name": "AstrBot"},
            "plugin": {"name": "GamePush", "version": "2.0.0"},
            "pluResPath": "",
        }
        return await self.html_render(
            self.service.template(style),
            data,
            return_url=False,
            options={"type": "jpeg", "quality": 75, "full_page": True},
        )

    async def _send_target(self, target: dict[str, str], content: str, is_image: bool) -> None:
        chain = MessageChain([
            Comp.Image.fromFileSystem(content) if is_image else Comp.Plain(text=content)
        ])
        if target.get("umo"):
            await self.context.send_message(target["umo"], chain)
            return
        group_id = target.get("group_id")
        if not group_id:
            raise ValueError("推送目标缺少群组 ID")
        await StarTools.send_message_by_id(
            "GroupMessage", group_id, chain, target.get("platform", "aiocqhttp")
        )

    async def _monitor_loop(self) -> None:
        while True:
            try:
                for game in GAME_CONFIG:
                    if not self.service:
                        continue
                    cfg = self.service.game_config(game)
                    if not cfg.get("enable"):
                        continue
                    now = datetime.now()
                    marker = now.strftime("%Y%m%d%H%M")
                    if self._cron_matches(str(cfg.get("cron", "")), now) and self._last_runs.get(game) != marker:
                        self._last_runs[game] = marker
                        try:
                            await self.service.check_version(game)
                        except Exception as error:
                            logger.error(f"[{game_name(game)}] 自动检查失败: {error}")
            except Exception as error:
                logger.error(f"GamePush 定时任务异常: {error}")
            await asyncio.sleep(15)

    @staticmethod
    def _cron_matches(expression: str, now: datetime) -> bool:
        fields = expression.split()
        if len(fields) == 6:
            values = [now.second, now.minute, now.hour, now.day, now.month, (now.weekday() + 1) % 7]
        elif len(fields) == 5:
            fields = ["0", *fields]
            values = [now.second, now.minute, now.hour, now.day, now.month, (now.weekday() + 1) % 7]
        else:
            logger.warning(f"GamePush 忽略无效 cron: {expression}")
            return False
        return all(GamePushPlugin._cron_field_matches(field, value) for field, value in zip(fields, values))

    @staticmethod
    def _cron_field_matches(field: str, value: int) -> bool:
        for item in field.split(","):
            base, separator, step_text = item.partition("/")
            try:
                step = int(step_text) if separator else 1
            except ValueError:
                continue
            if step <= 0:
                continue
            if base == "*":
                if value % step == 0:
                    return True
                continue
            if "-" in base:
                try:
                    start, end = (int(number) for number in base.split("-", 1))
                    if start <= value <= end and (value - start) % step == 0:
                        return True
                except ValueError:
                    continue
            else:
                try:
                    start = int(base)
                    if value == start or (separator and value >= start and (value - start) % step == 0):
                        return True
                except ValueError:
                    continue
        return False

    def _parse_game_command(self, message: str) -> tuple[str, str] | None:
        clean = message.strip().lstrip("#/").strip()
        for game, info in GAME_CONFIG.items():
            for alias in sorted(info["aliases"], key=len, reverse=True):
                if clean.lower().startswith(alias.lower()):
                    return game, clean[len(alias):].strip()
        return None

    def _target_from_event(self, event: AstrMessageEvent) -> dict[str, str] | None:
        group_id = str(event.get_group_id() or "")
        if not group_id:
            return None
        target = {"group_id": group_id, "platform": "aiocqhttp"}
        umo = getattr(event, "unified_msg_origin", "")
        if umo:
            target["umo"] = str(umo)
        return target

    def _save_push_target(self, game: str, target: dict[str, str], enabled: bool) -> bool:
        cfg = self.config.setdefault(game, {})
        groups = cfg.setdefault("push_groups", [])
        if not isinstance(groups, list):
            groups = cfg["push_groups"] = []
        existing = next((item for item in groups if isinstance(item, dict) and item.get("group_id") == target["group_id"]), None)
        if enabled and not existing:
            groups.append(target)
        elif not enabled and existing:
            groups.remove(existing)
        else:
            return False
        if hasattr(self.config, "save_config"):
            self.config.save_config()
        return True

    @filter.regex(GAME_COMMAND_PATTERN)
    async def game_command(self, event: AstrMessageEvent):
        parsed = self._parse_game_command(event.get_message_str())
        if not parsed or not self.service:
            return
        game, action = parsed
        event.stop_event()
        try:
            if action == "版本监控":
                if not event.is_admin():
                    yield event.plain_result("该命令仅限管理员使用")
                    return
                await self.service.check_version(game)
                yield event.plain_result(f"已完成 {game_name(game)} 版本检查")
            elif action in ("开启版本推送", "关闭版本推送"):
                if not event.is_admin():
                    yield event.plain_result("该命令仅限管理员使用")
                    return
                target = self._target_from_event(event)
                if not target:
                    yield event.plain_result("该功能仅限群聊中使用")
                    return
                enabled = action.startswith("开启")
                changed = self._save_push_target(game, target, enabled)
                if changed:
                    yield event.plain_result(f"已{'开启' if enabled else '关闭'}本群 {game_name(game)} 版本推送")
                else:
                    yield event.plain_result("本群推送配置未发生变化")
            elif action == "当前版本":
                main = await self.service.db.get_state(game, "main") or "未知"
                pre = await self.service.db.get_state(game, "pre") or "未开启"
                yield event.plain_result(f"{game_name(game)}当前版本信息\n正式版本：{main}\n预下载版本：{pre}")
            elif action.startswith("版本数据"):
                version = action.removeprefix("版本数据").strip()
                main, pre = await self.service.db.history(game, version)
                if not main and not pre:
                    yield event.plain_result(f"暂无 {game_name(game)} 版本数据")
                    return
                lines = [f"{game_name(game)}历史版本数据"]
                lines += [f"正式版 {row[0]} | {row[1] or '大小未知'} | {row[2]}" for row in main]
                lines += [f"预下载 {row[0]}（旧版 {row[1] or '未知'}）| {row[2] or '大小未知'} | {row[3]}" for row in pre]
                yield event.plain_result("\n".join(lines))
            elif action in ("获取下载链接", "获取预下载链接"):
                if game in ("ys", "bh3"):
                    yield event.plain_result(f"{game_name(game)}暂不支持获取下载链接")
                    return
                kind = "pre" if action == "获取预下载链接" else "main"
                download = await self.service.get_download_data(game, kind)
                yield event.plain_result(self.service.download_text(game, kind, download))
        except Exception as error:
            logger.error(f"[{game_name(game)}] 命令执行失败: {error}")
            yield event.plain_result(f"操作失败：{error}")

    @filter.regex(ADMIN_COMMAND_PATTERN)
    async def state_command(self, event: AstrMessageEvent):
        if not event.is_admin() or not self.service:
            return
        event.stop_event()
        text = event.get_message_str().strip().lstrip("#").strip()
        if text == "更新游戏版本数据":
            yield event.plain_result("AstrBot 版本使用本地 SQLite 自动维护历史数据，无需下载外部数据库。")
            return
        parsed = self._parse_game_command(text)
        game = parsed[0] if parsed else "ys"
        action = parsed[1] if parsed else text
        kind = "pre" if "预下载" in action else "main"
        if action.startswith("删除"):
            await self.service.db.delete_state(game, kind)
            yield event.plain_result(f"已删除 {game_name(game)} {'预下载' if kind == 'pre' else '正式版'}版本状态")
        elif action.startswith("设置"):
            value = re.split(r"设置(?:预下载)?rediskey", action, maxsplit=1, flags=re.I)[-1].strip()
            if not value:
                yield event.plain_result("请提供要设置的版本号")
                return
            await self.service.db.set_state(game, kind, value)
            yield event.plain_result(f"已设置 {game_name(game)} {'预下载' if kind == 'pre' else '正式版'}版本为 {value}")
