import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { QUEUE_KEYS } from '@smarttj/core';
import { Queue } from 'bullmq';

import { SendRequest } from './dto/send-request.dto';

@Injectable()
export class NotificationService {
  constructor(
    @InjectQueue(QUEUE_KEYS.NOTIFICATION)
    private readonly queue: Queue,
  ) {}

  async send(dto: SendRequest) {
    await this.queue.add(QUEUE_KEYS.NOTIFICATION, dto, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }
}
