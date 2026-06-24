import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard-layout';
import DashboardOverviewPage from '@/pages/dashboard-overview-page';
import QueueManagementPage from '@/pages/queue-management-page';
import CircuitBreakerStatusPage from '@/pages/circuit-breaker-page';
import MonitoringAlertsPage from '@/pages/monitoring-alerts-page';
import RequestHistoryPage from '@/pages/request-history-page';
import DlqPage from '@/pages/dlq-page';
import HealthPage from '@/pages/health-page';
import SettingsPage from '@/pages/settings-page';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<DashboardOverviewPage />} />
          <Route path="queue" element={<QueueManagementPage />} />
          <Route path="circuit-breaker" element={<CircuitBreakerStatusPage />} />
          <Route path="monitoring" element={<MonitoringAlertsPage />} />
          <Route path="history" element={<RequestHistoryPage />} />
          <Route path="dlq" element={<DlqPage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
