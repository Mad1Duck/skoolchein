import { Link, useLocation } from "@tanstack/react-router";
import { NeoButton } from "./ui/NeoButton";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { v4Addresses, scholarshipCoreAbi } from "@/constants/contractsV4";

const navItems = [
  { href: "/programs",  label: "Programs" },
  { href: "/vote",      label: "Vote" },
  { href: "/disputes",  label: "Disputes" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const currentPath = location.pathname;

  const { address } = useAccount();
  const { data: adminAddress } = useReadContract({
    address: v4Addresses.ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: "admin",
  });

  const isAdmin = address && adminAddress && address.toLowerCase() === (adminAddress as string).toLowerCase();

  return (
    <header className="sticky top-0 z-50 bg-white border-b-2 border-black">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-14">
          <Link to="/programs" className="flex items-center shrink-0">
            <img src="/skoolcein-logo.svg" alt="Skoolcein" className="h-7" />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map(({ href, label }) => {
              const isActive = currentPath === href || currentPath.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  to={href}
                  className={`
                    px-3 py-1.5 rounded-md text-sm font-bold border-2 transition-all duration-100
                    ${isActive
                      ? "bg-skpurple text-white border-black shadow-[2px_2px_0_0_#000]"
                      : "bg-white text-gray-800 border-transparent hover:bg-gray-100 hover:text-skpurple"
                    }
                  `}
                >
                  {label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                to="/admin"
                className={`
                  px-3 py-1.5 rounded-md text-sm font-bold border-2 transition-all duration-100
                  ${currentPath.startsWith("/admin")
                    ? "bg-skred text-white border-black shadow-[2px_2px_0_0_#000]"
                    : "bg-white text-skred border-transparent hover:bg-skred-light"
                  }
                `}
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="hidden lg:block">
            <NeoButton label="Connect" variant="connect" size="sm" />
          </div>

          {/* Mobile Toggle */}
          <button
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-md border-2 border-black bg-white shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-100"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
              {open ? (
                <path d="M4 4 L20 20 M20 4 L4 20" />
              ) : (
                <path d="M3 6 H21 M3 12 H21 M3 18 H21" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {open && (
        <div className="lg:hidden border-t-2 border-black bg-white">
          <nav className="px-4 py-3 space-y-1">
            {navItems.map(({ href, label }) => {
              const isActive = currentPath === href || currentPath.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  to={href}
                  onClick={() => setOpen(false)}
                  className={`
                    block px-3 py-2.5 rounded-md text-sm font-bold border-2 transition-all duration-100
                    ${isActive
                      ? "bg-skpurple text-white border-black shadow-[2px_2px_0_0_#000]"
                      : "bg-white text-gray-800 border-transparent hover:bg-gray-100"
                    }
                  `}
                >
                  {label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className={`
                  block px-3 py-2.5 rounded-md text-sm font-bold border-2 transition-all duration-100
                  ${currentPath.startsWith("/admin")
                    ? "bg-skred text-white border-black shadow-[2px_2px_0_0_#000]"
                    : "bg-white text-skred border-transparent hover:bg-skred-light"
                  }
                `}
              >
                Admin
              </Link>
            )}
            <div className="pt-3 border-t-2 border-gray-200 mt-2">
              <NeoButton label="Connect Wallet" variant="connect" size="md" fullWidth />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
