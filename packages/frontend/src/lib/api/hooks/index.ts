import { useQuery } from "@tanstack/react-query";
import { api } from "../client";
import type {
  Program, ProgramDetail, Applicant, Scholar, Milestone,
  Vote, ConfidenceStake, Dispute, Reputation, DashboardData,
  PaginatedResponse, SingleResponse, AdminOverview, ExternalLearning, TokenRegistryEntry,
} from "../types";

// ── Query key factory ─────────────────────────────────────────────────────────

export const queryKeys = {
  programs:   (params?: Record<string, unknown>) => ["programs", params] as const,
  program:    (id: string)     => ["program", id] as const,
  applicants: (params?: Record<string, unknown>) => ["applicants", params] as const,
  scholars:   (params?: Record<string, unknown>) => ["scholars", params] as const,
  scholar:    (wallet: string) => ["scholar", wallet] as const,
  milestones: (params?: Record<string, unknown>) => ["milestones", params] as const,
  votes:      (params?: Record<string, unknown>) => ["votes", params] as const,
  stakes:     (params?: Record<string, unknown>) => ["stakes", params] as const,
  disputes:   (params?: Record<string, unknown>) => ["disputes", params] as const,
  dispute:    (id: string)     => ["dispute", id] as const,
  reputation: (addr: string)   => ["reputation", addr] as const,
  dashboard:  (wallet: string) => ["dashboard", wallet] as const,
  adminOverview: () => ["adminOverview"] as const,
  externalProgress: (wallet: string, provider?: string, externalId?: string) => ["externalProgress", wallet, provider, externalId] as const,

  // Nested under program
  programApplicants: (id: string) => ["program", id, "applicants"] as const,
  programScholars:   (id: string) => ["program", id, "scholars"] as const,
  programMilestones: (id: string) => ["program", id, "milestones"] as const,
  programVotes:      (id: string) => ["program", id, "votes"] as const,
  programDisputes:   (id: string) => ["program", id, "disputes"] as const,
};

// ── Programs ──────────────────────────────────────────────────────────────────

export function usePrograms(params?: {
  status?: string; initiator?: string; limit?: number; offset?: number; sort?: "asc" | "desc";
}) {
  return useQuery({
    queryKey: queryKeys.programs(params),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Program>>("/programs", { params });
      return data;
    },
  });
}

export function useProgram(id: string) {
  return useQuery({
    queryKey: queryKeys.program(id),
    queryFn: async () => {
      const { data } = await api.get<SingleResponse<ProgramDetail>>(`/programs/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

// ── Program sub-resources ─────────────────────────────────────────────────────

export function useProgramApplicants(programId: string, params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: queryKeys.programApplicants(programId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Applicant[] }>(`/programs/${programId}/applicants`, { params });
      return data.data;
    },
    enabled: !!programId,
  });
}

export function useProgramScholars(programId: string) {
  return useQuery({
    queryKey: queryKeys.programScholars(programId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Scholar[] }>(`/programs/${programId}/scholars`);
      return data.data;
    },
    enabled: !!programId,
  });
}

export function useProgramMilestones(programId: string) {
  return useQuery({
    queryKey: queryKeys.programMilestones(programId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Milestone[] }>(`/programs/${programId}/milestones`);
      return data.data;
    },
    enabled: !!programId,
  });
}

export function useProgramVotes(programId: string) {
  return useQuery({
    queryKey: queryKeys.programVotes(programId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Vote[] }>(`/programs/${programId}/votes`);
      return data.data;
    },
    enabled: !!programId,
  });
}

export function useProgramDisputes(programId: string) {
  return useQuery({
    queryKey: queryKeys.programDisputes(programId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Dispute[] }>(`/programs/${programId}/disputes`);
      return data.data;
    },
    enabled: !!programId,
  });
}

// ── Applicants ────────────────────────────────────────────────────────────────

export function useApplicants(params?: { wallet?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.applicants(params),
    queryFn: async () => {
      const { data } = await api.get<{ data: Array<{ applicant: Applicant; program: Partial<Program> | null }> }>("/applicants", { params });
      return data.data;
    },
  });
}

// ── Scholars ──────────────────────────────────────────────────────────────────

export function useScholars(params?: { wallet?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.scholars(params),
    queryFn: async () => {
      const { data } = await api.get<{ data: Array<{ scholar: Scholar; program: Partial<Program> | null }> }>("/scholars", { params });
      return data.data;
    },
  });
}

export function useScholar(wallet: string, programId?: string) {
  return useQuery({
    queryKey: queryKeys.scholar(wallet),
    queryFn: async () => {
      const { data } = await api.get<{ data: Array<{ scholar: Scholar; program: Partial<Program> | null; milestones: Milestone[] }> }>(
        `/scholars/${wallet}`, { params: programId ? { programId } : undefined }
      );
      return data.data;
    },
    enabled: !!wallet,
  });
}

// ── Milestones ────────────────────────────────────────────────────────────────

export function useMilestones(params?: { scholar?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.milestones(params),
    queryFn: async () => {
      const { data } = await api.get<{ data: Array<{ milestone: Milestone; scholar: Partial<Scholar> | null; program: { pid: number } | null }> }>("/milestones", { params });
      return data.data;
    },
  });
}

// ── Votes & Stakes ────────────────────────────────────────────────────────────

export function useVotes(params?: { voter?: string; candidate?: string }) {
  return useQuery({
    queryKey: queryKeys.votes(params),
    queryFn: async () => {
      const { data } = await api.get<{ data: Vote[] }>("/votes", { params });
      return data.data;
    },
  });
}

export function useConfidenceStakes(params?: { voter?: string; resolved?: string }) {
  return useQuery({
    queryKey: queryKeys.stakes(params),
    queryFn: async () => {
      const { data } = await api.get<{ data: ConfidenceStake[] }>("/votes/stakes", { params });
      return data.data;
    },
  });
}

// ── Disputes ──────────────────────────────────────────────────────────────────

export function useDisputes(params?: { status?: string; bountyHunter?: string; scholar?: string }) {
  return useQuery({
    queryKey: queryKeys.disputes(params),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ dispute: Dispute; program: Partial<Program> | null }>>("/disputes", { params });
      return data;
    },
  });
}

// ── Reputation ────────────────────────────────────────────────────────────────

export function useReputation(address: string) {
  return useQuery({
    queryKey: queryKeys.reputation(address),
    queryFn: async () => {
      const { data } = await api.get<SingleResponse<Reputation & { isVotingLocked: boolean }>>(`/reputation/${address}`);
      return data.data;
    },
    enabled: !!address,
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function useDashboard(wallet: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(wallet),
    queryFn: async () => {
      const { data } = await api.get<SingleResponse<DashboardData>>(`/dashboard/${wallet}`);
      return data.data;
    },
    enabled: !!wallet,
  });
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export function useAdminOverview() {
  return useQuery({
    queryKey: queryKeys.adminOverview(),
    queryFn: async () => {
      const { data } = await api.get<SingleResponse<AdminOverview>>("/admin");
      return data.data;
    },
  });
}

// ── External Learning ─────────────────────────────────────────────────────────

export function useExternalProgress(wallet: string, provider?: string, externalId?: string) {
  return useQuery({
    queryKey: queryKeys.externalProgress(wallet, provider, externalId),
    queryFn: async () => {
      const { data } = await api.get<ExternalLearning | ExternalLearning[]>("/learning/progress", {
        params: { address: wallet, provider, externalId },
      });
      return data;
    },
    enabled: !!wallet && !!provider,
  });
}

// ── Payment tokens & USD rates ────────────────────────────────────────────────

/**
 * Token registry with USD rates (from ScholarshipPriceOracle via the indexer).
 * Prefer this over per-component contract reads — one request serves the whole
 * app, and rates change rarely.
 */
export function useTokenRegistry(params?: { includeDeregistered?: boolean }) {
  return useQuery({
    queryKey: ["tokenRegistry", params] as const,
    queryFn: async () => {
      const { data } = await api.get<{ data: TokenRegistryEntry[] }>("/tokens", { params });
      return data.data;
    },
    // Rates are admin-set and infrequent; avoid refetching on every mount.
    staleTime: 60_000,
  });
}

/** Lookup map keyed by lowercased token address, for O(1) rate lookups. */
export function useTokenRateMap(): Record<string, bigint> {
  const { data } = useTokenRegistry();
  const map: Record<string, bigint> = {};
  for (const t of data ?? []) map[t.token.toLowerCase()] = BigInt(t.priceUsd || "0");
  return map;
}
