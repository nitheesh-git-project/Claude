"use client";

// Last resort: this catches a throw in the root layout itself, which is the
// one failure the ordinary error boundary cannot handle — at that point no
// layout has rendered, so this file has to supply its own <html> and <body>
// and cannot rely on a font variable, a stylesheet class, or an icon font
// existing. Everything here is inline for that reason.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
            The site failed to load. Please try again — if it keeps happening, let the
            clinic know.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "#0f766e",
              color: "#fff",
              border: "none",
              borderRadius: "0.75rem",
              padding: "0.625rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: "1.5rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.6875rem",
                color: "#94a3b8",
              }}
            >
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
