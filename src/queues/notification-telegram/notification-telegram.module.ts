import { BullModule } from '@nestjs/bullmq';
import { QUEUE_KEYS } from '@smarttj/core';
import { Module } from '@nestjs/common';

import { NotificationTelegramProcessor } from './notification-telegram.processor';
import { TelegramModule } from '../../infra/telegram/telegram.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_KEYS.NOTIFICATION_TELEGRAM,
    }),
    TelegramModule,
  ],
  providers: [NotificationTelegramProcessor],
})
export class NotificationTelegramModule {}
