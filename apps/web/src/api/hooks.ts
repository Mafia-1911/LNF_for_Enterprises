// React Query hooks over the generated client. Screens call these, never fetch() directly.
import type {
  AddAmendment,
  AddClosure,
  DispatchListQuery,
  RaiseDispute,
  ResolveDispute,
  AddStaff,
  Appearance,
  Policies,
  RetentionDecision,
  CorrectFoundItem,
  CreateFoundPost,
  CreateLostReport,
  HandOver,
  LogFoundItem,
  ReceiveFoundItem,
  ReviewClaim,
  SubmitClaim,
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
  claimStart: (id: string) => ['claims', 'start', id] as const,
  myClaims: ['claims', 'mine'] as const,
  claim: (id: string) => ['claims', id] as const,
  matches: (reportId: string) => ['lost-reports', reportId, 'matches'] as const,
  deskClaims: ['desk', 'claims'] as const,
  deskItemClaims: (itemId: string) => ['desk', 'item-claims', itemId] as const,
  supervisor: ['supervisor'] as const,
  overview: ['supervisor', 'overview'] as const,
  retention: ['supervisor', 'retention'] as const,
  policies: ['supervisor', 'policies'] as const,
  staff: ['supervisor', 'staff'] as const,
  dispatches: (q: DispatchListQuery) => ['supervisor', 'dispatches', q] as const,
  dispatchRecord: (id: string) => ['supervisor', 'dispatch', id] as const,
  disputes: ['supervisor', 'disputes'] as const,
  approvals: ['supervisor', 'approvals'] as const,
  flags: ['supervisor', 'flags'] as const,
  myDispute: (claimId: string) => ['claims', claimId, 'dispute'] as const,
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

// ── Claims (student) ────────────────────────────────────────────────────────────────────────────

export function useClaimStart(itemId: string) {
  return useQuery({
    queryKey: keys.claimStart(itemId),
    queryFn: () =>
      unwrap(api.GET('/api/found-items/{id}/claim', { params: { path: { id: itemId } } })),
  });
}

function invalidateClaims(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['claims'] });
  void qc.invalidateQueries({ queryKey: ['lost-reports'] });
  void qc.invalidateQueries({ queryKey: keys.alerts });
}

export function useSubmitClaim(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitClaim) =>
      unwrap(
        api.POST('/api/found-items/{id}/claims', {
          params: { path: { id: itemId } },
          body: body as never,
        }),
      ),
    onSuccess: (claim) => {
      qc.setQueryData(keys.claim(claim.id), claim);
      invalidateClaims(qc);
    },
  });
}

export function useMyClaims(enabled = true) {
  return useQuery({
    queryKey: keys.myClaims,
    queryFn: () => unwrap(api.GET('/api/claims')),
    enabled,
  });
}

export function useClaim(id: string) {
  return useQuery({
    queryKey: keys.claim(id),
    queryFn: () => unwrap(api.GET('/api/claims/{id}', { params: { path: { id } } })),
  });
}

export function useClaimAction(id: string) {
  const qc = useQueryClient();
  const done = (claim: { id: string }) => {
    qc.setQueryData(keys.claim(claim.id), claim);
    invalidateClaims(qc);
  };
  return {
    withdraw: useMutation({
      mutationFn: () => unwrap(api.POST('/api/claims/{id}/withdraw', { params: { path: { id } } })),
      onSuccess: done,
    }),
    more: useMutation({
      mutationFn: (answer: string) =>
        unwrap(api.POST('/api/claims/{id}/more', { params: { path: { id } }, body: { answer } })),
      onSuccess: done,
    }),
    reRequest: useMutation({
      mutationFn: () =>
        unwrap(api.POST('/api/claims/{id}/re-request', { params: { path: { id } } })),
      onSuccess: done,
    }),
  };
}

export function useLikelyMatches(reportId: string) {
  return useQuery({
    queryKey: keys.matches(reportId),
    queryFn: () =>
      unwrap(api.GET('/api/lost-reports/{id}/matches', { params: { path: { id: reportId } } })),
  });
}

export function useReportAction(id: string) {
  const qc = useQueryClient();
  return {
    renew: useMutation({
      mutationFn: () =>
        unwrap(api.POST('/api/lost-reports/{id}/renew', { params: { path: { id } } })),
      onSuccess: (report) => {
        qc.setQueryData(keys.report(id), report);
        void qc.invalidateQueries({ queryKey: keys.myReports });
      },
      // The report may have moved on (e.g. a match arrived): show its current state.
      onError: () => void qc.invalidateQueries({ queryKey: keys.report(id) }),
    }),
    withdraw: useMutation({
      mutationFn: () =>
        unwrap(api.POST('/api/lost-reports/{id}/withdraw', { params: { path: { id } } })),
      onSuccess: () => invalidateClaims(qc),
    }),
  };
}

// ── Claims and handover (desk) ──────────────────────────────────────────────────────────────────

export function useDeskClaimQueue() {
  return useQuery({
    queryKey: keys.deskClaims,
    queryFn: () => unwrap(api.GET('/api/desk/claims')),
  });
}

export function useDeskItemClaims(itemId: string) {
  return useQuery({
    queryKey: keys.deskItemClaims(itemId),
    queryFn: () =>
      unwrap(api.GET('/api/desk/found-items/{id}/claims', { params: { path: { id: itemId } } })),
  });
}

export function useReviewClaim(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, body }: { claimId: string; body: ReviewClaim }) =>
      unwrap(
        api.POST('/api/desk/claims/{id}/review', {
          params: { path: { id: claimId } },
          body: body as never,
        }),
      ),
    onSuccess: (data) => {
      qc.setQueryData(keys.deskItemClaims(itemId), data);
      invalidateDesk(qc);
    },
  });
}

export function usePickupLookup() {
  return useMutation({
    mutationFn: (code: string) => unwrap(api.POST('/api/desk/pickups/lookup', { body: { code } })),
  });
}

export function useHandOver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, body }: { claimId: string; body: HandOver }) =>
      unwrap(
        api.POST('/api/desk/pickups/{id}/hand-over', {
          params: { path: { id: claimId } },
          body: body as never,
        }),
      ),
    onSuccess: () => invalidateDesk(qc),
  });
}

export function useDispatch(id: string) {
  return useQuery({
    queryKey: ['desk', 'dispatch', id],
    queryFn: () => unwrap(api.GET('/api/desk/dispatches/{id}', { params: { path: { id } } })),
  });
}

// ── Supervisor ──────────────────────────────────────────────────────────────────────────────────

export function useSupervisorOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => unwrap(api.GET('/api/supervisor/overview')),
  });
}

export function useRetention() {
  return useQuery({
    queryKey: keys.retention,
    queryFn: () => unwrap(api.GET('/api/supervisor/retention')),
  });
}

function invalidateSupervisor(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: keys.supervisor });
  void qc.invalidateQueries({ queryKey: ['desk'] });
}

export function useDecideRetention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RetentionDecision) =>
      unwrap(api.POST('/api/supervisor/retention/decide', { body })),
    onSuccess: () => invalidateSupervisor(qc),
  });
}

export function useKeepLonger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/api/supervisor/retention/{id}/keep', { params: { path: { id } } })),
    onSuccess: () => invalidateSupervisor(qc),
  });
}

export function useRunRetention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/supervisor/retention/run')),
    onSuccess: () => invalidateSupervisor(qc),
  });
}

export function usePolicySettings() {
  return useQuery({
    queryKey: keys.policies,
    queryFn: () => unwrap(api.GET('/api/supervisor/policies')),
  });
}

export function useSavePolicies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Policies) => unwrap(api.PUT('/api/supervisor/policies', { body })),
    onSuccess: (data) => {
      qc.setQueryData(keys.policies, data);
      invalidateSupervisor(qc);
    },
  });
}

export function useAddClosure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddClosure) => unwrap(api.POST('/api/supervisor/closures', { body })),
    onSuccess: (data) => {
      qc.setQueryData(keys.policies, data);
      invalidateSupervisor(qc);
    },
  });
}

export function useRemoveClosure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/supervisor/closures/{id}', { params: { path: { id } } })),
    onSuccess: (data) => {
      qc.setQueryData(keys.policies, data);
      invalidateSupervisor(qc);
    },
  });
}

export function useStaff() {
  return useQuery({
    queryKey: keys.staff,
    queryFn: () => unwrap(api.GET('/api/supervisor/staff')),
  });
}

export function useAddStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddStaff) => unwrap(api.POST('/api/supervisor/staff', { body })),
    onSuccess: (data) => qc.setQueryData(keys.staff, data),
  });
}

export function useRemoveStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      unwrap(api.POST('/api/supervisor/staff/remove', { body: { email } })),
    onSuccess: (data) => qc.setQueryData(keys.staff, data),
  });
}

export function useRequestApproval() {
  return useMutation({
    mutationFn: (claimId: string) =>
      unwrap(
        api.POST('/api/desk/pickups/{id}/request-approval', { params: { path: { id: claimId } } }),
      ),
  });
}

export function useDispatchDirectory(query: DispatchListQuery) {
  return useQuery({
    queryKey: keys.dispatches(query),
    queryFn: () =>
      unwrap(api.GET('/api/supervisor/dispatches', { params: { query: query as never } })),
    placeholderData: (previous) => previous,
  });
}

export function useDispatchRecord(id: string) {
  return useQuery({
    queryKey: keys.dispatchRecord(id),
    queryFn: () => unwrap(api.GET('/api/supervisor/dispatches/{id}', { params: { path: { id } } })),
  });
}

export function useAddAmendment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddAmendment) =>
      unwrap(
        api.POST('/api/supervisor/dispatches/{id}/amendments', { params: { path: { id } }, body }),
      ),
    onSuccess: (data) => {
      qc.setQueryData(keys.dispatchRecord(id), data);
      void qc.invalidateQueries({ queryKey: ['supervisor', 'dispatches'] });
    },
  });
}

export function useDisputes() {
  return useQuery({
    queryKey: keys.disputes,
    queryFn: () => unwrap(api.GET('/api/supervisor/disputes')),
  });
}

export function useDisputeNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note: string) =>
      unwrap(
        api.POST('/api/supervisor/disputes/{id}/notes', {
          params: { path: { id } },
          body: { note },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.disputes }),
  });
}

export function useResolveDispute(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ResolveDispute) =>
      unwrap(api.POST('/api/supervisor/disputes/{id}/resolve', { params: { path: { id } }, body })),
    onSuccess: () => invalidateSupervisor(qc),
  });
}

export function useMyDispute(claimId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.myDispute(claimId),
    queryFn: () =>
      unwrap(api.GET('/api/claims/{id}/dispute', { params: { path: { id: claimId } } })),
    enabled,
  });
}

export function useRaiseDispute(claimId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RaiseDispute) =>
      unwrap(api.POST('/api/claims/{id}/dispute', { params: { path: { id: claimId } }, body })),
    onSuccess: (data) => qc.setQueryData(keys.myDispute(claimId), data),
  });
}

export function useApprovals() {
  return useQuery({
    queryKey: keys.approvals,
    queryFn: () => unwrap(api.GET('/api/supervisor/approvals')),
  });
}

export function useApproveHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (claimId: string) =>
      unwrap(
        api.POST('/api/supervisor/approvals/{id}/approve', { params: { path: { id: claimId } } }),
      ),
    onSuccess: (data) => {
      qc.setQueryData(keys.approvals, data);
      invalidateSupervisor(qc);
    },
  });
}

export function useFlags() {
  return useQuery({
    queryKey: keys.flags,
    queryFn: () => unwrap(api.GET('/api/supervisor/flags')),
  });
}

export function useClearFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap(api.POST('/api/supervisor/flags/{userId}/clear', { params: { path: { userId } } })),
    onSuccess: (data) => {
      qc.setQueryData(keys.flags, data);
      invalidateSupervisor(qc);
    },
  });
}
