import { BullModule } from '@nestjs/bullmq';
import { QUEUE_KEYS } from '@smarttj/core';
import { Module } from '@nestjs/common';

import { NotificationProcessor } from './notification.processor';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_KEYS.NOTIFICATION,
    }),
  ],
  providers: [NotificationProcessor, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
