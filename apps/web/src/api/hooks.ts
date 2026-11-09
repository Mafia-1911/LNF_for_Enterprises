// React Query hooks over the generated client. Screens call these, never fetch() directly.
import type { Appearance, CreateLostReport } from '@lf/contracts';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, unwrap } from './client';

export const keys = {
  tenant: ['tenant'] as const,
  me: ['me'] as const,
  catalog: ['catalog'] as const,
  myReports: ['lost-reports', 'mine'] as const,
  report: (id: string) => ['lost-reports', id] as const,
};

export function useTenant() {
  return useQuery({
    queryKey: keys.tenant,
    queryFn: () => unwrap(api.GET('/api/tenant')),
    staleTime: 5 * 60_000,
  });
}

/** The signed-in person, or null when signed out (also used by route guards). */
export const meQuery = queryOptions({
  queryKey: keys.me,
  queryFn: async () => {
    try {
      return (await unwrap(api.GET('/api/me'))).me;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
      throw err;
    }
  },
  staleTime: 60_000,
});

export function useMe() {
  return useQuery(meQuery);
}

export function useCatalog() {
  return useQuery({
    queryKey: keys.catalog,
    queryFn: () => unwrap(api.GET('/api/catalog')),
    staleTime: 10 * 60_000,
  });
}

export function useLostReport(id: string) {
  return useQuery({
    queryKey: keys.report(id),
    queryFn: () => unwrap(api.GET('/api/lost-reports/{id}', { params: { path: { id } } })),
  });
}

export function useMyLostReports() {
  return useQuery({
    queryKey: keys.myReports,
    queryFn: () => unwrap(api.GET('/api/lost-reports')),
  });
}

export function useSubmitLostReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLostReport) =>
      unwrap(api.POST('/api/lost-reports', { body: body as never })),
    onSuccess: (created) => {
      qc.setQueryData(keys.report(created.report.id), created.report);
      void qc.invalidateQueries({ queryKey: keys.myReports });
    },
  });
}

export function useSetAppearance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Appearance) =>
      unwrap(api.PUT('/api/admin/appearance', { body: body as never })),
    onSuccess: (info) => qc.setQueryData(keys.tenant, info),
  });
}
