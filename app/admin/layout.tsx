import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/server-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen bg-background lg:flex">
      <AdminNav email={session.email} />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
