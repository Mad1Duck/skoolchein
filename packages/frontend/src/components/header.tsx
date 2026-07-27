import { Link, useLocation } from "@tanstack/react-router";
import { NeoButton } from "./ui/NeoButton";
import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import gsap from "gsap";
import { v4Addresses, scholarshipCoreAbi } from "@/constants/contractsV4";

const navItems = [
  { href: "/",          label: "Home" },
  { href: "/programs",  label: "Scholarships" },
  { href: "/vote",      label: "Vote" },
  { href: "/dashboard", label: "My Dashboard" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const breakpoint = useBreakpoint();
  const location = useLocation();
  const currentPath = location.pathname;
  const ref = useRef<HTMLDivElement>(null);

  const { address } = useAccount();
  const { data: adminAddress } = useReadContract({
    address: v4Addresses.ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: "admin",
  });

  const isAdmin = address && adminAddress && address.toLowerCase() === (adminAddress as string).toLowerCase();

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: "100%" },
      { opacity: 1, y: "0%", duration: 2, ease: "power3.out" }
    );
  }, []);

  return (
    <header
      ref={ref}
      className="flex max-lg:flex-col py-[1.375rem] px-6 bg-white m-9 max-md:mx-3 justify-between items-center rounded-2xl border-2 border-black shadow-[inset_0_-1px_1px_0_rgba(0,0,0,0.1)] shrink-0 z-[10]"
    >
      <div className="flex justify-between max-lg:self-stretch">
        <Link to="/programs">
          <img src="/skoolcein-logo.svg" alt="logo" />
        </Link>
        <button className="hidden max-lg:block" onClick={() => setOpen(!open)}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M4 5H20"
              stroke="black"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 12H20"
              stroke="black"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 19H20"
              stroke="black"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <nav
        className={`max-lg:self-stretch ${open ? "max-lg:block" : "max-lg:hidden"}`}
      >
        <ul className="flex gap-6 text-gray-800 items-center max-lg:flex-col max-lg:items-start max-lg:mt-5">
          {navItems.map(({ href, label }) => {
            const isActive = currentPath === href || currentPath.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  to={href}
                  className={`flex py-2 px-2.5 justify-center items-center gap-2.5 font-medium transition-all duration-200 ${
                    isActive
                      ? "font-extrabold text-skpurple"
                      : "hover:text-skpurple"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
          {isAdmin && (
            <li>
              <Link
                to="/admin"
                className={`flex py-2 px-2.5 justify-center items-center gap-2.5 font-medium transition-all duration-200 ${
                  currentPath.startsWith("/admin")
                    ? "font-extrabold text-skred"
                    : "hover:text-skred"
                }`}
              >
                Admin
              </Link>
            </li>
          )}
        </ul>
        {breakpoint.isLessThan("lg") && (
          <div className="mt-5">
            <NeoButton label="Connect Wallet" variant="connect" size="md" />
          </div>
        )}
      </nav>
      {breakpoint.isAtLeast("lg") && (
        <NeoButton label="Connect Wallet" variant="connect" size="sm" />
      )}
    </header>
  );
}
