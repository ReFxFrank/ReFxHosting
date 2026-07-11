import { HomeClient } from "./home-client";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Game Server Hosting — switch games anytime",
  description:
    "Rent game servers with instant setup, one-click modpacks, backups and DDoS protection — and switch your server to a different game without repurchasing.",
  path: "",
});

export default function HomePage() {
  return <HomeClient />;
}
