/**
 * Plan 7.7 (/ask): every question was sent on its own, so a follow-up such as
 * "and last month?" reached the model with nothing to refer to. The page now
 * sends the earlier turns of the conversation with each new question, and
 * "Clear" starts a new one.
 *
 * The answers are stubbed: this checks what the page sends, not what a model says.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

interface AskBody {
  question: string;
  history?: Array<{ question: string; answer: string }>;
}

test('ask: a follow-up carries the conversation so far; Clear starts afresh', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `afu-${stamp}`,
      slug: `afu-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@afu.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  const sent: AskBody[] = [];
  await page.route('**/nlq/ask', async (route) => {
    const body = route.request().postDataJSON() as AskBody;
    sent.push(body);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ answer: `Answer ${sent.length}`, sources: [], costUsd: 0, toolCalls: [] }),
    });
  });

  await page.goto('/ask');
  const ask = async (question: string, n: number) => {
    await page.getByTestId('ask-input').fill(question);
    await page.getByTestId('ask-send').click();
    await expect(page.getByTestId('ask-answer')).toHaveCount(n);
  };

  await ask('How is revenue doing?', 1);
  await ask('and last month?', 2);
  await ask('why?', 3);

  expect(sent[0]).toEqual({ question: 'How is revenue doing?' });
  expect(sent[1]).toEqual({ question: 'and last month?', history: [{ question: 'How is revenue doing?', answer: 'Answer 1' }] });
  expect(sent[2]!.history).toEqual([
    { question: 'How is revenue doing?', answer: 'Answer 1' },
    { question: 'and last month?', answer: 'Answer 2' },
  ]);

  // The page says the conversation is being carried.
  await expect(page.getByTestId('ask-context-note')).toContainText('follow-up');

  // Clear: the next question stands alone again.
  await page.getByTestId('ask-clear').click();
  await ask('What is trending down?', 1);
  expect(sent[3]).toEqual({ question: 'What is trending down?' });
});
