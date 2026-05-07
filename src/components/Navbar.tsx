'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';

interface NavProps {
  userName: string;
  teamName: string;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assemblies', label: 'Assemblies' },
  { href: '/parts', label: 'Parts' },
];

export default function Navbar({ userName, teamName }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
              <span className="text-blue-400">⚙</span>
              <span>FRC Part Tracker</span>
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
                        ? 'bg-gray-700 text-white'
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
            <span className="text-gray-400">{teamName}</span>
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
