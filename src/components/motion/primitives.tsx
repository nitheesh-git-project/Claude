"use client";

import Link from "next/link";
import { motion, type Variants, type HTMLMotionProps } from "motion/react";

/**
 * Shared motion primitives used across the public marketing pages.
 * Kept as client components so the pages that render them (mostly async
 * Server Components fetching Supabase data) don't need "use client"
 * themselves — only these leaf pieces do.
 */

const EASE = [0.16, 1, 0.3, 1] as const; // expo-out — snappy but smooth

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section";
}) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={fadeUpVariants}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </Comp>
  );
}

const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.05 },
  },
};

export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={staggerContainer}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={fadeUpVariants}>
      {children}
    </motion.div>
  );
}

type MotionButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "dark" | "ghost" | "purple";
  className?: string;
  onClick?: () => void;
  fullWidth?: boolean;
};

const variantClasses: Record<NonNullable<MotionButtonProps["variant"]>, string> = {
  primary:
    "bg-teal-700 text-white shadow-lg shadow-teal-900/15 hover:bg-teal-800",
  secondary:
    "bg-white text-slate-700 border border-slate-200 hover:border-slate-300 shadow-sm",
  dark: "bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/20",
  ghost: "bg-white/10 text-white border border-white/25 hover:bg-white/15 backdrop-blur",
  purple:
    "bg-purple-700 text-white shadow-lg shadow-purple-900/15 hover:bg-purple-800",
};

/** A CTA link with a spring press/hover response and a sliding-arrow micro-interaction. */
export function MotionButton({
  href,
  children,
  variant = "primary",
  className = "",
  onClick,
  fullWidth = false,
}: MotionButtonProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={fullWidth ? "block w-full" : "inline-block"}
    >
      <Link
        href={href}
        onClick={onClick}
        className={`group inline-flex items-center gap-2 font-semibold rounded-xl px-6 py-3.5 text-sm transition-colors ${variantClasses[variant]} ${className}`}
      >
        {children}
      </Link>
    </motion.div>
  );
}

/** Wraps arbitrary motion.div props for one-off custom animated blocks. */
export function MotionDiv(props: HTMLMotionProps<"div">) {
  return <motion.div {...props} />;
}

/** Slow-drifting blurred gradient orbs used behind hero/section backgrounds. */
export function FloatingOrbs({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <motion.div
        className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-teal-300/30 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-16 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl"
        animate={{ x: [0, -25, 0], y: [0, 25, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-200/25 blur-3xl"
        animate={{ x: [0, 20, 0], y: [0, -20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/** Fades/scales a whole card in on view, plus a gentle hover lift — used for grid cards. */
export function AnimatedCard({
  children,
  className = "",
  href,
}: {
  children: React.ReactNode;
  className?: string;
  href?: string;
}) {
  const inner = (
    <motion.div
      variants={fadeUpVariants}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={className}
    >
      {children}
    </motion.div>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  );
}
