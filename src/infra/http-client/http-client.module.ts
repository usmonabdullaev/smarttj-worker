import { DynamicModule, Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { HttpClientModuleOptions } from './interfaces/http-client-options.interface';
import { HttpClientService } from './http-client.service';

@Global()
@Module({})
export class HttpClientModule {
  static forRoot(options: HttpClientModuleOptions): DynamicModule {
    return {
      module: HttpClientModule,
      imports: [HttpModule],
      providers: [
        {
          provide: 'HTTP_CLIENT_OPTIONS',
          useValue: options,
        },
        HttpClientService,
      ],
      exports: [HttpClientService],
    };
  }
}
