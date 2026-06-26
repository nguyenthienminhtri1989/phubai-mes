"use client";

// ElectricShell is now a thin re-export that uses the shared AdminLayout.
// All layout logic (sidebar, header, clock, user menu) lives in AdminLayout.tsx.
export { AdminLayout as ElectricShell } from "@/components/AdminLayout";
