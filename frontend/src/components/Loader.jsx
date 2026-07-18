import React from "react";

export default function Loader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-paper gap-4">
      <div className="loader-b" />
      <p className="text-xs font-bold uppercase tracking-widest">
        Loading<span className="animate-blink">_</span>
      </p>
    </div>
  );
}
