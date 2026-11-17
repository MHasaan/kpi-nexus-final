'use client';

import { createContext, useContext, useRef, useState, type ComponentProps, type FormEvent } from 'react';

import { Button } from './ui';

const BusyContext = createContext(false);

type BusyFormProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
  /** The form's handler. While its promise is pending the form is busy and a second submit is ignored. */
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<unknown> | void;
};

/**
 * A form that knows it is being sent. Its `BusySubmit` button shows a spinner
 * and is disabled until the handler settles, so a slow save cannot be sent
 * twice by pressing the button again (plan 7.4).
 */
export function BusyForm({ onSubmit, children, ...rest }: BusyFormProps) {
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  async function handle(event: FormEvent<HTMLFormElement>) {
    if (sending.current) {
      event.preventDefault();
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      await onSubmit(event);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <BusyContext.Provider value={busy}>
      <form {...rest} onSubmit={(event) => void handle(event)}>
        {children}
      </form>
    </BusyContext.Provider>
  );
}

/** The submit button of a `BusyForm`. */
export function BusySubmit(props: Omit<ComponentProps<typeof Button>, 'type' | 'isLoading'>) {
  const busy = useContext(BusyContext);
  return <Button type="submit" isLoading={busy} {...props} />;
}
