import React from 'react';
import { Github } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const Navbar: React.FC = () => {
  const router = useRouter();

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.reload();
  };

  return (
    <nav className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex-shrink-0">
            <a 
              href="/"
              onClick={handleLogoClick}
              className="text-xl font-semibold tracking-tight hover:text-primary transition-colors"
            >
              WarpShare ⚡
            </a>
          </div>
          <div className="flex items-center space-x-4">
            <a href="#about" className="text-muted-foreground hover:text-foreground transition-colors">
              About
            </a>
            <a
              href="https://github.com/hackerslash/p2p-share"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-accent"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

