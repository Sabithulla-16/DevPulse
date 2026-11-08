import type { AiPricingModel } from '../../shared/types';
import type { AiIntelligenceRepository } from '../../database/repositories/AiIntelligenceRepository';

export const DEFAULT_AI_PRICING: Array<Omit<AiPricingModel, 'id' | 'updatedAt'>> = [
  // Local / Free models
  { provider: 'ollama', modelPattern: '*', inputCostPerMillion: 0.0, outputCostPerMillion: 0.0, isCustom: false },
  
  // OpenAI
  { provider: 'openai', modelPattern: 'gpt-4o-mini*', inputCostPerMillion: 0.15, outputCostPerMillion: 0.60, isCustom: false },
  { provider: 'openai', modelPattern: 'gpt-4o*', inputCostPerMillion: 2.50, outputCostPerMillion: 10.00, isCustom: false },
  { provider: 'openai', modelPattern: 'gpt-4-turbo*', inputCostPerMillion: 10.00, outputCostPerMillion: 30.00, isCustom: false },
  { provider: 'openai', modelPattern: 'gpt-4*', inputCostPerMillion: 30.00, outputCostPerMillion: 60.00, isCustom: false },
  { provider: 'openai', modelPattern: 'gpt-3.5-turbo*', inputCostPerMillion: 0.50, outputCostPerMillion: 1.50, isCustom: false },
  { provider: 'openai', modelPattern: 'o1*', inputCostPerMillion: 15.00, outputCostPerMillion: 60.00, isCustom: false },
  { provider: 'openai', modelPattern: 'o3-mini*', inputCostPerMillion: 1.10, outputCostPerMillion: 4.40, isCustom: false },
  
  // Anthropic
  { provider: 'anthropic', modelPattern: 'claude-3-5-sonnet*', inputCostPerMillion: 3.00, outputCostPerMillion: 15.00, isCustom: false },
  { provider: 'anthropic', modelPattern: 'claude-3-7-sonnet*', inputCostPerMillion: 3.00, outputCostPerMillion: 15.00, isCustom: false },
  { provider: 'anthropic', modelPattern: 'claude-3-5-haiku*', inputCostPerMillion: 0.80, outputCostPerMillion: 4.00, isCustom: false },
  { provider: 'anthropic', modelPattern: 'claude-3-opus*', inputCostPerMillion: 15.00, outputCostPerMillion: 75.00, isCustom: false },
  { provider: 'anthropic', modelPattern: 'claude-3-haiku*', inputCostPerMillion: 0.25, outputCostPerMillion: 1.25, isCustom: false },

  // Google Gemini
  { provider: 'gemini', modelPattern: 'gemini-1.5-flash*', inputCostPerMillion: 0.075, outputCostPerMillion: 0.30, isCustom: false },
  { provider: 'gemini', modelPattern: 'gemini-1.5-pro*', inputCostPerMillion: 1.25, outputCostPerMillion: 5.00, isCustom: false },
  { provider: 'gemini', modelPattern: 'gemini-2.0-flash*', inputCostPerMillion: 0.10, outputCostPerMillion: 0.40, isCustom: false },

  // Groq
  { provider: 'groq', modelPattern: 'llama-3.3-70b*', inputCostPerMillion: 0.59, outputCostPerMillion: 0.79, isCustom: false },
  { provider: 'groq', modelPattern: 'llama-3.1-8b*', inputCostPerMillion: 0.05, outputCostPerMillion: 0.08, isCustom: false },
  { provider: 'groq', modelPattern: 'mixtral-8x7b*', inputCostPerMillion: 0.24, outputCostPerMillion: 0.24, isCustom: false },
  { provider: 'groq', modelPattern: 'deepseek-r1*', inputCostPerMillion: 0.55, outputCostPerMillion: 2.19, isCustom: false },

  // DeepSeek Direct
  { provider: 'deepseek', modelPattern: 'deepseek-chat*', inputCostPerMillion: 0.14, outputCostPerMillion: 0.28, isCustom: false },
  { provider: 'deepseek', modelPattern: 'deepseek-reasoner*', inputCostPerMillion: 0.55, outputCostPerMillion: 2.19, isCustom: false },

  // Catch-all fallbacks
  { provider: '*', modelPattern: '*', inputCostPerMillion: 1.00, outputCostPerMillion: 2.00, isCustom: false }
];

export class CostCalculator {
  private customPricing: AiPricingModel[] = [];

  constructor(private readonly aiRepo?: AiIntelligenceRepository) {
    if (aiRepo) {
      this.refreshFromRepository();
    }
  }

  public refreshFromRepository(): void {
    if (!this.aiRepo) return;
    try {
      this.customPricing = this.aiRepo.getPricing();
    } catch {
      this.customPricing = [];
    }
  }

  public getPricingCatalog(): AiPricingModel[] {
    const defaultList: AiPricingModel[] = DEFAULT_AI_PRICING.map((p, idx) => ({
      id: `default-${idx}`,
      ...p,
      updatedAt: 0
    }));

    // If custom pricing exists, merge/override defaults
    const combined = [...this.customPricing];
    for (const def of defaultList) {
      if (!combined.some(c => c.provider.toLowerCase() === def.provider.toLowerCase() && c.modelPattern.toLowerCase() === def.modelPattern.toLowerCase())) {
        combined.push(def);
      }
    }
    return combined;
  }

  public matchPricing(provider: string, model: string): { inputCostPerMillion: number; outputCostPerMillion: number; isUnknown?: boolean } {
    const provLower = (provider || '').trim().toLowerCase();
    const modLower = (model || '').trim().toLowerCase();

    // Check if provider is ollama or local
    if (provLower === 'ollama' || provLower === 'local' || provLower === 'lmstudio') {
      return { inputCostPerMillion: 0.0, outputCostPerMillion: 0.0, isUnknown: false };
    }

    // 1. Check custom pricing first
    for (const rule of this.customPricing) {
      if (this.matchesRule(rule.provider, rule.modelPattern, provLower, modLower)) {
        return {
          inputCostPerMillion: rule.inputCostPerMillion,
          outputCostPerMillion: rule.outputCostPerMillion,
          isUnknown: false
        };
      }
    }

    // 2. Check default catalog
    for (const def of DEFAULT_AI_PRICING) {
      if (this.matchesRule(def.provider, def.modelPattern, provLower, modLower)) {
        return {
          inputCostPerMillion: def.inputCostPerMillion,
          outputCostPerMillion: def.outputCostPerMillion,
          isUnknown: false
        };
      }
    }

    return { inputCostPerMillion: 0.5, outputCostPerMillion: 1.5, isUnknown: true };
  }

  public calculateCost(provider: string, model: string, promptTokens: number, completionTokens: number): number {
    const pricing = this.matchPricing(provider, model);
    const inCost = (Math.max(0, promptTokens) / 1_000_000) * pricing.inputCostPerMillion;
    const outCost = (Math.max(0, completionTokens) / 1_000_000) * pricing.outputCostPerMillion;
    return Math.round((inCost + outCost) * 10000) / 10000;
  }

  private matchesRule(ruleProvider: string, rulePattern: string, actualProvider: string, actualModel: string): boolean {
    const rProv = ruleProvider.trim().toLowerCase();
    const rPat = rulePattern.trim().toLowerCase();

    // Check provider match
    if (rProv !== '*' && rProv !== actualProvider) {
      return false;
    }

    // Check model pattern match
    if (rPat === '*' || rPat === actualModel) {
      return true;
    }

    if (rPat.endsWith('*')) {
      const prefix = rPat.slice(0, -1);
      return actualModel.startsWith(prefix);
    }

    if (rPat.startsWith('*')) {
      const suffix = rPat.slice(1);
      return actualModel.endsWith(suffix);
    }

    return actualModel.includes(rPat);
  }
}
