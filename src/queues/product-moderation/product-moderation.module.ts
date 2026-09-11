import { BullModule } from '@nestjs/bullmq';
import { QUEUE_KEYS } from '@smarttj/core';
import { Module } from '@nestjs/common';

import { ProductModerationProcessor } from './product-moderation.processor';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_KEYS.PRODUCT_MODERATION,
    }),
    NotificationModule,
  ],
  providers: [ProductModerationProcessor],
})
export class ProductModerationModule {}
