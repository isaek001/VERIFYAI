import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

// Loads records once, exposes refresh + review updates.
// If the API is unreachable it flags the service as down and keeps
// whatever it already loaded — it never swaps real data for demo records.
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
