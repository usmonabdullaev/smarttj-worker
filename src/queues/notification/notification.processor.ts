import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../../database/prisma/prisma.service';
import { SendRequest } from './dto/send-request.dto';

@Processor('notification', {
  concurrency: 5, // Обрабатывать до 5 задач параллельно
})
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<SendRequest>): Promise<void> {
    switch (job.name) {
      case 'notification': {
        const dto = job.data;
        this.logger.log(`Processing job ${job.id} for user ${dto.userId}`);

        const user = await this.prisma.user.findUnique({
          where: { id: dto.userId },
        });

        if (!user) {
          this.logger.warn(
            `User ${dto.userId} not found. Attempt ${job.attemptsMade + 1}/${job.opts.attempts}`,
          );
          // Бросаем ошибку, чтобы сработал backoff retry из Producer
          throw new Error(`User with ID ${dto.userId} not found`);
        }

        await this.prisma.notification.create({
          data: {
            userId: dto.userId,
            type: dto.type,
            title: dto.title,
            message: dto.message,
            metadata: dto.metadata ?? {},
          },
        });

        this.logger.log(`Notification created for user ${dto.userId}`);
        break;
      }
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  // BullMQ lifecycle events
  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job.id} of queue [notification] failed. Reason: ${err.message}`,
      err.stack,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed successfully.`);
  }
}
