import { PanelAdmin } from "@/components/admin/PanelAdmin";

export const metadata = {
  title: "Administración · Sigue el Desfile",
  robots: { index: false, follow: false },
};

export default function Pagina() {
  return <PanelAdmin />;
}
