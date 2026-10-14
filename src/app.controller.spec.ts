import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(() => {
    controller = new AppController();
  });

  it('returns an ok status payload', () => {
    expect(controller.getStatus()).toEqual({
      message: 'NestJS app is running',
      status: 'ok',
    });
  });
});
