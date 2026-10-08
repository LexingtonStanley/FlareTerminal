export type AuthMode = 'sign-in' | 'sign-up';

export type Credentials = { email: string; password: string };

export type CredentialErrors = Partial<Record<keyof Credentials, string>>;

/** Applied to new accounts only, so existing users with older, shorter passwords can still sign in. */
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(
  { email, password }: Credentials,
  mode: AuthMode
): CredentialErrors {
  const errors: CredentialErrors = {};

  if (!email.trim()) errors.email = 'Enter your email';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email';

  if (!password) errors.password = 'Enter your password';
  else if (mode === 'sign-up' && password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  return errors;
}
