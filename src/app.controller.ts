import { Controller, Get } from '@nestjs/common';

@Controller('status')
export class AppController {
  @Get()
  getStatus() {
    return {
      message: 'NestJS app is running',
      status: 'ok',
    };
  }
}
