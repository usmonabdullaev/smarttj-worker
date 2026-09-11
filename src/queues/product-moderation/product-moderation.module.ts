import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ProductModerationProcessor } from './product-moderation.processor';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'product-moderation',
    }),
    NotificationModule,
  ],
  providers: [ProductModerationProcessor],
})
export class ProductModerationModule {}
