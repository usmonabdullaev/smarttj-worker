import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { NotificationTelegramProcessor } from './notification-telegram.processor';
import { NotificationTelegramService } from './notification-telegram.service';
import { TelegramModule } from '../../infra/telegram/telegram.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notification-telegram',
    }),
    TelegramModule,
  ],
  providers: [NotificationTelegramProcessor, NotificationTelegramService],
  exports: [NotificationTelegramService],
})
export class NotificationTelegramModule {}
