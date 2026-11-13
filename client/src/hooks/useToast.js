import { useCallback, useEffect, useState } from "react";

// Auto-dismissing toast state (4s, matching the original).
export function useToast() {
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg) => setToast(msg), []);
  const clearToast = useCallback(() => setToast(""), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return { toast, showToast, clearToast };
}
