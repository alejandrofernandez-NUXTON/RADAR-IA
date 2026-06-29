import Link from "next/link";
import { GraduationCap, LayoutDashboard, Newspaper, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink } from "@/components/ui/button";

export function MainNav() {
  const links = [
    { href: "/", label: "Radar", icon: LayoutDashboard },
    { href: "/news", label: "Noticias", icon: Newspaper },
    { href: "/training", label: "Formaciones", icon: GraduationCap }
  ];

  return (
    <header className="border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground">AI</span>
          <span>Radar IA</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Icon className="h-4 w-4" aria-hidden />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/admin" variant="outline" size="sm">
            <Settings className="h-4 w-4" aria-hidden />
            Admin
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
