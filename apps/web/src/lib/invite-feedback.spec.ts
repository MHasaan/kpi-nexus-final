import { describe, expect, test } from 'vitest';

import { inviteExpiryText, inviteFeedback } from './invite-feedback';

describe('inviteFeedback', () => {
  test('says "sent" when the mail server took it', () => {
    const fb = inviteFeedback({ emailSent: true }, 'nadia@example.test');
    expect(fb.tone).toBe('success');
    expect(fb.title).toBe('Invitation sent');
    expect(fb.description).toContain('nadia@example.test');
    expect(fb.url).toBeNull();
  });

  test('never says "sent" when the email did not go out', () => {
    const fb = inviteFeedback({ emailSent: false }, 'nadia@example.test');
    expect(fb.tone).toBe('error');
    expect(fb.title).not.toBe('Invitation sent');
    expect(fb.title).toContain('not sent');
    expect(fb.description).toContain('Resend');
  });

  test('with a link in hand, an unsent invitation says to share it', () => {
    const fb = inviteFeedback({ emailSent: false, acceptUrl: 'https://app.test/accept-invitation?token=t' }, 'nadia@example.test');
    expect(fb.description).toContain('Share the link');
    expect(fb.url).toBe('https://app.test/accept-invitation?token=t');
  });

  test('keeps the link when one is given alongside a sent email (development)', () => {
    expect(inviteFeedback({ emailSent: true, acceptUrl: 'https://app.test/x' }, 'a@b.c').url).toBe('https://app.test/x');
  });

  test('an older server that does not report emailSent is taken as sent', () => {
    expect(inviteFeedback({}, 'a@b.c').tone).toBe('success');
  });
});

describe('inviteExpiryText', () => {
  test("writes the time on the reader's clock and names the clock", () => {
    expect(inviteExpiryText('2026-11-26T08:53:40.000Z', 'en-US', 'Asia/Karachi')).toBe('Nov 26, 2026, 1:53 PM GMT+5');
    expect(inviteExpiryText('2026-11-26T08:53:40.000Z', 'en-US', 'UTC')).toBe('Nov 26, 2026, 8:53 AM UTC');
  });

  test('a time that crosses midnight for the reader is on their day', () => {
    expect(inviteExpiryText('2026-11-26T21:30:00.000Z', 'en-US', 'Asia/Karachi')).toBe('Nov 27, 2026, 2:30 AM GMT+5');
  });

  test('an unreadable time is left out', () => {
    expect(inviteExpiryText('not a date')).toBe('');
  });
});
