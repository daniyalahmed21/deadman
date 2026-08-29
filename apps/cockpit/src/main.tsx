import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import { Landing } from "./landing/Landing";

// Lazy-load the cockpit so the landing page (first paint for judges) does not
// ship recharts / framer-motion. They load only when you open /app.
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/app"
          element={
            <Suspense fallback={<div style={{ height: "100vh", background: "#f4f4f2" }} />}>
              <App />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
