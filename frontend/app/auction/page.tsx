"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QuizBoard from "@/components/QuizBoard";

export default function AuctionPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("auth") === "true") {
      setAuthorized(true);
    } else {
      router.push("/");
    }
  }, [router]);

  if (!authorized) return null; // Avoid flashing content before redirect

  return <QuizBoard />;
}
