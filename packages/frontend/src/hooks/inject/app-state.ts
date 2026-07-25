import { createInjection } from "../../util/create-inject";
import { useRef, useState } from "react";

type LState = {
  type: "confirmation" | "proccessing" | "none" | "error" | "success";
  message?: string;
};

function useLoading() {
  const [loading, setLoading] = useState<LState>({ type: "none" });
  const isFirstTime = useRef(false);

  return {
    loading,
    setLoading,
    isFirstTime,
    open,
  };
}

export const appStateInjection = createInjection(() => {
  const injected = {
    loading: useLoading(),
  };

  return injected;
});
