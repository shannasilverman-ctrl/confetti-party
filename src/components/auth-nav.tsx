import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, UserCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AuthNav({ variant = "landing" }: { variant?: "landing" | "app" }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return <div className="h-9 w-24" />;

  if (!user) {
    if (variant === "app") {
      return (
        <Button asChild size="sm" variant="ghost">
          <Link to="/auth">Sign in</Link>
        </Button>
      );
    }
    return (
      <>
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth" search={{ mode: "signin" }}>
            Sign in
          </Link>
        </Button>
        <Button asChild size="sm" variant="festive">
          <Link to="/auth" search={{ mode: "signup" }}>
            Get started
          </Link>
        </Button>
      </>
    );
  }

  const label = user.email ?? "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <UserCircle2 className="h-4 w-4" />
          <span className="max-w-[160px] truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {variant === "landing" && (
          <DropdownMenuItem asChild>
            <Link to="/app">Your parties</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            void navigate({ to: "/" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
