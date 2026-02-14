
export interface ProductRow {
  [key: string]: string;
}

export interface TranslationStatus {
  total: number;
  completed: number;
  isProcessing: boolean;
  error?: string;
}

export type OptimizationMode = 'PROFESSIONAL' | 'SEO_HIGH' | 'HTML_CONTENT' | 'FACTUAL' | 'SEO_SLUG' | 'SHORT_DESCRIPTION' | 'SEO_KEYWORD';
export type StructureMode = 'SAME' | 'CUSTOM';

export type AIProvider = 'gemini' | 'openai';

export interface AIConfig {
  provider: AIProvider;
  geminiKey: string;
  openAiKey: string;
  openAiModel: string; // e.g., 'gpt-4o', 'gpt-4-turbo'
}

export const MODE_LABELS: Record<OptimizationMode, string> = {
  'PROFESSIONAL': 'שיווקי מקצועי (On-Page / Readability)',
  'SEO_HIGH': 'SEO אגרסיבי (Meta Title/Desc)',
  'HTML_CONTENT': 'תוכן/תיאור (שימור HTML + צפיפות מילות מפתח)',
  'SEO_SLUG': 'SEO Slug / URL (חובה: כולל מילת מפתח)',
  'SHORT_DESCRIPTION': 'תיאור קצר (Excerpt - Golden Start)',
  'FACTUAL': 'תרגום עובדתי נקי',
  'SEO_KEYWORD': 'Focus Keyword (מחקר מילות מפתח אוטומטי)'
};

// Columns that are highly recommended for SEO optimization
export const SEO_RECOMMENDED_PATTERNS = [
  "title", "name", "content", "description", "excerpt", "rank_math", "yoast", "seo", "keyword", "body", "slug", "url", "uri", "permalink", "תיאור", "שם", "כותרת", "short"
];

// Columns that should probably NOT be translated by default (IDs, Stocks, Prices)
export const NON_TRANS_PATTERNS = [
  "id", "sku", "parent", "status", "date", "price", "stock", "weight", "dimensions", "score", "cursor"
];

export const isRecommended = (column: string): boolean => {
  const c = column.toLowerCase();
  return SEO_RECOMMENDED_PATTERNS.some(p => c.includes(p.toLowerCase()));
};

export const isTechnical = (column: string): boolean => {
  const c = column.toLowerCase();
  return NON_TRANS_PATTERNS.some(p => c.includes(p.toLowerCase()));
};
