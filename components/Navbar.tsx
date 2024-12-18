import React from 'react';

const Navbar: React.FC = () => {
  return (
    <nav className="bg-indigo-600 p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="text-white font-bold text-xl">P2P File Share</div>
        <div>
          <a href="#about" className="text-white hover:text-indigo-200">About</a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

