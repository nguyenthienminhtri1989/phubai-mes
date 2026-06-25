import type { ReactNode } from "react";
import { ElectricShell } from "@/components/electric/ElectricShell";

export default function ElectricLayout({ children }: { children: ReactNode }) {
  return <ElectricShell>{children}</ElectricShell>;
}
