/**
 * Tokens: what a reply costs once the plan's free messages run out, and what unlocks unlimited chat
 * with one character. Bought in packs, or earned by members who check in each day.
 */

export type TokenPack = {
  id: string;
  tokens: number;
  /** Satang. */
  price: number;
};

/** Admin-editable (the Tokens tab); the server enforces it. */
export type Economy = {
  /** Tokens per reply past the free messages. */
  messageCost: number;
  /** Tokens to chat with a character without limit; a catalog character may set its own price. */
  unlockPrice: number;
  packs: TokenPack[];
};

export const DEFAULT_ECONOMY: Economy = {
  messageCost: 10,
  unlockPrice: 3000,
  packs: [
    { id: 'p100', tokens: 100, price: 2_000 },
    { id: 'p1000', tokens: 1000, price: 5_000 },
  ],
};

/** The chat screen's view of one character. */
export type CharacterAccess = {
  unlocked: boolean;
  /** Free replies already used with this character. */
  freeUsed: number;
  unlockPrice: number;
};

/** /api/ai answers 402 with this when a reply would cost tokens (or there aren't enough). */
export type Paywall = {
  code: 'paywall';
  /** Which free allowance ran out. */
  reason: 'daily' | 'character';
  cost: number;
  balance: number;
  unlockPrice: number;
  message: string;
};

export const formatTokens = (n: number) => n.toLocaleString('th-TH');
