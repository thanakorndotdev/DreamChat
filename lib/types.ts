export type Message = {
  sender: 'user' | 'char';
  text: string;
  /** Set when the reply could not be generated; never sent back to the model. */
  failed?: boolean;
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
  messages: Message[];
  updatedAt: number;
};

export type OllamaStatus = 'checking' | 'online' | 'offline';
