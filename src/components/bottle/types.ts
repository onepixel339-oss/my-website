/**
 * src/components/bottle/types.ts
 * ---------------------------------------------------------------------------
 * Shared types for the bottle-app components. Kept in a standalone module
 * (rather than re-exported from a component) so the composer, the received-
 * bottle card, and the feed can all import it without creating circular
 * component-level dependencies.
 * ---------------------------------------------------------------------------
 */

/**
 * Public bottle shape returned by POST /api/messages and /api/messages/exchange
 * (and GET /api/messages). Anonymous — no author identifiers, no moderation
 * metadata, no private token.
 *
 * The three reaction counters are included so the reveal screen can render the
 * starting counts next to each reaction button (and update them optimistically
 * as the reader reacts). The public feed is free to ignore them.
 */
export interface PublicBottle {
  id: string;
  content: string;
  category: string | null;
  language: string;
  created_at: string;
  reveal_count: number;
  reported_count: number;
  is_hidden: boolean;
  reactions_heart: number;
  reactions_smile: number;
  reactions_feel_you: number;
}
