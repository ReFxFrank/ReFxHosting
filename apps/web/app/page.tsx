import { redirect } from "next/navigation";

// The marketing/landing page is out of scope for the panel; send users into
// the app. Unauthenticated users get bounced to /login by the dashboard guard.
export default function Home() {
  redirect("/dashboard");
}
