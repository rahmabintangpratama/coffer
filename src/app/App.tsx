import copy from "@design/copy.en.json";

// M0 placeholder. The real shell, routing and theme arrive in M1.
export function App() {
  return (
    <div className="cf-root">
      <div className="cf-app">
        <main>
          <h1>{copy.app.name}</h1>
        </main>
      </div>
    </div>
  );
}
