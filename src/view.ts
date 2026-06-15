/** ================================================
 *  DeepSeek Dashboard 仪表盘视图
 *  对应 Swift 端的 MainContentView + BalanceCard
 * ================================================ */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import DeepSeekDashboardPlugin from './main';
import {
  BalanceInfo,
  MonthlyCostInfo,
  ModelUsage,
  CacheHitRate,
  DailyCachePoint,
  currencySymbol,
  parseBalance,
} from './types';

export const VIEW_TYPE = 'deepseek-dashboard-view';

export class DeepSeekDashboardView extends ItemView {
  plugin: DeepSeekDashboardPlugin;
  private rootEl: HTMLElement;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DeepSeekDashboardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'DeepSeek Dashboard';
  }

  getIcon(): string {
    return 'brain';
  }

  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl;
    await this.render();
    // 自动刷新
    this.startViewRefresh();
  }

  onClose(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    return super.onClose();
  }

  private startViewRefresh(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = window.setInterval(() => {
      this.plugin.refreshAll();
    }, this.plugin.settings.refreshInterval * 1000);
  }

  async render(): Promise<void> {
    const el = this.rootEl;
    el.empty();
    el.addClass('deepseek-dashboard');

    // 顶部导航栏
    el.createDiv({ cls: 'ds-header' }, header => {
      header.createSpan({ cls: 'ds-header-title', text: 'DeepSeek Dashboard' });
      const last = this.plugin.lastUpdated;
      header.createSpan({ cls: 'ds-header-time', text: last ? `更新: ${last.toLocaleTimeString()}` : '' });
    });

    // 内容区域
    const content = el.createDiv({ cls: 'ds-content' });

    // 加载/错误/数据显示
    await this.renderContent(content);

    // 底部操作栏
    el.createDiv({ cls: 'ds-footer' }, footer => {
      const btnRefresh = footer.createEl('button', { cls: 'ds-btn', text: '⟳ 刷新' });
      btnRefresh.addEventListener('click', async () => {
        btnRefresh.setText('⟳ 刷新中…');
        btnRefresh.setAttr('disabled', 'true');
        await this.plugin.refreshAll();
        await this.render();
        btnRefresh.setText('⟳ 刷新');
        btnRefresh.removeAttribute('disabled');
      });

      const btnSettings = footer.createEl('button', { cls: 'ds-btn', text: '⚙ 设置' });
      btnSettings.addEventListener('click', () => {
        // 打开 Obsidian 设置并选择插件的设置面板
        (this.app as any).setting.open();
        (this.app as any).setting.openTabById('deepseek-dashboard');
      });

      const btnWeb = footer.createEl('button', { cls: 'ds-btn', text: '🌐 控制台' });
      btnWeb.addEventListener('click', () => {
        window.open('https://platform.deepseek.com/usage');
      });
    });
  }

  private async renderContent(content: HTMLElement): Promise<void> {
    const { balance, monthlyCost, usageStats, proCacheRate, flashCacheRate, dailyCachePoints } = this.plugin;

    // ---- 余额+消费卡片 ----
    if (balance) {
      this.renderBalanceCard(content, balance, monthlyCost);
    } else if (this.plugin.loading) {
      content.createDiv({ cls: 'ds-loading', text: '正在获取数据…' });
    } else if (this.plugin.error) {
      content.createDiv({ cls: 'ds-error', text: this.plugin.error });
    } else {
      content.createDiv({ cls: 'ds-hint', text: '请先在设置中配置 API Key' });
    }

    // ---- 缓存命中率 ----
    if (proCacheRate !== null || flashCacheRate !== null) {
      this.renderCacheRates(content, proCacheRate, flashCacheRate);
    }

    // ---- 每日缓存命中率趋势 ----
    if (dailyCachePoints.length > 0) {
      this.renderCacheTrend(content, dailyCachePoints);
    }

    // ---- 用量明细 ----
    if (usageStats.length > 0) {
      this.renderUsageStats(content, usageStats);
    }
  }

  private renderBalanceCard(
    parent: HTMLElement,
    balance: BalanceInfo,
    monthlyCost: MonthlyCostInfo | null
  ): void {
    const card = parent.createDiv({ cls: 'ds-card' });
    const balanceValue = parseBalance(balance);
    const sym = currencySymbol(balance.currency);
    const isLow = balanceValue < this.plugin.settings.lowBalanceThreshold;

    // 余额
    const balSection = card.createDiv({ cls: 'ds-card-section' });
    balSection.createDiv({ cls: 'ds-card-icon ' + (isLow ? 'ds-icon-warn' : 'ds-icon-ok') });
    const balInfo = balSection.createDiv({ cls: 'ds-card-info' });
    balInfo.createDiv({
      cls: 'ds-card-value' + (isLow ? ' ds-value-warn' : ''),
      text: `${sym}${balance.total_balance}`,
    });
    balInfo.createDiv({ cls: 'ds-card-label', text: '账户余额' });

    // 分隔线
    card.createDiv({ cls: 'ds-divider-v' });

    // 月消费
    const costSection = card.createDiv({ cls: 'ds-card-section' });
    costSection.createDiv({ cls: 'ds-card-icon', text: '💳' });
    const costInfo = costSection.createDiv({ cls: 'ds-card-info' });

    if (monthlyCost) {
      const csym = monthlyCost.currency === 'CNY' ? '¥' : '$';
      costInfo.createDiv({ cls: 'ds-card-value', text: `${csym}${monthlyCost.totalSpent.toFixed(2)}` });
    } else {
      costInfo.createDiv({ cls: 'ds-card-value ds-value-muted', text: '—' });
    }
    costInfo.createDiv({ cls: 'ds-card-label', text: '本月消费' });
  }

  private renderCacheRates(
    parent: HTMLElement,
    proRate: number | null,
    flashRate: number | null
  ): void {
    const card = parent.createDiv({ cls: 'ds-card' });
    card.style.padding = '10px';

    const row = card.createDiv({ cls: 'ds-cache-row' });
    this.addCacheRateChip(row, 'Pro', proRate);
    row.createDiv({ cls: 'ds-divider-v' });
    this.addCacheRateChip(row, 'Flash', flashRate);
  }

  private addCacheRateChip(parent: HTMLElement, family: string, rate: number | null): void {
    const chip = parent.createDiv({ cls: 'ds-cache-chip' });
    chip.createDiv({ cls: 'ds-cache-label', text: family });
    if (rate !== null) {
      const color = rate >= 50 ? 'var(--color-green)' : (rate >= 30 ? 'var(--color-orange)' : 'var(--color-red)');
      chip.createDiv({
        cls: 'ds-cache-value',
        text: `${rate.toFixed(0)}%`,
        attr: { style: `color: ${color}` },
      });
    } else {
      chip.createDiv({ cls: 'ds-cache-value', text: '—' });
    }
  }

  private renderCacheTrend(parent: HTMLElement, points: DailyCachePoint[]): void {
    const card = parent.createDiv({ cls: 'ds-card' });
    card.style.padding = '12px';

    card.createDiv({ cls: 'ds-section-title', text: '📈 缓存命中率（近7天）' });
    const avg = points.reduce((s, p) => s + p.rate, 0) / points.length;

    const bars = card.createDiv({ cls: 'ds-trend-bars' });
    for (const p of points) {
      const dayLabel = p.date.slice(5);
      const color = p.rate >= 50 ? 'var(--color-green)' : (p.rate >= 30 ? 'var(--color-orange)' : 'var(--color-red)');
      const item = bars.createDiv({ cls: 'ds-trend-item' });
      item.createDiv({ cls: 'ds-trend-date', text: dayLabel });
      item.createDiv({
        cls: 'ds-trend-value',
        text: `${p.rate.toFixed(0)}%`,
        attr: { style: `color: ${color}` },
      });
    }

    card.createDiv({ cls: 'ds-trend-avg', text: `日均 ${avg.toFixed(0)}%` });
  }

  private renderUsageStats(parent: HTMLElement, stats: ModelUsage[]): void {
    const card = parent.createDiv({ cls: 'ds-card' });
    card.style.padding = '0';

    // 折叠头
    const header = card.createDiv({ cls: 'ds-usage-header' });
    const toggle = header.createEl('span', { cls: 'ds-usage-toggle', text: '▶' });
    header.createEl('span', { cls: 'ds-usage-title', text: '用量明细' });

    const totalTokens = stats.reduce((s, m) => s + m.totalTokens, 0);
    const totalReqs = stats.reduce((s, m) => s + m.totalRequests, 0);
    header.createEl('span', {
      cls: 'ds-usage-summary',
      text: `${this.fmt(totalTokens)} · ${this.fmt(totalReqs)} 请求`,
    });

    // 展开内容
    const body = card.createDiv({ cls: 'ds-usage-body' });
    body.style.display = 'none';

    header.addEventListener('click', () => {
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      toggle.setText(isOpen ? '▶' : '▼');
    });

    // 每个模型的条目
    for (const model of stats) {
      const row = body.createDiv({ cls: 'ds-model-row' });
      row.createDiv({ cls: 'ds-model-name', text: model.model });

      // token
      row.createDiv({ cls: 'ds-model-stat' }, stat => {
        stat.createDiv({ cls: 'ds-stat-label', text: 'Tokens' });
        stat.createDiv({ cls: 'ds-stat-value', text: this.fmt(model.totalTokens) });
      });
      // 请求次数
      row.createDiv({ cls: 'ds-model-stat' }, stat => {
        stat.createDiv({ cls: 'ds-stat-label', text: '请求' });
        stat.createDiv({ cls: 'ds-stat-value', text: this.fmt(model.totalRequests) });
      });
      // 今日消费
      const todayCost = this.plugin.monthlyCost?.todayModelCost[model.model] ?? 0;
      if (todayCost > 0) {
        const sym = this.plugin.monthlyCost?.currency === 'CNY' ? '¥' : '$';
        row.createDiv({ cls: 'ds-model-stat' }, stat => {
          stat.createDiv({ cls: 'ds-stat-label', text: '今日' });
          stat.createDiv({ cls: 'ds-stat-value', text: `${sym}${todayCost.toFixed(2)}` });
        });
      }

      if (model.model !== stats[stats.length - 1].model) {
        row.createDiv({ cls: 'ds-divider-h' });
      }
    }
  }

  private fmt(n: number): string {
    return n.toLocaleString();
  }

  /** 外部调用：刷新视图 */
  async refreshView(): Promise<void> {
    await this.render();
  }
}
