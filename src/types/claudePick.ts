// Types for the claude_picks table — AI-curated/manually-starred deal picks.

export type ClaudePickMarketStatus = 'active' | 'pending' | 'off-market';
export type ClaudePickPriority = 'high' | 'medium' | 'low';

export interface ClaudePick {
  id: string;
  dealId: string;
  marketStatus: ClaudePickMarketStatus;
  priority: ClaudePickPriority;
  marketNote: string | null;
  analysisNote: string | null;
  checkedAt: string; // ISO date (YYYY-MM-DD)
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaudePickInput {
  dealId: string;
  marketStatus?: ClaudePickMarketStatus;
  priority?: ClaudePickPriority;
  marketNote?: string | null;
  analysisNote?: string | null;
  addedBy?: string;
}
