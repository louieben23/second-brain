"use client";

import Link from "next/link";

export default function SideNav() {
  return (
    <nav className="w-56 h-screen px-4 py-6 bg-[#f7f7f7]    ">
      <ul className="space-y-2">
        <li>
          <Link href="/retrieve" className="block px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-neutral-800">
            Retrieve
          </Link>
        </li>
        <li>
          <Link href="/embeddings" className="block px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-neutral-800">
            Store
          </Link>
        </li>
      </ul>
    </nav>
  );
}
