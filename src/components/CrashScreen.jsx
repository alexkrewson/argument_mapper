/**
 * Fallback for the top-level error boundary in main.jsx.
 *
 * A render error otherwise leaves a white screen, which a tester reports as
 * "it didn't load" — indistinguishable from a network failure or a bad install,
 * and impossible to act on. This says what happened, reassures about the thing
 * people actually worry about (their saved work), and offers the two recoveries
 * that help. The stack reaches Sentry either way.
 *
 * Its own file because main.jsx has no exports, and a component defined there
 * silently breaks Vite's fast refresh for the whole entry module.
 */
export default function CrashScreen({ resetError }) {
  return (
    <div className="crash-screen" role="alert">
      <h1>Something went wrong</h1>
      <p>
        iDisagree hit an error and stopped. Your saved productive disagreements are
        unaffected — they're stored on our servers, not in this screen.
      </p>
      <div className="crash-screen-actions">
        <button type="button" onClick={resetError}>Try again</button>
        <button type="button" onClick={() => window.location.reload()}>Reload the app</button>
      </div>
    </div>
  );
}
