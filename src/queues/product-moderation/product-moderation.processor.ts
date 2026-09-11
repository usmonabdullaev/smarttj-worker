import { AskRequestProvider, AskRequestPurpose } from '@smarttj/core/ai';
import { NotificationType, ProductStatus } from '@prisma/client';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { HttpClientService } from '../../infra/http-client/http-client.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LoggerService } from '../../logger/logger.service';
import {
  PRODUCT_MODERATE_PROMPT,
  productModerateParser,
} from '../../ai/prompts/product-moderate.prompt';
import { ConfigService } from '@nestjs/config';

@Processor('product-moderation')
export class ProductModerationProcessor extends WorkerHost {
  private readonly logger = new LoggerService(ProductModerationProcessor.name);
  private readonly AIServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
    private readonly httpClient: HttpClientService,
    private readonly config: ConfigService,
  ) {
    super();

    this.AIServiceUrl = this.config.getOrThrow('AI_SERVICE_URL');
  }

  async process(job: Job) {
    switch (job.name) {
      case 'moderate-product': {
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
          this.logger.warn(`[BullMQ] - Product ${id} not found`, {
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

        const { data } = await this.httpClient.post<{ data: string }>(
          'ai-service',
          `${this.AIServiceUrl}/ask`,
          {
            context: PRODUCT_MODERATE_PROMPT,
            prompt,
            purpose: AskRequestPurpose.PRODUCT_MODERATE,
            temperature: 0.2,
            provider: AskRequestProvider.GEMINI,
          },
          {
            timeout: 20000,
          },
        );

        const { text, ok } = productModerateParser(data);

        if (ok === undefined || !text) {
          this.logger.warn(`[BullMQ] - AI response error`, {
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
}
