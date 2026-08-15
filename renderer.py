from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Any

from jinja2 import Environment, select_autoescape
from playwright.async_api import Browser, BrowserContext, Playwright, async_playwright


class LocalCardRenderer:
    """Persistent local Playwright renderer for GamePush notification cards."""

    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._lock = asyncio.Lock()
        self._jinja = Environment(autoescape=select_autoescape(["html", "xml"]))

    async def start(self) -> None:
        if self._browser:
            return
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            args=["--no-sandbox", "--disable-gpu"]
        )
        self._context = await self._browser.new_context(
            viewport={"width": 860, "height": 900}, device_scale_factor=1
        )

    async def stop(self) -> None:
        if self._context:
            await self._context.close()
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        self._context = None
        self._browser = None
        self._playwright = None

    async def render(self, template: str, data: dict[str, Any]) -> str:
        await self.start()
        if not self._context:
            raise RuntimeError("Playwright 渲染器未启动")
        html = self._jinja.from_string(template).render(**data)
        output = self.output_dir / f"gamepush-{uuid.uuid4().hex}.png"

        async with self._lock:
            page = await self._context.new_page()
            try:
                await page.set_content(html, wait_until="domcontentloaded")
                await page.evaluate("document.fonts.ready")
                height = await page.evaluate(
                    "Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))"
                )
                await page.set_viewport_size({"width": 860, "height": max(1, int(height))})
                await page.screenshot(path=str(output), full_page=True)
            finally:
                await page.close()
        return str(output)
