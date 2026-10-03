import type { AdminChat } from '@longrak/shared/api-types';
import { imageSrc } from './api';

/** A chat's messages in the web app's bubbles, read-only. */
export default function ChatLog({ chat, username }: { chat: AdminChat; username: string }) {
  return (
    <div className="admin-chat-log">
      {chat.messages.length === 0 && <p className="admin-loading">ยังไม่มีข้อความ</p>}
      {chat.messages.map((m, i) => (
        <div key={i} className={`msg ${m.sender === 'user' ? 'msg-user' : 'msg-char'}`}>
          {m.sender === 'char' && chat.avatar && <img className="msg-avatar" src={imageSrc(chat.avatar)} alt="" />}
          <div className="bubble">
            <span className="admin-char-meta">
              {m.sender === 'user' ? chat.userName || username : chat.name}
              {m.failed ? ' (ส่งไม่สำเร็จ)' : ''}
            </span>
            {'\n'}
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
}
