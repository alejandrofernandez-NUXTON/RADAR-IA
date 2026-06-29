import { AdminNav } from "@/components/admin/admin-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireAdmin } from "@/lib/server-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen bg-background lg:flex">
      <AdminNav email={session.email} />
      <div className="min-w-0 flex-1">
        <div className="hidden justify-end px-4 pt-4 sm:px-6 lg:flex lg:px-8">
          <ThemeToggle />
        </div>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:pt-4">{children}</main>
      </div>
    </div>
  );
}
