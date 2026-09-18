import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ivory-50 px-6 text-center">
      <p className="font-serif text-6xl text-navy-900">404</p>
      <p className="text-sm text-slate-500">The page you are looking for does not exist or you may not have access to it.</p>
      <Link href="/" className="btn-primary mt-2">
        Back to homepage
      </Link>
    </div>
  );
}
