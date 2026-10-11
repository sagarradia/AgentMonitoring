export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  bad: 'That password is not right.',
  wait: 'Too many attempts. Wait a few minutes and try again.',
  config: 'APP_PASSWORD is not set on the server, so nobody can sign in.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const msg = e ? MESSAGES[e] : '';
  return (
    <main style={{ maxWidth: 380, margin: '12vh auto 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="brand">Agent Desk<small>Projects, agents and scorecards</small></div>
      <form method="post" action="/api/login" className="brief">
        <label htmlFor="password">Password</label>
        <p className="hint">This is a private tool. Enter the shared password to continue.</p>
        <input type="password" id="password" name="password" autoComplete="current-password" required autoFocus
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 9px', width: '100%' }} />
        {msg ? <div className="err">{msg}</div> : null}
        <div className="row"><button className="btn primary" type="submit">Sign in</button></div>
      </form>
    </main>
  );
}
