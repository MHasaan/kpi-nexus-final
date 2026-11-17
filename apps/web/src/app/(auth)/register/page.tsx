import { redirect } from 'next/navigation';

/**
 * There is one way to create an organisation: /signup. This address used to
 * hold a second, older form that skipped the setup wizard; it now only sends
 * old links and bookmarks to the right place.
 */
export default function RegisterPage(): never {
  redirect('/signup');
}
