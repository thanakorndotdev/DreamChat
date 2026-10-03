/**
 * Shapes of what the API sends back, shared by the backend (apps/api) and the two frontends
 * (apps/web, apps/admin) so neither side drifts.
 */
import type { Plan } from './plans';
import type { Economy } from './tokens';

export type Subscription = {
  planId: string;
  source: 'stripe' | 'code' | 'admin' | 'promptpay';
  status: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
};

export type Coupon = {
  code: string;
  kind: 'percent' | 'amount' | 'free_days';
  value: number;
  duration: 'once' | 'forever';
  planIds: string[] | null;
  maxRedemptions: number | null;
  expiresAt: number | null;
  active: boolean;
  note: string;
  stripeCouponId: string | null;
  createdAt: number;
  redemptions: number;
};

export type BillingState = {
  plans: Plan[];
  plan: Plan;
  subscription: (Subscription & { live: boolean }) | null;
  /** Free replies used today. */
  usage: { chat: number };
  tokens: { balance: number; checkedInToday: boolean };
  economy: Economy;
  payments: boolean;
  /** Not signed in: only the plans are real; everything else is the free plan's defaults. */
  guest: boolean;
};

export type AdminUser = {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: number;
  /** Null until they sign in after this was added. */
  lastLoginAt: number | null;
  /** Last request with their session, to the minute; before tracking began, their newest chat update. */
  lastSeenAt: number | null;
  email: string | null;
  phone: string | null;
  consented: boolean;
  birthdate: string | null;
  age: number | null;
  guardianConsent: boolean;
  marketing: boolean;
  /** How many chats they keep; the admin opens them one at a time (AdminChat), read-only. */
  characters: number;
  sessions: number;
  tokens: number;
  plan: { id: string; name: string; source: string; until: number; status: string; cancelAtPeriodEnd: boolean } | null;
};

/** One chat in an account's list, for the admin; the messages come only when it is opened. */
export type AdminChatSummary = {
  id: string;
  name: string;
  /** Set when the chat was started from the public catalog. */
  sourceId: string | null;
  messages: number;
  lastText: string;
  updatedAt: number;
};

/** A chat as the admin reads it. Read-only: no admin endpoint changes a chat. */
export type AdminChat = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  userName: string;
  messages: { sender: 'user' | 'char'; text: string; failed?: boolean }[];
  updatedAt: number;
};

export type AdminSettings = {
  cf_account_id: string;
  /** Never sent back; only whether one is saved here or in env. */
  cf_api_token_set: 'admin' | 'env' | null;
  cf_model: string;
  cf_fallback_model: string;
  /** What the server actually uses right now; `fallback` is the Workers AI model that takes over when Ollama fails. */
  active: { backend: 'ollama' | 'workers-ai' | null; model: string | null; fallback: string | null };
  env: { cf_account_id: string; cf_model: string; cf_fallback_model: string; default_model: string };
  stripe: { secretKey: 'live' | 'test' | null; webhook: boolean; appUrl: string };
};

export type Throttle = { key: string; count: number; limit: number; until: number; blocked: boolean };

/** An admin's frozen copy of a chat, kept as evidence until expiresAt. */
export type AdminEvidence = {
  id: number;
  /** Null once the account is deleted; the username stays. */
  userId: number | null;
  username: string;
  chatName: string;
  messages: number;
  note: string;
  savedBy: string;
  createdAt: number;
  expiresAt: number;
};

export type AdminEvidenceDetail = AdminEvidence & { chat: AdminChat };
