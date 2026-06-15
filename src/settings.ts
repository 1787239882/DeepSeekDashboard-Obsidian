/** ================================================
 *  DeepSeek Dashboard 设置面板
 *  对应 Swift 端的 SettingsView + SetupView
 * ================================================ */

import { App, PluginSettingTab, Setting } from 'obsidian';
import DeepSeekDashboardPlugin from './main';

export interface PluginSettings {
  apiKey: string;
  platformToken: string;
  refreshInterval: number;       // 秒
  lowBalanceThreshold: number;   // 元
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: '',
  platformToken: '',
  refreshInterval: 60,
  lowBalanceThreshold: 5,
};

export class DeepSeekSettingTab extends PluginSettingTab {
  plugin: DeepSeekDashboardPlugin;

  constructor(app: App, plugin: DeepSeekDashboardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'DeepSeek Dashboard 设置' });

    // ---- API Key ----
    new Setting(containerEl)
      .setName('DeepSeek API Key')
      .setDesc('用于查询余额。可在 platform.deepseek.com 获取')
      .addText(cb =>
        cb
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async val => {
            this.plugin.settings.apiKey = val.trim();
            await this.plugin.saveSettings();
            this.plugin.updateAPI();
          })
      );

    // ---- 平台 Token ----
    new Setting(containerEl)
      .setName('平台 Token（可选）')
      .setDesc(createFragment(frag => {
        frag.appendText('用于获取月度消费与用量明细。');
        frag.createEl('br');
        frag.appendText('获取：登录 ');
        const a = frag.createEl('a', { href: 'https://platform.deepseek.com/usage', text: 'platform.deepseek.com' });
        a.setAttr('target', '_blank');
        frag.appendText(' → F12 → Application → Local Storage → 复制 userToken');
      }))
      .addText(cb =>
        cb
          .setPlaceholder('userToken...')
          .setValue(this.plugin.settings.platformToken)
          .onChange(async val => {
            this.plugin.settings.platformToken = val.trim();
            await this.plugin.saveSettings();
            this.plugin.updateAPI();
          })
      );

    // ---- 刷新间隔 ----
    new Setting(containerEl)
      .setName('自动刷新间隔')
      .setDesc(`当前: ${this.plugin.settings.refreshInterval} 秒`)
      .addSlider(cb =>
        cb
          .setLimits(15, 300, 15)
          .setValue(this.plugin.settings.refreshInterval)
          .setDynamicTooltip()
          .onChange(async val => {
            this.plugin.settings.refreshInterval = val;
            await this.plugin.saveSettings();
            this.plugin.restartAutoRefresh();
            this.display();
          })
      );

    // ---- 低余额阈值 ----
    new Setting(containerEl)
      .setName('低余额警告阈值')
      .setDesc(`余额低于 ¥${this.plugin.settings.lowBalanceThreshold} 时状态栏显示警告`)
      .addSlider(cb =>
        cb
          .setLimits(0, 50, 1)
          .setValue(this.plugin.settings.lowBalanceThreshold)
          .setDynamicTooltip()
          .onChange(async val => {
            this.plugin.settings.lowBalanceThreshold = val;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // ---- 手动刷新按钮 ----
    new Setting(containerEl)
      .setName('立即刷新')
      .setDesc('手动刷新所有数据')
      .addButton(cb =>
        cb
          .setButtonText('刷新')
          .onClick(async () => {
            cb.setButtonText('刷新中…');
            cb.setDisabled(true);
            await this.plugin.refreshAll();
            cb.setButtonText('刷新');
            cb.setDisabled(false);
          })
      );

    // ---- 注意事项 ----
    containerEl.createEl('h3', { text: '使用提示' });
    containerEl.createEl('p', {
      text: '• 余额始终显示在 Obsidian 底部状态栏（无需点击）',
    }).addClass('setting-item-description');
    containerEl.createEl('p', {
      text: '• 点击状态栏可快速打开仪表盘',
    }).addClass('setting-item-description');
    containerEl.createEl('p', {
      text: '• 首次使用时请在上方填写 API Key',
    }).addClass('setting-item-description');

    // ---- 仪表盘 ----
    containerEl.createEl('h3', { text: '仪表盘' });
    containerEl.createEl('p', {
      text: '点击左侧 Ribbon 栏的 DeepSeek 图标，或在命令面板中搜索"DeepSeek Dashboard"打开完整仪表盘。',
    }).addClass('setting-item-description');

    // ---- 致谢 ----
    containerEl.createEl('hr');
    const footer = containerEl.createEl('p');
    footer.addClass('setting-item-description');
    footer.setText(`基于 DeepSeekMenubar (Swift) 移植为 Obsidian 插件 · v${this.plugin.manifest.version}`);
  }
}
