import { Stack } from 'expo-router';
import { ReportProvider } from '@/features/report/report-context';

export default function ReportLayout() {
  return (
    <ReportProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ReportProvider>
  );
}
