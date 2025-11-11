"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SideNav() {
  const pathname = usePathname() || "/";

  const baseLinkClass = "block px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-neutral-800";

  const getClass = (href: string) => {
    const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return `${baseLinkClass} ${isActive ? "bg-gray-200 dark:bg-neutral-800 font-semibold" : ""}`;
  };

  return (
    <nav className="w-56 h-screen px-4 py-6 bg-[#f7f7f7]">
      <div className="mb-6">
        {/* <Link
          href="/"
          className="text-md font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent"
        >
          My Second Brain
        </Link> */}

        {/* User avatar / name / badge */}
        <div className="mt-4 flex items-center space-x-3">
          <div
            className="w-12 h-12 rounded-full bg-gradient-to-r from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold"
            aria-hidden="true"
          >
            JD
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900 dark:text-white">John Doe</span>
            <span className="mt-1 text-xs inline-block rounded-full bg-yellow-100 text-yellow-800 font-semibold">Premium</span>
          </div>
        </div>
      </div>
      <ul className="space-y-2">
        <li>
          <Link href="/" className={getClass("/")}> 
            Search Knowledge
          </Link>
        </li>
        <li>
          <Link href="/embeddings" className={getClass("/embeddings")}>
            Take a Note
          </Link>
        </li>
      </ul>
    </nav>
  );
}
