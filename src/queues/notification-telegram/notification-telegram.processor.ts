import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { QUEUE_KEYS } from '@smarttj/core';
import { Job } from 'bullmq';

import { TelegramBlockedException } from '../../infra/telegram/dto/send.dto';
import { TelegramService } from '../../infra/telegram/telegram.service';
import { LoggerService } from '../../logger/logger.service';
import { SendRequest } from './dto/send-request.dto';

@Processor(QUEUE_KEYS.NOTIFICATION_TELEGRAM, {
  concurrency: 5, // Обрабатывать до 5 задач параллельно
  limiter: {
    max: 25,
    duration: 1000,
  },
})
export class NotificationTelegramProcessor extends WorkerHost {
  private readonly logger = new LoggerService(
    NotificationTelegramProcessor.name,
  );

  constructor(private readonly telegram: TelegramService) {
    super();
  }

  async process(job: Job<SendRequest>) {
    switch (job.name) {
      case QUEUE_KEYS.NOTIFICATION_TELEGRAM: {
        const dto = job.data;

        try {
          await this.telegram.sendMessage({
            chatId: dto.telegramId,
            text: dto.message,
          });

          this.logger.log(
            `Notification sended to Telegram for ID ${dto.telegramId}`,
            undefined,
            { save: false },
          );
        } catch (error) {
          if (error instanceof TelegramBlockedException) {
            // Disable user telegram ID

            return;
          }

          throw error;
        }

        break;
      }
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job.id} of queue [${QUEUE_KEYS.NOTIFICATION_TELEGRAM}] failed. Reason: ${err.message}`,
      err,
    );
  }
}
