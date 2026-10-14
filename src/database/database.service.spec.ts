const queryMock = jest.fn();
const endMock = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: queryMock,
    end: endMock,
  })),
}));

import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  beforeEach(() => {
    queryMock.mockReset();
    endMock.mockReset();
  });

  it('returns true when the database responds', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const service = new DatabaseService();

    await expect(service.ping()).resolves.toBe(true);
    expect(queryMock).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns false when the database query fails', async () => {
    queryMock.mockRejectedValue(new Error('connection refused'));
    const service = new DatabaseService();

    await expect(service.ping()).resolves.toBe(false);
  });

  it('closes the pool on module destroy', async () => {
    endMock.mockResolvedValue(undefined);
    const service = new DatabaseService();

    await service.onModuleDestroy();

    expect(endMock).toHaveBeenCalled();
  });
});
