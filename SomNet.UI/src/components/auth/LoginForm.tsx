import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import {
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
} from '@/types/auth';

type AuthMode = 'login' | 'register';

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function LoginForm() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setConfirmPassword('');
  }

  function validateRegisterForm(): string | null {
    const trimmedUsername = username.trim();

    if (trimmedUsername.length < MIN_USERNAME_LENGTH || trimmedUsername.length > MAX_USERNAME_LENGTH) {
      return `Username must be between ${MIN_USERNAME_LENGTH} and ${MAX_USERNAME_LENGTH} characters.`;
    }

    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      return 'Username may only contain letters, numbers, underscores, and hyphens.';
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    if (password !== confirmPassword) {
      return 'Passwords do not match.';
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (mode === 'register') {
      const validationError = validateRegisterForm();
      if (validationError) {
        setError(validationError);
        setIsSubmitting(false);
        return;
      }

      const result = await register({
        username,
        password,
        displayName: displayName.trim() || undefined,
      });
      setIsSubmitting(false);

      if (!result.success) {
        setError(result.error ?? 'Registration failed.');
      }

      return;
    }

    const success = await login({ username, password });
    setIsSubmitting(false);

    if (!success) {
      setError('Sign in failed. Check your credentials and ensure the API is running.');
    }
  }

  const isRegister = mode === 'register';

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.22),_transparent_50%)]" />

      <Card
        title={isRegister ? 'Create your SomNet account' : 'Welcome to SomNet'}
        description={
          isRegister
            ? 'Register to sign in and manage your sessions.'
            : 'Sign in to choose manual or automatic operation.'
        }
        className="relative w-full max-w-md"
      >
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            label="Username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your username"
          />

          {isRegister ? (
            <Input
              label="Display name"
              name="displayName"
              autoComplete="nickname"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Optional — defaults to username"
            />
          ) : null}

          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isRegister ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Enter your password'}
          />

          {isRegister ? (
            <Input
              label="Confirm password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your password"
            />
          ) : null}

          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <Button type="submit" fullWidth disabled={isSubmitting}>
            {isSubmitting
              ? isRegister
                ? 'Creating account…'
                : 'Signing in…'
              : isRegister
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            className="font-medium text-indigo-300 hover:text-indigo-200"
            onClick={() => switchMode(isRegister ? 'login' : 'register')}
          >
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </p>

        {!isRegister ? (
          <p className="mt-3 text-center text-xs text-slate-500">
            Dev account: <span className="text-slate-400">demo / demo</span>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
