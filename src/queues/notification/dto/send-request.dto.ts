import { NotificationType } from '@prisma/client';

export interface SendRequest {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: {
    [key: string]: any;
  };
}
