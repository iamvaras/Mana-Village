import { Redirect } from 'expo-router';

/** Placeholder for the Report tab button; pressing it opens /report instead. */
export default function ReportTab() {
  return <Redirect href="/report" />;
}
