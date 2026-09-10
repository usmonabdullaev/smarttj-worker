export interface SendTelegramOptions {
  chatId: string | number;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  buttons?: Array<{ text: string; url?: string; callbackData: string }>;
  disableNotification?: boolean;
}

export class TelegramBlockedException extends Error {
  constructor(public readonly chatId: string | number) {
    super(`User ${chatId} blocked the bot or chat not found`);
  }
}
