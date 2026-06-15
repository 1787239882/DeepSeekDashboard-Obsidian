/** ================================================
 *  DeepSeek Dashboard — Obsidian Plugin 入口
 *  对应 Swift 端的 DeepSeekMenubarApp + AppViewModel
 *  支持 iPad / iPhone / Desktop
 * ================================================ */

import { Plugin, addIcon } from 'obsidian';
import { DeepSeekSettingTab, PluginSettings, DEFAULT_SETTINGS } from './settings';
import { DeepSeekDashboardView, VIEW_TYPE } from './view';
import { DeepSeekAPI } from './api';
import {
  BalanceInfo,
  MonthlyCostInfo,
  ModelUsage,
  DailyCachePoint,
  parseBalance,
  currencySymbol,
} from './types';

// DeepSeek 图标（简洁的「DS」文字图案）
const DEEPSEEK_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="4"/>
  <path d="M30 65 L50 25 L70 65" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
  <path d="M38 50 L62 50" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
</svg>`;

export default class DeepSeekDashboardPlugin extends Plugin {
  settings: PluginSettings;
  private api: DeepSeekAPI;

  // 仪表盘数据
  balance: BalanceInfo | null = null;
  monthlyCost: MonthlyCostInfo | null = null;
  usageStats: ModelUsage[] = [];
  proCacheRate: number | null = null;
  flashCacheRate: number | null = null;
  dailyCachePoints: DailyCachePoint[] = [];
  lastUpdated: Date | null = null;
  loading = false;
  error: string | null = null;

  private statusBarItem: any = null;
  private autoRefreshTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.api = new DeepSeekAPI(this.settings.apiKey, this.settings.platformToken);

    // 注册自定义图标
    addIcon('deepseek', DEEPSEEK_ICON);

    // ---- Ribbon 图标（桌面 + iPad 都有）----
    this.addRibbonIcon('deepseek', 'DeepSeek Dashboard', async () => {
      await this.openDashboardView();
    });

    // ---- 命令 ----
    this.addCommand({
      id: 'open-deepseek-dashboard',
      name: '打开 DeepSeek Dashboard',
      callback: async () => { await this.openDashboardView(); },
    });
    this.addCommand({
      id: 'refresh-deepseek-data',
      name: '刷新 DeepSeek 数据',
      callback: async () => { await this.refreshAll(); },
    });

    // ---- 注册视图 ----
    this.registerView(VIEW_TYPE, leaf => new DeepSeekDashboardView(leaf, this));

    // ---- 设置面板 ----
    this.addSettingTab(new DeepSeekSettingTab(this.app, this));

    // ---- 状态栏（iPad / iPhone / 桌面都有）----
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass('ds-status-bar');

    // ---- 启动自动刷新 ----
    this.startAutoRefresh();

    // ---- 首页立即刷新 ----
    this.refreshAll();

    // ---- 点击状态栏打开仪表盘 ----
    this.statusBarItem.addEventListener('click', () => {
      this.openDashboardView();
    });
  }

  onunload(): void {
    this.stopAutoRefresh();
    if (this.statusBarItem) {
      this.statusBarItem.remove();
      this.statusBarItem = null;
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 更新 API 凭据 */
  updateAPI(): void {
    this.api.updateCredentials(this.settings.apiKey, this.settings.platformToken);
  }

  /** 打开仪表盘视图（支持 iPad 移动端） */
  async openDashboardView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    // 桌面端用右侧边栏，移动端 fallback 到 split
    const isMobile = (this.app as any).isMobile || false;
    let leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      // 移动端没有右侧边栏，使用 split 创建新的叶子
      leaf = this.app.workspace.getLeaf(
        isMobile ? (true as any) : false
      );
    }
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  /** 刷新全部数据 */
  async refreshAll(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.updateStatusBar();

    try {
      const results = await Promise.allSettled([
        this.refreshBalance(),
        this.refreshMonthlyCost(),
        this.refreshUsage(),
      ]);

      const errors: string[] = [];
      for (const result of results) {
        if (result.status === 'rejected') {
          errors.push(result.reason?.message || String(result.reason));
        }
      }
      if (errors.length > 0 && !this.balance) {
        this.error = errors.join('; ');
      }

      this.lastUpdated = new Date();
    } catch (e) {
      this.error = e?.message || '未知错误';
    }

    this.loading = false;
    this.updateStatusBar();

    // 刷新已打开的仪表盘视图
    this.refreshViews();
  }

  private async refreshBalance(): Promise<void> {
    if (!this.settings.apiKey) return;
    this.balance = await this.api.fetchBalance();
  }

  private async refreshMonthlyCost(): Promise<void> {
    if (!this.settings.platformToken) return;
    this.monthlyCost = await this.api.fetchMonthlyCost();
  }

  private async refreshUsage(): Promise<void> {
    if (!this.settings.platformToken) return;
    const result = await this.api.fetchUsage();
    this.usageStats = result.usage;
    this.proCacheRate = result.proCacheRate;
    this.flashCacheRate = result.flashCacheRate;
    this.dailyCachePoints = result.dailyCachePoints;
  }

  /** 刷新所有打开的仪表盘视图 */
  private refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view as DeepSeekDashboardView;
      view?.refreshView();
    }
  }

  /** 更新状态栏（桌面 + iPad 均实时可见） */
  updateStatusBar(): void {
    if (!this.statusBarItem) return;

    this.statusBarItem.empty();

    if (this.loading) {
      this.statusBarItem.createSpan({ text: 'DS ···' });
      return;
    }

    if (this.balance) {
      const balanceValue = parseBalance(this.balance);
      const sym = currencySymbol(this.balance.currency);
      const isLow = balanceValue < this.settings.lowBalanceThreshold;

      // 用文字 + 颜色表达，更醒目
      const label = this.statusBarItem.createSpan();
      if (isLow) {
        label.setText(`DS ⚠ ${sym}${this.balance.total_balance}`);
        label.addClass('ds-sb-warn');
      } else {
        label.setText(`DS ${sym}${this.balance.total_balance}`);
        label.addClass('ds-sb-ok');
      }
    } else if (this.error) {
      this.statusBarItem.createSpan({ text: 'DS ⚠' }).addClass('ds-sb-warn');
    } else {
      this.statusBarItem.createSpan({ text: 'DS ⚙' }).addClass('ds-sb-muted');
    }
  }

  /** 启动自动刷新 */
  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.autoRefreshTimer = window.setInterval(async () => {
      await this.refreshAll();
    }, this.settings.refreshInterval * 1000);
  }

  /** 重启自动刷新 */
  restartAutoRefresh(): void {
    this.startAutoRefresh();
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshTimer !== null) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
}
