const { body, status } = JSON.parse(process.env.AUDIT_TEST_RESPONSE);

globalThis.fetch = async () => new Response(body, {
  status,
  headers: { 'content-type': 'application/json' },
});
