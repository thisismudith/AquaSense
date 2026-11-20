import { APP_NAME } from '@/constants/app';

describe('CP01 path alias', () => {
  it('resolves @/ imports in node project', () => {
    expect(APP_NAME).toBe('SipSure');
  });
});
