/** ================================================
 *  DeepSeek API 类型定义
 *  对应 Swift 端的 BalanceInfo, MonthlyCost, ModelUsage
 * ================================================ */

// ===== 余额 (api.deepseek.com/user/balance) =====
export interface BalanceResponse {
  is_available: boolean;
  balance_infos: BalanceInfo[];
}

export interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

/** 货币符号 */
export function currencySymbol(currency: string): string {
  return currency === 'CNY' ? '¥' : '$';
}

/** 转为数值 */
export function parseBalance(balance: BalanceInfo): number {
  return parseFloat(balance.total_balance) || 0;
}

// ===== 月消费 (platform.deepseek.com/api/v0/usage/cost) =====
export interface CostResponse {
  data?: { biz_data?: BizData[] };
}

export interface BizData {
  currency?: string;
  days?: CostDay[];
  total?: CostModelTotal[];
}

export interface CostDay {
  date: string;
  data?: CostModelItem[];
}

export interface CostModelItem {
  model?: string;
  usage?: CostUsage[];
}

export interface CostUsage {
  type?: string;
  amount?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  requests?: number;
}

export interface CostModelTotal {
  model?: string;
  usage?: CostUsage[];
}

export interface DailyUsageStats {
  date: string;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
}

export interface ModelUsageSummary {
  model: string;
  totalTokens: number;
  totalRequests: number;
  percentage: number;
}

export interface MonthlyCostInfo {
  currency: string;
  totalSpent: number;
  dailyCount: number;
  dailyUsage: DailyUsageStats[];
  modelSummary: ModelUsageSummary[];
  todayModelCost: Record<string, number>;
}

// ===== 用量明细 (platform.deepseek.com/api/v0/usage/amount) =====
export interface AmountResponse {
  data?: { biz_data?: { total?: AmountModel[] } };
}

export interface AmountModel {
  model?: string;
  usage?: AmountEntry[];
}

export interface AmountEntry {
  type?: string;
  amount?: string;
}

export interface ModelUsage {
  model: string;
  totalTokens: number;
  totalRequests: number;
}

// ===== 缓存命中率 =====
export interface CacheHitRate {
  family: string;
  rate: number | null;
}

/** 每日缓存命中率数据点 */
export interface DailyCachePoint {
  date: string;
  rate: number;
}
