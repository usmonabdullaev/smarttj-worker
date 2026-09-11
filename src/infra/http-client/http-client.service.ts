import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as jwt from 'jsonwebtoken';

import { type HttpClientModuleOptions } from './interfaces/http-client-options.interface';
import { LoggerService } from '../../logger/logger.service';

@Injectable()
export class HttpClientService {
  private readonly logger = new LoggerService(HttpClientService.name);

  constructor(
    private readonly http: HttpService,
    @Inject('HTTP_CLIENT_OPTIONS')
    private readonly options: HttpClientModuleOptions,
  ) {}

  /**
   * Генерация M2M токена с временем жизни 60 секунд
   */
  private generateToken(targetService: string): string {
    return jwt.sign(
      {
        iss: this.options.serviceName,
        aud: targetService,
      },
      this.options.secret,
      { expiresIn: '60s', algorithm: 'HS256' },
    );
  }

  /**
   * Универсальный метод отправки внутреннего HTTP-запроса
   */
  async request<T = any>(
    targetService: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    const token = this.generateToken(targetService);

    const mergedConfig: AxiosRequestConfig = {
      ...config,
      timeout: config.timeout ?? 5000,
      headers: {
        ...(config.headers || {}),
        'x-internal-token': token,
        'Content-Type': 'application/json',
      },
    };

    try {
      const response = await firstValueFrom(this.http.request<T>(mergedConfig));
      return response.data;
    } catch (error) {
      this.handleAxiosError(error as AxiosError, targetService, config.url);
    }
  }

  // Удобные алиасы
  get<T = any>(
    targetService: string,
    url: string,
    config?: AxiosRequestConfig,
  ) {
    return this.request<T>(targetService, { ...config, method: 'GET', url });
  }

  post<T = any>(
    targetService: string,
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ) {
    return this.request<T>(targetService, {
      ...config,
      method: 'POST',
      url,
      data,
    });
  }

  patch<T = any>(
    targetService: string,
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ) {
    return this.request<T>(targetService, {
      ...config,
      method: 'PATCH',
      url,
      data,
    });
  }

  delete<T = any>(
    targetService: string,
    url: string,
    config?: AxiosRequestConfig,
  ) {
    return this.request<T>(targetService, { ...config, method: 'DELETE', url });
  }

  private handleAxiosError(
    error: AxiosError,
    targetService: string,
    url?: string,
  ): never {
    const status = error.response?.status || HttpStatus.SERVICE_UNAVAILABLE;
    const errorData = error.response?.data;

    this.logger.error(
      `[Internal HTTP Error] target: ${targetService} | url: ${url} | status: ${status}`,
      errorData || error.message,
    );

    // Пробрасываем ошибку дальше в NestJS пайплайн
    throw new HttpException(
      errorData || `Internal communication failure with ${targetService}`,
      status,
    );
  }
}
