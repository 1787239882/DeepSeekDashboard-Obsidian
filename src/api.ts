/** ================================================
 *  DeepSeek API 网络层
 *  对应 Swift 端的 DeepSeekAPIService
 * ================================================ */

import {
  BalanceResponse,
  BalanceInfo,
  MonthlyCostInfo,
  CostDay,
  CostUsage,
  DailyUsageStats,
  ModelUsageSummary,
  ModelUsage,
  AmountResponse,
  AmountModel,
  AmountEntry,
  CacheHitRate,
  DailyCachePoint,
} from './types';

export class DeepSeekAPI {
  private apiKey: string;
  private platformToken: string | null;

  constructor(apiKey: string, platformToken: string | null = null) {
    this.apiKey = apiKey;
    this.platformToken = platformToken;
  }

  updateCredentials(apiKey: string, platformToken: string | null): void {
    this.apiKey = apiKey;
    this.platformToken = platformToken;
  }

  /** 查询余额 */
  async fetchBalance(): Promise<BalanceInfo> {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
    });
    this.checkResponse(res);
    const data: BalanceResponse = await res.json();
    if (!data.balance_infos?.length) {
      throw new Error('无余额数据');
    }
    return data.balance_infos[0];
  }

  /** 查询月度消费 */
  async fetchMonthlyCost(): Promise<MonthlyCostInfo> {
    if (!this.platformToken) {
      throw new Error('未配置平台 Token');
    }
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());

    const url = `https://platform.deepseek.com/api/v0/usage/cost?month=${month}&year=${year}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.platformToken}`,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://platform.deepseek.com/usage',
      },
    });
    this.checkResponse(res);
    interface CostTotalItem { model?: string; usage?: CostUsage[]; }
    const decoded: { data?: { biz_data?: Array<{ currency?: string; days?: CostDay[]; total?: CostTotalItem[] }> } } = await res.json();

    const bizData = decoded?.data?.biz_data?.[0];
    if (!bizData) {
      throw new Error('无消费数据');
    }

    const currency = bizData.currency ?? 'CNY';
    let totalSpent = 0;
    let dailyCount = 0;
    const dailyUsage: DailyUsageStats[] = [];
    const days = bizData.days ?? [];

    for (const day of days) {
      dailyCount++;
      let dayPrompt = 0, dayCompletion = 0, dayRequests = 0;
      let daySpent = 0;
      let dayCacheHit = 0, dayCacheMiss = 0;

      if (day.data) {
        for (const item of day.data) {
          if (item.usage) {
            for (const u of item.usage) {
              if (u.amount) {
                const val = parseFloat(u.amount);
                if (!isNaN(val)) daySpent += val;
              }
              dayPrompt += u.prompt_tokens ?? 0;
              dayCompletion += u.completion_tokens ?? 0;
              dayRequests += u.requests ?? 0;
              if (u.type === 'PROMPT_CACHE_HIT_TOKEN') {
                dayCacheHit += u.prompt_tokens ?? 0;
              } else if (u.type === 'PROMPT_CACHE_MISS_TOKEN') {
                dayCacheMiss += u.prompt_tokens ?? 0;
              }
            }
          }
        }
      }
      totalSpent += daySpent;
      dailyUsage.push({
        date: day.date,
        promptTokens: dayPrompt,
        completionTokens: dayCompletion,
        requests: dayRequests,
        promptCacheHitTokens: dayCacheHit,
        promptCacheMissTokens: dayCacheMiss,
      });
    }

    // 今日各模型消费
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayModelCost: Record<string, number> = {};
    for (const day of days) {
      if (day.date === todayStr && day.data) {
        for (const item of day.data) {
          const modelName = item.model ?? '未知模型';
          let cost = 0;
          for (const u of item.usage ?? []) {
            if (u.amount) {
              const val = parseFloat(u.amount);
              if (!isNaN(val)) cost += val;
            }
          }
          todayModelCost[modelName] = (todayModelCost[modelName] ?? 0) + cost;
        }
      }
    }

    // 汇总
    let grandTotalTokens = 0;
    const modelSummary: ModelUsageSummary[] = [];
    if (bizData.total) {
      for (const t of bizData.total) {
        let totalTokens = 0, totalRequests = 0;
        if (t.usage) {
          for (const u of t.usage) {
            totalTokens += (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
            totalRequests += u.requests ?? 0;
          }
        }
        grandTotalTokens += totalTokens;
        modelSummary.push({
          model: t.model ?? '未知模型',
          totalTokens,
          totalRequests,
          percentage: 0,
        });
      }
    }
    if (grandTotalTokens > 0) {
      for (const m of modelSummary) {
        m.percentage = (m.totalTokens / grandTotalTokens) * 100;
      }
    }

    return {
      currency,
      totalSpent,
      dailyCount,
      dailyUsage,
      modelSummary,
      todayModelCost,
    };
  }

  /** 查询用量明细 + 缓存命中率 */
  async fetchUsage(): Promise<{ usage: ModelUsage[]; proCacheRate: number | null; flashCacheRate: number | null; dailyCachePoints: DailyCachePoint[] }> {
    if (!this.platformToken) {
      throw new Error('未配置平台 Token');
    }
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());

    const url = `https://platform.deepseek.com/api/v0/usage/amount?month=${month}&year=${year}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.platformToken}`,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://platform.deepseek.com/usage',
      },
    });
    this.checkResponse(res);

    // We need to also fetch cost data for daily cache points
    // The amount endpoint gives per-model totals but not daily breakdown for cache
    // Let's parse what we can from the amount response and also fetch cost for daily cache
    const amountData: AmountResponse = await res.json();
    const totals = amountData?.data?.biz_data?.total ?? [];

    const result: ModelUsage[] = [];
    let proCacheHit = 0, proCacheMiss = 0;
    let flashCacheHit = 0, flashCacheMiss = 0;

    for (const modelEntry of totals) {
      const modelName = modelEntry.model ?? '';
      const usage = modelEntry.usage ?? [];
      let totalTokens = 0, totalRequests = 0;
      const isFlash = modelName.toLowerCase().includes('flash');

      for (const entry of usage) {
        const type = entry.type ?? '';
        const amt = entry.amount ? parseInt(entry.amount) : 0;
        if (isNaN(amt)) continue;

        switch (type) {
          case 'PROMPT_TOKEN':
          case 'PROMPT_CACHE_HIT_TOKEN':
          case 'PROMPT_CACHE_MISS_TOKEN':
          case 'RESPONSE_TOKEN':
            totalTokens += amt;
            break;
          case 'REQUEST':
            totalRequests += amt;
            break;
        }

        switch (type) {
          case 'PROMPT_CACHE_HIT_TOKEN':
            if (isFlash) flashCacheHit += amt;
            else proCacheHit += amt;
            break;
          case 'PROMPT_CACHE_MISS_TOKEN':
            if (isFlash) flashCacheMiss += amt;
            else proCacheMiss += amt;
            break;
        }
      }
      result.push({ model: modelName, totalTokens, totalRequests });
    }

    const proRate = (proCacheHit + proCacheMiss) > 0
      ? (proCacheHit / (proCacheHit + proCacheMiss)) * 100 : null;
    const flashRate = (flashCacheHit + flashCacheMiss) > 0
      ? (flashCacheHit / (flashCacheHit + flashCacheMiss)) * 100 : null;

    // 从 cost API 获取每日缓存命中率
    const dailyCachePoints = await this.fetchDailyCachePoints();

    return { usage: result, proCacheRate: proRate, flashCacheRate: flashRate, dailyCachePoints };
  }

  /** 从 cost API 提取每日缓存命中率曲线 */
  private async fetchDailyCachePoints(): Promise<DailyCachePoint[]> {
    try {
      const cost = await this.fetchMonthlyCost();
      return cost.dailyUsage
        .map(d => {
          const total = d.promptCacheHitTokens + d.promptCacheMissTokens;
          if (total === 0) return null;
          return { date: d.date, rate: (d.promptCacheHitTokens / total) * 100 };
        })
        .filter((d): d is DailyCachePoint => d !== null)
        .slice(-7);
    } catch {
      return [];
    }
  }

  /** 检查 HTTP 响应状态 */
  private checkResponse(res: Response): void {
    if (res.status === 401 || res.status === 403) {
      throw new Error('API Key 无效或已过期');
    }
    if (res.status === 429) {
      throw new Error('请求频率过高，请稍后再试');
    }
    if (res.status >= 500) {
      throw new Error(`服务器错误 (${res.status})`);
    }
    if (!res.ok) {
      throw new Error(`HTTP 错误 (${res.status})`);
    }
  }
}
