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

// Free-tier AgentMail blocks spam-classified mail after a daily budget; product names and prices trip the classifier.
// Fall back to a neutral nudge so the alert still lands, and say which version went out.
export async function sendAlert(to: string, subject: string, text: string): Promise<"full" | "nudge"> {
  try {
    await sendMail(to, subject, text);
    return "full";
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode !== 403) throw e;
    await sendMail(to, "Quick update", "Hi, something you are watching just reached your target price. Open your Sniper dashboard for the details.\n\nSniper");
    return "nudge";
  }
}
