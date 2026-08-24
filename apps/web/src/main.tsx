import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { toastFromAnywhere } from "./components/Toast";
import { ThemeProvider } from "./context/ThemeContext";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // React Query's default (3 retries with exponential backoff) means a
    // real failure takes several seconds to surface at all - fine for a
    // flaky network, unhelpful here where failures are almost always a
    // genuine 4xx/5xx that retrying won't fix. One retry covers a
    // transient blip without leaving the user staring at "Loading..." for
    // 7+ seconds before the error toast (below) ever appears.
    queries: { retry: 1 },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // The auth-check query (`["me"]`) is expected to 401 for anonymous
      // visitors and already handles that silently in AuthContext - every
      // other query failing means a page is stuck showing "Loading..."
      // forever with no indication anything went wrong, so surface it.
      if (query.queryKey[0] === "me") return;
      // A query can opt out of specific, expected error codes (e.g. a
      // not-yet-activated account's overview 404ing "not_found") via
      // meta.silentOn - the component handles that state explicitly
      // instead of it reading as a broken page.
      const silentOn = query.meta?.silentOn as string[] | undefined;
      if (error instanceof Error && silentOn?.includes(error.message)) return;
      toastFromAnywhere(error instanceof Error ? error.message : "Something went wrong loading this page.");
    },
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
