# DeepSeek Dashboard — Obsidian Plugin

> 基于 [DeepSeekMenubar](https://github.com/yourusername/DeepSeekMenubar) (Swift) 移植的 Obsidian 插件

## 功能

- **余额常驻显示** — Obsidian 底部状态栏实时显示 DeepSeek API 余额（无需点击）
- **低余额警告** — 余额低于阈值时状态栏黄色高亮
- **月度消费** — 当月 API 调用总消费
- **用量明细** — 按模型展示 Token 用量与请求次数
- **缓存命中率** — Pro/Flash 模型的缓存命中率 + 近7天趋势图
- **自动刷新** — 可配置间隔自动更新（默认 60 秒）
- **跨平台** — 支持桌面 / iPad / iPhone

## 安装

将 `deepseek-dashboard` 文件夹放入 Obsidian 的 `.obsidian/plugins/` 目录，然后：

1. 设置 → 第三方插件 → 开启 DeepSeek Dashboard
2. 填入 DeepSeek API Key（platform.deepseek.com 获取）
3. 可选：填入平台 Token 查看消费明细

## 技术栈

- Obsidian Plugin API
- TypeScript + esbuild
- DeepSeek API (REST)
