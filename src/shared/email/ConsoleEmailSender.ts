import type { EmailMessage, EmailSender } from './EmailSender.js';

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[email] to=${message.to} subject=${message.subject}\n${message.body}`);
  }
}
