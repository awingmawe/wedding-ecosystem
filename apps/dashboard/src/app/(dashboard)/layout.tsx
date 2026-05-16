import { DashboardLayout } from '@/components/layout/dashboard-layout';

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
