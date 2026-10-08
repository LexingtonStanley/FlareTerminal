import { MIN_PASSWORD_LENGTH, validateCredentials } from './validation';

describe('validateCredentials', () => {
  it('requires email and password', () => {
    expect(validateCredentials({ email: ' ', password: '' }, 'sign-in')).toEqual({
      email: 'Enter your email',
      password: 'Enter your password',
    });
  });

  it('rejects malformed emails', () => {
    expect(validateCredentials({ email: 'ada@', password: 'x' }, 'sign-in').email).toBe(
      'Enter a valid email'
    );
  });

  it('enforces password length on sign-up only', () => {
    const short = { email: 'ada@example.com', password: 'short' };
    expect(validateCredentials(short, 'sign-in')).toEqual({});
    expect(validateCredentials(short, 'sign-up').password).toBe(
      `Use at least ${MIN_PASSWORD_LENGTH} characters`
    );
  });

  it('accepts valid credentials', () => {
    expect(
      validateCredentials({ email: 'ada@example.com', password: 'correct-horse' }, 'sign-up')
    ).toEqual({});
  });
});
