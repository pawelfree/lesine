import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  getLiveness() {
    return { status: 'ok' };
  }

  @Get('db')
  async getDatabaseHealth(@Res() res: Response) {
    const isUp = await this.databaseService.ping();
    const status = isUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(status).json({ status: isUp ? 'ok' : 'error' });
  }
}
