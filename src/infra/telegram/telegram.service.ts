import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

import { LoggerService } from '../../logger/logger.service';
import { SendTelegramOptions, TelegramBlockedException } from './dto/send.dto';

@Injectable()
export class TelegramService {
  private readonly logger = new LoggerService(TelegramService.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async sendMessage(options: SendTelegramOptions) {
    const {
      chatId,
      text,
      parseMode = 'HTML',
      buttons,
      disableNotification = false,
    } = options;

    const payload: Record<string, any> = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_notification: disableNotification,
    };

    if (buttons?.length) {
      payload.reply_markup = {
        inline_keyboard: [
          buttons.map((btn) => ({
            text: btn.text,
            url: btn.url,
            callback_data: btn.callbackData,
          })),
        ],
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        this.handleTelegramError(data, chatId);
      }
    } catch (error) {
      if (error instanceof TelegramBlockedException) {
        throw error;
      }

      this.logger.error(
        `Network or unexpected error while sending to ${chatId}`,
        error,
      );

      throw error;
    }
  }

  private handleTelegramError(data: any, chatId: string | number) {
    const errorCode = data?.error_code;
    const description = data?.description || '';

    if (
      errorCode === 403 ||
      (errorCode === 400 && description.includes('chat not found'))
    ) {
      throw new TelegramBlockedException(chatId);
    }

    if (errorCode === 429) {
      const retryAfter = data?.parameters?.retry_after || 1;

      this.logger.warn(`Rate limit hit. Retry after ${retryAfter}s`);

      throw new Error(`Rate limit exceeded. Retry after ${retryAfter}s`);
    }

    throw new Error(`Telegram API error [${errorCode}]: ${description}`);
  }
}
