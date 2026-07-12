import { Link } from "@tanstack/react-router";
import logo from "@/assets/hostwell-logo.png";

export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return <img src={logo} alt="Hostwell" className={className} width={512} height={512} />;
}

export function BrandLockup() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <BrandMark className="h-9 w-9" />
      <span className="font-display text-xl font-semibold tracking-tight text-secondary">
        Hostwell
      </span>
    </Link>
  );
}
