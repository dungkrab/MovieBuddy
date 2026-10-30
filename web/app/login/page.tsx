import LoginForm from "@/components/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const n = (await searchParams).next ?? "/";
  const next = n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/"; // กัน open redirect
  return <LoginForm next={next} />;
}
