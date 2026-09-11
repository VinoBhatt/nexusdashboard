import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { SkeletonPage, QueryError } from "../../components/QueryState";
import { NotificationList, type NotificationRow } from "../../components/notifications/NotificationList";

export default function RetailNotifications() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiGet<{ notifications: NotificationRow[] }>("/api/notifications"),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError || !data) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Notifications" description="Updates on payments, payouts, bonus credits and messages from Cofundr." />
      <div className="card">
        <NotificationList rows={data.notifications} />
      </div>
    </>
  );
}
