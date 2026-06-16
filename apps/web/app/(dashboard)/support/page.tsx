"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  LifeBuoy,
  Plus,
  BookOpen,
  Search,
  Eye,
  Ticket as TicketIcon,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge, TicketStateBadge, TicketPriorityBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatRelative } from "@/lib/utils";
import type { KbArticle, TicketPriority } from "@/lib/types";

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const createSchema = z.object({
  subject: z.string().min(3, "Give your ticket a short subject"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  body: z.string().min(10, "Please describe your issue in a little more detail"),
});
type CreateValues = z.infer<typeof createSchema>;

export default function SupportPage() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Open a ticket or browse the knowledge base for answers."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New ticket
          </Button>
        }
      />

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">
            <TicketIcon /> Tickets
          </TabsTrigger>
          <TabsTrigger value="kb">
            <BookOpen /> Knowledge base
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets">
          <TicketsTab onNew={() => setCreateOpen(true)} />
        </TabsContent>

        <TabsContent value="kb">
          <KnowledgeBaseTab />
        </TabsContent>
      </Tabs>

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => router.push(`/support/${id}`)}
      />
    </div>
  );
}

function TicketsTab({ onNew }: { onNew: () => void }) {
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support", "tickets"],
    queryFn: () => api.support.tickets().then((r) => r.data),
  });

  if (isLoading) return <ListSkeleton rows={4} />;

  if (!tickets?.length) {
    return (
      <EmptyState
        icon={LifeBuoy}
        title="No tickets yet"
        description="Need a hand? Open a ticket and our team will get back to you."
        action={
          <Button onClick={onNew}>
            <Plus className="size-4" /> New ticket
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  <Link href={`/support/${ticket.id}`} className="block">
                    #{ticket.number}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/support/${ticket.id}`} className="block">
                    {ticket.subject}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/support/${ticket.id}`} className="block">
                    <TicketStateBadge state={ticket.state} />
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/support/${ticket.id}`} className="block">
                    <TicketPriorityBadge priority={ticket.priority} />
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <Link href={`/support/${ticket.id}`} className="block">
                    {formatRelative(ticket.updatedAt)}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function KnowledgeBaseTab() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<KbArticle | null>(null);

  const { data: articles, isLoading } = useQuery({
    queryKey: ["support", "kb"],
    queryFn: () => api.support.kb(),
  });

  const filtered = (articles ?? []).filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      (a.category?.toLowerCase().includes(q) ?? false) ||
      a.body.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search articles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ListSkeleton key={i} rows={1} />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => setActive(article)}
              className="flex flex-col gap-3 rounded-xl border bg-card p-5 text-left transition-colors hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-2">
                {article.category ? (
                  <Badge variant="secondary">{article.category}</Badge>
                ) : (
                  <span />
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="size-3.5" /> {article.views}
                </span>
              </div>
              <p className="font-medium leading-snug">{article.title}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{article.body}</p>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No articles found"
          description={
            search.trim()
              ? "Try a different search term."
              : "Knowledge base articles will appear here."
          }
        />
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active?.title}</DialogTitle>
            {active?.category && (
              <DialogDescription>
                <Badge variant="secondary">{active.category}</Badge>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {active?.body}
          </div>
          {active && (
            <p className="text-xs text-muted-foreground">
              {active.views} views · updated {formatRelative(active.updatedAt)}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { priority: "NORMAL", subject: "", body: "" },
  });

  const priority = watch("priority");

  const createMutation = useMutation({
    mutationFn: (values: CreateValues) =>
      api.support.createTicket({
        subject: values.subject,
        body: values.body,
        priority: values.priority,
      }),
    onSuccess: (ticket) => {
      toast.success("Ticket created");
      reset();
      onOpenChange(false);
      onCreated(ticket.id);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Failed to create ticket"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>
              Describe your issue and we&apos;ll get back to you as soon as possible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" placeholder="Brief summary" {...register("subject")} />
            {errors.subject && (
              <p className="text-xs text-destructive">{errors.subject.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select
              value={priority}
              onValueChange={(v) => setValue("priority", v as TicketPriority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              rows={6}
              placeholder="Tell us what's going on…"
              {...register("body")}
            />
            {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
