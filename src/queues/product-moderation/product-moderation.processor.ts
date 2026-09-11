import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { NotificationType, ProductStatus } from '@prisma/client';
import { Job } from 'bullmq';
import {
  AskRequestProvider,
  AskRequestPurpose,
  QUEUE_KEYS,
} from '@smarttj/core';

import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LoggerService } from '../../logger/logger.service';
import {
  PRODUCT_MODERATE_PROMPT,
  productModerateParser,
} from '../../ai/prompts/product-moderate.prompt';
import { AIService } from '../../ai/ai.service';

@Processor(QUEUE_KEYS.PRODUCT_MODERATION)
export class ProductModerationProcessor extends WorkerHost {
  private readonly logger = new LoggerService(ProductModerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
    private readonly aiService: AIService,
  ) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case QUEUE_KEYS.PRODUCT_MODERATION: {
        const id = job.data.productId;
        const state = await job.getState();
        const isLastAttempt = job.attemptsMade + 1 === job.opts.attempts;

        const product = await this.prisma.product.findUnique({
          where: { id },
          include: {
            variants: {
              include: {
                _count: {
                  select: { images: true },
                },
                attributes: {
                  include: {
                    attribute: true,
                    attributeValue: true,
                  },
                },
              },
            },
            partner: true,
            category: true,
            brand: true,
            model: true,
          },
        });

        if (!product) {
          this.logger.warn(`Product ${id} not found`, {
            productId: id,
            state,
            attempt: job.attemptsMade + 1,
            attempts: job.opts.attempts,
          });

          throw new Error('Product not found');
        }

        if (!product.categoryId) {
          await this.notification.send({
            userId: product.partner.userId,
            type: NotificationType.PRODUCT_MODERATION,
            title: 'Товар не прошел проверку',
            message: `Ваш товар «${product.title}» требует доработки. Укажите категорию товара перед повторной отправкой на модерацию.`,
            metadata: {
              productId: product.id,
            },
          });

          return;
        }

        if (!product.brandId) {
          await this.notification.send({
            userId: product.partner.userId,
            type: NotificationType.PRODUCT_MODERATION,
            title: 'Товар не прошел проверку',
            message: `Ваш товар «${product.title}» требует доработки. Укажите бренд товара перед повторной отправкой на модерацию.`,
            metadata: {
              productId: product.id,
            },
          });

          return;
        }

        if (!product.regionId) {
          await this.notification.send({
            userId: product.partner.userId,
            type: NotificationType.PRODUCT_MODERATION,
            title: 'Товар не прошел проверку',
            message: `Ваш товар «${product.title}» требует доработки. Укажите регион размещения товара перед повторной отправкой на модерацию.`,
            metadata: {
              productId: product.id,
            },
          });

          return;
        }

        const requiredAttributes = await this.prisma.attribute.findMany({
          where: { categoryId: product.categoryId, required: true },
          select: { id: true },
        });

        for (let i = 0; i < product.variants.length; i++) {
          const variant = product.variants[i];

          if (variant._count.images === 0) {
            await this.notification.send({
              userId: product.partner.userId,
              type: NotificationType.PRODUCT_MODERATION,
              title: 'Товар не прошел проверку',
              message: `Ваш товар «${product.title}» требует доработки. Добавьте хотя бы одно изображение товара перед повторной отправкой на модерацию.`,
              metadata: {
                productId: product.id,
              },
            });

            return;
          }

          const providedIds = new Set(
            variant.attributes.map((attr) => attr.attributeId),
          );

          const missing = requiredAttributes.filter(
            (attr) => !providedIds.has(attr.id),
          );

          if (missing.length > 0) {
            await this.notification.send({
              userId: product.partner.userId,
              type: NotificationType.PRODUCT_MODERATION,
              title: 'Товар не прошел проверку',
              message: `Ваш товар «${product.title}» требует доработки. Заполните все обязательные характеристики товара перед повторной отправкой на модерацию.`,
              metadata: {
                productId: product.id,
              },
            });

            return;
          }
        }

        const prompt = JSON.stringify({
          title: product.title,
          description: product.description,
          category: product.category?.name,
          brand: product.brand?.name,
          model: product.model?.name,
        });

        const { data } = await this.aiService.ask(
          {
            context: PRODUCT_MODERATE_PROMPT,
            prompt,
            purpose: AskRequestPurpose.PRODUCT_MODERATE,
            temperature: 0.2,
            provider: AskRequestProvider.GEMINI,
          },
          { timeout: 20000 },
        );

        const { text, ok } = productModerateParser(data);

        if (ok === undefined || !text) {
          this.logger.warn('AI response error', {
            text: text,
            state,
            attempt: job.attemptsMade + 1,
            attempts: job.opts.attempts,
          });

          if (isLastAttempt) {
            await this.prisma.product.update({
              where: { id },
              data: {
                status: ProductStatus.MANUAL_MODERATION,
              },
            });

            return;
          }

          throw new Error('AI moderation error');
        }

        if (!ok) {
          await this.notification.send({
            userId: product.partner.userId,
            type: NotificationType.PRODUCT_MODERATION,
            title: 'Товар не прошел проверку',
            message: text,
            metadata: {
              productId: product.id,
            },
          });

          await this.prisma.product.update({
            where: { id: product.id },
            data: { status: ProductStatus.INACTIVE },
          });

          return;
        }

        await this.prisma.product.update({
          where: { id },
          data: {
            status: ProductStatus.ACTIVE,
            publishedAt: new Date(),
          },
        });
      }
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job.id} of queue [${QUEUE_KEYS.PRODUCT_MODERATION}] failed. Reason: ${err.message}`,
      err,
    );
  }
}
