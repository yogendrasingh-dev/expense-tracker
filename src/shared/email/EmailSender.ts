export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

// architecture.md §2, AA-3: emails are sent through this interface so a real provider can be
// wired in later with zero business-logic changes; the MVP implementation is a console-log stub.
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
