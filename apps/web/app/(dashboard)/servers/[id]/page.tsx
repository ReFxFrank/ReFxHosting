import { redirect } from "next/navigation";

export default function ServerIndex({ params }: { params: { id: string } }) {
  redirect(`/servers/${params.id}/console`);
}
