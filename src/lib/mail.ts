import { AgentMailClient } from "agentmail";

const agentmail = process.env.AGENTMAIL_API_KEY ? new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY }) : null;
export const INBOX = process.env.AGENTMAIL_INBOX ?? "";

export async function sendMail(to: string, subject: string, text: string, html?: string) {
  if (!agentmail || !INBOX) {
    console.log(`[mail disabled] ${subject}`);
    return null;
  }
  return agentmail.inboxes.messages.send(INBOX, { to, subject, text, html });
}

export async function replyTo(messageId: string, text: string) {
  if (!agentmail || !INBOX) return null;
  return agentmail.inboxes.messages.reply(INBOX, messageId, { text });
}
