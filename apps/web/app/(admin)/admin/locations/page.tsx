"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, Boxes } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, ListSkeleton } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminLocationsPage() {
  const { data: regions, isLoading } = useQuery({
    queryKey: ["admin", "regions"],
    queryFn: () => api.admin.regions(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="Regions servers can be deployed to. Nodes are assigned to a location when created."
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : regions?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Country</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <MapPin className="size-4 text-muted-foreground" />
                        {r.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        {r.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.country}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Boxes}
          title="No locations configured"
          description="Locations are seeded with the platform. Add nodes under Nodes to start placing servers."
        />
      )}
    </div>
  );
}
