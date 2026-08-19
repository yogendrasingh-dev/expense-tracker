import type { EmailMessage, EmailSender } from '../../src/shared/email/EmailSender.js';

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  lastSentTo(to: string): EmailMessage | undefined {
    return this.sent.filter((message) => message.to === to).at(-1);
  }
}
