"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /auction is kept for backward compatibility.
// It simply redirects to /host.
export default function AuctionPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/host");
  }, [router]);

  return null;
}
