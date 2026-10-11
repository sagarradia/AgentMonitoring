'use client';
import { useEffect } from 'react';

/* The page's DOM is driven by the ported view code (components/desk.ts), exactly as the
   original single-page app drove it; React only provides the three mount points. */
export default function Desk() {
  useEffect(() => { import('./desk').then((m) => m.mount()) }, []);
  return (
    <>
      <div id="app" suppressHydrationWarning />
      <div id="overlay" suppressHydrationWarning />
      <div id="toast" role="status" hidden suppressHydrationWarning />
    </>
  );
}
