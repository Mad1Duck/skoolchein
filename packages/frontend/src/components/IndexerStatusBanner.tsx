import { useQuery } from "@tanstack/react-query";
import { rawApi } from "@/lib/api/client";
import { useT } from "@/lib/i18n";

type IndexerState = "ok" | "syncing" | "stalled" | "down";

/** Says so when the app's data is behind the chain, instead of showing old data as if it were current. */
export function IndexerStatusBanner() {
  const { t } = useT();
  const { data: state } = useQuery({
    queryKey: ["indexerStatus"],
    queryFn: async () => {
      const { data } = await rawApi.get<{ state: IndexerState }>("/health/indexer", {
        // 503 carries the answer too.
        validateStatus: (status) => status === 200 || status === 503,
      });
      return data.state;
    },
    refetchInterval: 30_000,
    retry: false,
  });

  if (!state || state === "ok") return null;

  return (
    <div role="status" className="w-full bg-amber-100 border-b border-amber-300 text-amber-900 text-sm text-center px-4 py-2">
      {t(state === "syncing" ? "indexer.syncing" : "indexer.delayed")}
    </div>
  );
}
