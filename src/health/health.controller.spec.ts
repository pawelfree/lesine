import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  function createController(isUp: boolean) {
    const databaseService = {
      ping: jest.fn().mockResolvedValue(isUp),
    } as unknown as DatabaseService;
    return new HealthController(databaseService);
  }

  function createResponse() {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    return { status, json } as unknown as Response & {
      status: jest.Mock;
      json: jest.Mock;
    };
  }

  it('returns ok for the liveness check', () => {
    const controller = createController(true);
    expect(controller.getLiveness()).toEqual({ status: 'ok' });
  });

  it('returns 200 and ok when the database is reachable', async () => {
    const controller = createController(true);
    const response = createResponse();

    await controller.getDatabaseHealth(response);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(response.json).toHaveBeenCalledWith({ status: 'ok' });
  });

  it('returns 503 and error when the database is unreachable', async () => {
    const controller = createController(false);
    const response = createResponse();

    await controller.getDatabaseHealth(response);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(response.json).toHaveBeenCalledWith({ status: 'error' });
  });
});
