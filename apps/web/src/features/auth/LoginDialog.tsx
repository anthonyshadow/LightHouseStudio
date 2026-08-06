import { useTheme } from '@emotion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { fetchDemoAuthConfig } from '../../adapters/api-client/authApi';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { useAuth } from '../../application/auth/AuthProvider';
import { Button } from '../../ui/primitives/Button';
import { TextField } from '../../ui/primitives/FormControls';
import { OverlayPanel } from '../../ui/primitives/OverlayPanel';

interface LoginDialogProps {
  readonly open: boolean;
  readonly message?: string | null;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export const LoginDialog = ({
  open,
  message,
  returnFocusRef,
  onClose,
  onSuccess,
}: LoginDialogProps) => {
  const theme = useTheme();
  const auth = useAuth();
  const loginRef = useRef<HTMLInputElement>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchDemoAuthConfig(controller.signal).then(
      (config) => {
        if (!controller.signal.aborted && config.prefill) {
          setLogin(config.prefill.login);
          setPassword(config.prefill.password);
        }
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [open]);

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    setError(null);
    try {
      if (await auth.login(login, password)) {
        setPassword('');
        onSuccess();
      }
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Login could not be completed. Try again.',
      );
    }
  };

  return (
    <OverlayPanel
      open={open}
      onClose={close}
      title="Log in to Lightframe"
      description="Use the local demo account to enter your private Studio."
      placement="bottom"
      size="standard"
      centered
      closeDisabled={auth.status === 'authenticating'}
      initialFocusRef={loginRef}
      {...(returnFocusRef ? { returnFocusRef } : {})}
      footer={
        <div css={{ display: 'flex', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button variant="quiet" disabled={auth.status === 'authenticating'} onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="lightframe-login-form"
            variant="primary"
            busy={auth.status === 'authenticating'}
          >
            {auth.status === 'authenticating' ? 'Logging in…' : 'Log in'}
          </Button>
        </div>
      }
    >
      <form
        id="lightframe-login-form"
        css={{ display: 'grid', gap: theme.space.md }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {message ? <p role="status">{message}</p> : null}
        <TextField
          ref={loginRef}
          label="Login"
          value={login}
          autoComplete="username"
          required
          disabled={auth.status === 'authenticating'}
          onChange={(event) => setLogin(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          autoComplete="current-password"
          required
          disabled={auth.status === 'authenticating'}
          error={error ?? undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
      </form>
    </OverlayPanel>
  );
};
