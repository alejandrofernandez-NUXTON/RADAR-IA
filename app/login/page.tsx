import { Lock } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const current = params[key];
  return Array.isArray(current) ? current[0] : current || "";
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = value(params, "error");
  const next = value(params, "next") || "/admin";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Lock className="h-5 w-5" aria-hidden />
          </div>
          <CardTitle>Acceso administrador</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">Introduce las credenciales creadas en el seed inicial.</p>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">Credenciales no validas.</p> : null}
          <form action="/api/auth/login" method="post" className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
