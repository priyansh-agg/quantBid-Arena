"use client";

import { useEffect, useState } from "react";
import ArenaView from "@/components/ArenaView";

export default function ArenaPage() {
  const [mounted, setMounted] = useState(false);

  // Wait for hydration to avoid SSR mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <ArenaView />;
}
