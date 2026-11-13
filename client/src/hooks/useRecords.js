import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { DEMO_RECORDS } from "../lib/demoRecords.js";

// Loads records once, exposes refresh + review updates.
// Falls back to demonstration records if the API is unreachable.
export function useRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serviceOk, setServiceOk] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getRecords();
      setRecords(data.records || []);
      setServiceOk(true);
    } catch {
      setServiceOk(false);
      setRecords((prev) => (prev.length ? prev : DEMO_RECORDS));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Applies a review decision and patches the record in place.
  const updateRecord = useCallback(async (id, patch) => {
    const data = await api.updateRecord(id, patch);
    const updated = data.record;
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    return updated;
  }, []);

  return { records, loading, serviceOk, load, updateRecord };
}
