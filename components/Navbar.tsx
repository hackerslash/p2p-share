import React from 'react';
import { Github } from 'lucide-react';
const Navbar: React.FC = () => {
  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.reload();
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <a
            href="/"
            onClick={handleLogoClick}
            className="font-display text-xl tracking-tight text-foreground transition-colors hover:text-primary"
          >
            WarpShare
          </a>
          <span className="hidden rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground sm:inline-flex">
            Direct P2P
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="#about"
            className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground transition-colors hover:text-foreground"
          >
            About
          </a>
          <a
            href="https://github.com/hackerslash/p2p-share"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-white/10 bg-white/10 p-2 text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/15"
            aria-label="Open GitHub"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
