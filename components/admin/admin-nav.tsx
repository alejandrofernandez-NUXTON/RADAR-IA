import Link from "next/link";
import { BookOpen, Briefcase, Film, Newspaper, PlayCircle, Settings, SlidersHorizontal, Stethoscope } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin", label: "Panel", icon: Briefcase },
  { href: "/admin/settings", label: "Ajustes", icon: Settings },
  { href: "/admin/sources", label: "Fuentes", icon: SlidersHorizontal },
  { href: "/admin/news", label: "Noticias", icon: Newspaper },
  { href: "/admin/videos", label: "Videos", icon: Film },
  { href: "/admin/training", label: "Formaciones", icon: BookOpen },
  { href: "/admin/jobs", label: "Jobs", icon: PlayCircle },
  { href: "/admin/diagnostics", label: "Diagnostico", icon: Stethoscope }
];

export function AdminNav({ email }: { email: string }) {
  return (
    <aside className="border-b border-border bg-card lg:flex lg:min-h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 px-4 py-4 lg:block">
        <Link href="/admin" className="flex min-w-0 items-center gap-3 font-semibold">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground">NX</span>
          <span className="min-w-0">
            <span className="block truncate text-sm leading-5">Nuxton Knowledge Platform</span>
            <span className="block text-xs font-medium leading-4 text-muted-foreground">Admin</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <form action="/api/auth/logout" method="post">
            <Button variant="ghost" size="sm" type="submit">
              Salir
            </Button>
          </form>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground lg:w-full"
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden border-t border-border p-4 lg:block">
        <p className="truncate text-xs text-muted-foreground">{email}</p>
        <form action="/api/auth/logout" method="post" className="mt-3">
          <Button variant="outline" size="sm" type="submit" className="w-full">
            Cerrar sesion
          </Button>
        </form>
      </div>
    </aside>
  );
}
