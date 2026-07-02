"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Users } from "lucide-react";
import { api } from "@/lib/api";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { Reveal } from "@/components/ui/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeamMember } from "@/lib/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function TeamPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["storefront", "team"],
    queryFn: () => api.catalog.team(),
  });
  const team = data ?? [];

  return (
    <div className="relative overflow-hidden">
      {/* Static hero glow — the animated aurora stays homepage-exclusive. */}
      <div
        aria-hidden
        className="refx-enter-glow pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 50% at 50% 0%, rgba(0,114,255,0.13), transparent 70%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <span className="refx-eyebrow mb-3 inline-flex items-center gap-1.5">
              <Users className="size-3.5" /> The crew
            </span>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Meet{" "}
              <span className="bg-gradient-to-r from-[#3aa0ff] to-[#22d3ee] bg-clip-text text-transparent">
                the team
              </span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              The people behind ReFx Hosting — building the platform and keeping
              your servers online around the clock.
            </p>
            {team.length > 0 && (
              <div className="mt-6">
                <AvatarGroup
                  items={team.map((m) => ({
                    name: m.name,
                    avatarUrl: m.avatarUrl,
                  }))}
                  size={48}
                />
              </div>
            )}
          </div>
        </Reveal>

        {isLoading ? (
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : team.length === 0 ? (
          <Reveal className="mt-12">
            <div className="refx-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
              Our team will be introduced here soon.
            </div>
          </Reveal>
        ) : (
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((m, i) => (
              <Reveal key={m.id} delayMs={Math.min(i * 60, 360)}>
                <TeamCard member={m} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamCard({ member }: { member: TeamMember }) {
  return (
    <div className="refx-beam refx-hover-card group relative flex h-full flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-6 text-center">
      <div className="grid size-20 place-items-center overflow-hidden rounded-full bg-[linear-gradient(180deg,rgba(40,140,255,0.35),rgba(0,114,255,0.15))] text-lg font-semibold text-white ring-2 ring-white/10 transition-transform duration-300 ease-out group-hover:scale-105">
        {member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.avatarUrl}
            alt={member.name}
            className="size-full object-cover"
          />
        ) : (
          <span>{initials(member.name)}</span>
        )}
      </div>
      <div>
        <p className="font-semibold">{member.name}</p>
        <p className="refx-eyebrow mt-0.5 text-primary/80">{member.title}</p>
      </div>
      {member.bio && (
        <p className="text-sm text-muted-foreground">{member.bio}</p>
      )}
      {member.link && (
        <a
          href={member.link}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Profile <ArrowUpRight className="size-3.5" />
        </a>
      )}
    </div>
  );
}
