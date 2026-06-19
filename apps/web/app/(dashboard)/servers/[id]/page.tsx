"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Server landing page. Game servers open on the Console; voice servers (which
 * have no console / computing view) open on their voice overview instead.
 */
export default function ServerIndex() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: server } = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.servers.get(id),
  });

  useEffect(() => {
    if (!server) return;
    const isVoice = (server.template?.slug ?? "").startsWith("teamspeak");
    router.replace(`/servers/${id}/${isVoice ? "voice" : "console"}`);
  }, [server, id, router]);

  return null;
}
