'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const thisYear = () => new Date().getFullYear();
const noYear = () => null;

/**
 * "© <year> หลงรักแชท". The year comes from the visitor's clock after hydration, so prerendered
 * pages never show the year they were built in and the line rolls over by itself each new year.
 */
export default function Copyright({ className }: { className?: string }) {
  const year = useSyncExternalStore(subscribe, thisYear, noYear);
  return <p className={className}>© {year ?? ''} หลงรักแชท สงวนลิขสิทธิ์</p>;
}
