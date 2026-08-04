import DetailOverlayModal from "@/components/admin/DetailOverlayModal";
import PatientDetailContent from "@/components/admin/PatientDetailContent";

export default async function PatientDetailModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <DetailOverlayModal>
      <PatientDetailContent id={id} />
    </DetailOverlayModal>
  );
}
