import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');

  const app = await NestFactory.createApplicationContext(AppModule);

  app.enableShutdownHooks();

  const handleShutdown = async (signal: string) => {
    logger.warn(`Received ${signal}. Shutting down worker gracefully...`);

    try {
      await app.close();
      logger.log('Worker shut down successfully.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  logger.log('🚀 smarttj-worker is running and waiting for jobs...');
}

bootstrap().catch((err) => {
  new Logger('WorkerFatal').error('Fatal error during worker bootstrap', err);
  process.exit(1);
});
