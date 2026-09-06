import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { NotificationProcessor } from './notification.processor';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notification',
    }),
  ],
  providers: [NotificationProcessor, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
