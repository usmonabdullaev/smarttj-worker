import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { NotificationTelegramModule } from './queues/notification-telegram/notification-telegram.module';
import { NotificationModule } from './queues/notification/notification.module';
import { PrismaModule } from './database/prisma/prisma.module';
import { LoggerModule } from './logger/logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),

    LoggerModule,
    PrismaModule,

    NotificationModule,
    NotificationTelegramModule,
  ],
})
export class AppModule {}
