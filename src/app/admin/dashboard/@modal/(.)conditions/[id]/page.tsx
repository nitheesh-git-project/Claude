import DetailOverlayModal from "@/components/admin/DetailOverlayModal";
import ConditionDetailContent from "@/components/admin/ConditionDetailContent";

export default async function ConditionDetailModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <DetailOverlayModal>
      <ConditionDetailContent id={id} />
    </DetailOverlayModal>
  );
}
