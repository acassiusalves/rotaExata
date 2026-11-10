'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { REPORT_CREATED_EVENT, type ReportSummary } from '@/lib/reporting/report-contract';
import { initialReportFilters, type ReportCounts, type ReportFilterValues } from './ReportFilters';

export function useReportList(user: User | null | undefined, ownOnly = false) {
  const [filters, setFilters] = useState<ReportFilterValues>(initialReportFilters);
  const [pages, setPages] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<ReportCounts>();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const listRequest = useRef<AbortController | null>(null);
  const cursor = pages.at(-1);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setReports([]);
      setCounts(undefined);
      setNextCursor(null);
      return;
    }
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(filters);
      if (ownOnly) params.set('scope', 'mine');
      if (cursor) params.set('cursor', cursor);
      const token = await user.getIdToken();
      const response = await fetch(`/api/feedbacks/admin?${params}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os chamados.');
      if (controller.signal.aborted) return;
      setReports(data.reports);
      setCounts(data.counts);
      setNextCursor(data.nextCursor);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Falha ao carregar os chamados.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [user, cursor, filters, ownOnly]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 200);
    return () => {
      window.clearTimeout(timer);
      listRequest.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(REPORT_CREATED_EVENT, refresh);
    return () => window.removeEventListener(REPORT_CREATED_EVENT, refresh);
  }, [load]);

  function updateFilters(values: ReportFilterValues) {
    setFilters(values);
    setPages([]);
    setNextCursor(null);
    setLoading(true);
  }

  return {
    reports, setReports, loading, error, load, filters, counts, updateFilters,
    next: nextCursor && !loading ? () => setPages((current) => [...current, nextCursor]) : undefined,
    previous: pages.length && !loading ? () => setPages((current) => current.slice(0, -1)) : undefined,
  };
}
