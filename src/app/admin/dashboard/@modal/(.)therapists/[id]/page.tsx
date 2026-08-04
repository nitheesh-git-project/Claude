import DetailOverlayModal from "@/components/admin/DetailOverlayModal";
import TherapistDetailContent from "@/components/admin/TherapistDetailContent";

export default async function TherapistDetailModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <DetailOverlayModal>
      <TherapistDetailContent id={id} />
    </DetailOverlayModal>
  );
}
