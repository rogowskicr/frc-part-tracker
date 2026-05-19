'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';

interface NavProps {
  userName: string;
  teamName: string;
  teamId: string | null;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assemblies', label: 'Assemblies' },
  { href: '/parts', label: 'Parts' },
  { href: '/manufacturing', label: 'Manufacturing' },
  { href: '/orders', label: 'Orders' },
];

export default function Navbar({ userName, teamName, teamId }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-900 text-white border-b-2 border-amber-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg tracking-tight">
              <img src="/logo.png" alt="ORF 4450" className="h-8 w-8 object-contain" />
              <span>ORF 4450 <span className="text-amber-400">Part Tracker</span></span>
            </Link>
            <div className="flex gap-1">
              {navItems.map((item) => {
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-700 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {teamId ? (
              <Link href={`/team/${teamId}`} className="text-gray-400 hover:text-gray-200 transition-colors">
                {teamName}
              </Link>
            ) : (
              <span className="text-gray-500 text-xs">No team</span>
            )}
            <span className="text-gray-300">{userName}</span>
            <form action={logout}>
              <button
                type="submit"
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  );
}
