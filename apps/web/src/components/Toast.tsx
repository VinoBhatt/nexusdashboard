import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

// QueryClient's cache-level error handlers live outside the React tree, so
// they can't call useToast() directly. ToastProvider publishes its toast
// function here once mounted, giving main.tsx a way to surface query
// failures without plumbing a toast callback through QueryClient's config.
let globalToast: ((message: string) => void) | null = null;
export function toastFromAnywhere(message: string) {
  globalToast?.(message);
}

interface ToastItem {
  id: number;
  message: string;
  leaving: boolean;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((msg: string) => {
    const id = ++nextId.current;
    setToasts((t) => [...t, { id, message: msg, leaving: false }]);
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    }, 1900);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 2200);
  }, []);

  useEffect(() => {
    globalToast = toast;
    return () => {
      globalToast = null;
    };
  }, [toast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toast" className={toasts.length > 0 ? "show" : ""}>
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item${t.leaving ? " leaving" : ""}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
