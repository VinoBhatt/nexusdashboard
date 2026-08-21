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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = useCallback((msg: string) => {
    setMessage(msg);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2200);
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
      <div id="toast" className={show ? "show" : ""}>
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
