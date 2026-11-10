// React Query hooks over the generated client. Screens call these, never fetch() directly.
import type {
  Appearance,
  CorrectFoundItem,
  CreateFoundPost,
  CreateLostReport,
  LogFoundItem,
  ReceiveFoundItem,
  SimilarLostQuery,
} from '@lf/contracts';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, unwrap } from './client';

export const keys = {
  tenant: ['tenant'] as const,
  me: ['me'] as const,
  catalog: ['catalog'] as const,
  myReports: ['lost-reports', 'mine'] as const,
  report: (id: string) => ['lost-reports', id] as const,
  similarInCustody: (id: string) => ['lost-reports', id, 'similar'] as const,
  myFound: ['found-items', 'mine'] as const,
  foundPost: (id: string) => ['found-items', id] as const,
  similar: (q: SimilarLostQuery) => ['found-items', 'similar', q] as const,
  gallery: (q: GalleryQuery) => ['gallery', q] as const,
  alerts: ['alerts'] as const,
  deskToday: ['desk', 'today'] as const,
  deskSearch: (q: DeskSearch) => ['desk', 'search', q] as const,
  deskItem: (id: string) => ['desk', 'item', id] as const,
  deskLabel: (id: string) => ['desk', 'label', id] as const,
  bins: (category: string) => ['desk', 'bins', category] as const,
};

export type GalleryQuery = { q?: string; category?: string; building?: string; since?: string };
export type DeskSearch = { q?: string; category?: string; scope: 'active' | 'all' };

/** Where a photo's bytes are served (permission-checked by the server). */
export const photoUrl = (id: string) => `/api/photos/${id}`;

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
      qc.setQueryData(keys.similarInCustody(created.report.id), created.similarInCustody);
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

// ── Photos ──────────────────────────────────────────────────────────────────────────────────────

export function useUploadPhoto() {
  return useMutation({
    mutationFn: (file: Blob) => {
      const form = new FormData();
      form.append('file', file, 'photo.jpg');
      return unwrap(
        api.POST('/api/photos', {
          body: form as never,
          bodySerializer: (b: unknown) => b as FormData,
        }),
      ).then((r) => r.photo);
    },
  });
}

// ── Found items (student) ───────────────────────────────────────────────────────────────────────

export function useMyFoundPosts(enabled = true) {
  return useQuery({
    queryKey: keys.myFound,
    queryFn: () => unwrap(api.GET('/api/found-items')),
    enabled,
  });
}

export function useFoundPost(id: string) {
  return useQuery({
    queryKey: keys.foundPost(id),
    queryFn: () => unwrap(api.GET('/api/found-items/{id}', { params: { path: { id } } })),
  });
}

export function usePostFoundItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFoundPost) =>
      unwrap(api.POST('/api/found-items', { body: body as never })),
    onSuccess: (post) => {
      qc.setQueryData(keys.foundPost(post.id), post);
      void qc.invalidateQueries({ queryKey: keys.myFound });
    },
  });
}

/** The live "Someone lost this?" panel (US-02). */
export function useSimilarLost(query: SimilarLostQuery | null) {
  return useQuery({
    queryKey: keys.similar(query ?? { category: 'other' }),
    queryFn: () => unwrap(api.POST('/api/found-items/similar', { body: query as never })),
    enabled: query !== null,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useGallery(query: GalleryQuery) {
  return useQuery({
    queryKey: keys.gallery(query),
    queryFn: () => unwrap(api.GET('/api/gallery', { params: { query: query as never } })),
    placeholderData: (previous) => previous,
  });
}

// ── Alerts ──────────────────────────────────────────────────────────────────────────────────────

export function useAlerts(enabled = true) {
  return useQuery({
    queryKey: keys.alerts,
    queryFn: () => unwrap(api.GET('/api/alerts')),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useMarkAlertsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      unwrap(api.POST('/api/alerts/read', { body: (ids ? { ids } : {}) as never })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.alerts }),
  });
}

// ── Desk ────────────────────────────────────────────────────────────────────────────────────────

export function useDeskToday() {
  return useQuery({ queryKey: keys.deskToday, queryFn: () => unwrap(api.GET('/api/desk/today')) });
}

export function useDeskSearch(query: DeskSearch) {
  return useQuery({
    queryKey: keys.deskSearch(query),
    queryFn: () => unwrap(api.GET('/api/desk/found-items', { params: { query: query as never } })),
    placeholderData: (previous) => previous,
  });
}

export function useDeskItem(id: string) {
  return useQuery({
    queryKey: keys.deskItem(id),
    queryFn: () => unwrap(api.GET('/api/desk/found-items/{id}', { params: { path: { id } } })),
    enabled: id !== '',
  });
}

export function useDeskLabel(id: string) {
  return useQuery({
    queryKey: keys.deskLabel(id),
    queryFn: () =>
      unwrap(api.GET('/api/desk/found-items/{id}/label', { params: { path: { id } } })),
  });
}

export function useBinSuggestion(category: string | null) {
  return useQuery({
    queryKey: keys.bins(category ?? ''),
    queryFn: () =>
      unwrap(api.GET('/api/desk/bins', { params: { query: { category: category as never } } })),
    enabled: Boolean(category),
  });
}

function invalidateDesk(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['desk'] });
  void qc.invalidateQueries({ queryKey: ['gallery'] });
}

export function useLogFoundItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LogFoundItem) =>
      unwrap(api.POST('/api/desk/found-items', { body: body as never })),
    onSuccess: (r) => {
      invalidateDesk(qc);
      qc.setQueryData(keys.deskItem(r.item.id), r.item);
      qc.setQueryData(keys.deskLabel(r.item.id), r.label);
    },
  });
}

export function useReceiveFoundItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReceiveFoundItem }) =>
      unwrap(
        api.POST('/api/desk/found-items/{id}/receive', {
          params: { path: { id } },
          body: body as never,
        }),
      ),
    onSuccess: (r) => {
      invalidateDesk(qc);
      qc.setQueryData(keys.deskItem(r.item.id), r.item);
      qc.setQueryData(keys.deskLabel(r.item.id), r.label);
    },
  });
}

export function useCorrectFoundItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CorrectFoundItem) =>
      unwrap(
        api.POST('/api/desk/found-items/{id}/correct', {
          params: { path: { id } },
          body: body as never,
        }),
      ),
    onSuccess: (item) => {
      invalidateDesk(qc);
      qc.setQueryData(keys.deskItem(id), item);
    },
  });
}

export function useVoidFoundItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST('/api/desk/found-items/{id}/void', {
          params: { path: { id } },
          body: { reason },
        }),
      ),
    onSuccess: (item) => {
      invalidateDesk(qc);
      qc.setQueryData(keys.deskItem(id), item);
    },
  });
}
