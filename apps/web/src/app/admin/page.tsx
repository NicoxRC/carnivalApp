import { AdminPanel } from "@/components/admin/AdminPanel";

export const metadata = {
  title: "Administración · Sigue el Desfile",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminPanel />;
}
