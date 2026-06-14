"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 监听 session-expired 事件，显示提示后导航回首页
 * 替代 api.ts 中的 window.location.href 整页刷新
 */
export default function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const handleExpired = () => {
      // Store flag so homepage can show the message
      if (typeof window !== "undefined") {
        sessionStorage.setItem("bilimind_session_expired", "1");
      }
      router.replace("/");
    };
    window.addEventListener("bilimind:session-expired", handleExpired);
    return () => {
      window.removeEventListener("bilimind:session-expired", handleExpired);
    };
  }, [router]);

  return <>{children}</>;
}
