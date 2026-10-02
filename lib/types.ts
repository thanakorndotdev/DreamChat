export type Message = {
  sender: 'user' | 'char';
  text: string;
  /** Set when the reply could not be generated; never sent back to the model. */
  failed?: boolean;
  /** The failure was the plan's limit, so the chat offers an upgrade instead of a retry. */
  limited?: boolean;
};

export type StoryNote = {
  text: string;
  /** Message count at the end of the stretch this note summarizes. */
  upTo: number;
};

export type Character = {
  id: string;
  name: string;
  role: string;
  gender: string;
  age: string;
  job: string;
  avatar: string;
  personality: string;
  firstMessage: string;
  userName: string;
  userRole: string;
  userGender?: string;
  userAge?: string;
  userJob?: string;
  /** 18+ mode: crude language and mature themes, using lib/lexicon.ts. */
  adult?: boolean;
  messages: Message[];
  /** Story notes the AI jots down as the chat goes on, so it remembers what scrolled out of its window. */
  notes?: StoryNote[];
  /** How many messages (from the start) the notes already cover. */
  notedUpTo?: number;
  /** Catalog entry this chat was started from; set means the character isn't the player's own creation. */
  sourceId?: string;
  updatedAt: number;
};

export type OllamaStatus = 'checking' | 'online' | 'offline';
