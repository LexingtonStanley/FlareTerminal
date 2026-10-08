import Constants from 'expo-constants';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import {
  validateCredentials,
  type AuthMode,
  type CredentialErrors,
} from '@/features/auth/validation';
import { useTheme } from '@/hooks/use-theme';

export default function SignInScreen() {
  const { signIn, signUp, isConfigured } = useAuth();
  const theme = useTheme();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === 'sign-up';

  async function submit() {
    const credentials = { email: email.trim(), password };
    const errors = validateCredentials(credentials, mode);
    setFieldErrors(errors);
    setFormError(null);
    setNotice(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    const result = isSignUp ? await signUp(credentials) : await signIn(credentials);
    setSubmitting(false);

    if (result.error) setFormError(result.error);
    else if (result.needsConfirmation) {
      setNotice('Check your email to confirm your account, then sign in.');
      setMode('sign-in');
    }
    // On success the session changes and the guard in _layout.tsx opens the app.
  }

  function toggleMode() {
    setMode(isSignUp ? 'sign-in' : 'sign-up');
    setFieldErrors({});
    setFormError(null);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll centered>
        <View style={styles.header}>
          <ThemedText type="subtitle" role="heading">
            {isSignUp ? 'Create account' : 'Sign in'}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{Constants.expoConfig?.name}</ThemedText>
        </View>

        {!isConfigured ? (
          <ThemedView type="backgroundElement" style={styles.banner}>
            <ThemedText type="smallBold">Backend not configured</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Copy .env.example to .env.local and add your Supabase URL and publishable key.
            </ThemedText>
          </ThemedView>
        ) : null}

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          secureTextEntry
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          textContentType={isSignUp ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {formError ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {formError}
          </ThemedText>
        ) : null}
        {notice ? <ThemedText type="small">{notice}</ThemedText> : null}

        <Button
          title={isSignUp ? 'Create account' : 'Sign in'}
          onPress={submit}
          loading={submitting}
          testID="sign-in-submit"
        />
        <Button
          title={isSignUp ? 'Have an account? Sign in' : 'New here? Create an account'}
          variant="secondary"
          onPress={toggleMode}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: Spacing.one, marginBottom: Spacing.two },
  banner: { gap: Spacing.one, padding: Spacing.three, borderRadius: Spacing.three },
});
