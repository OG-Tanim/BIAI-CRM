import { resolveAiMode } from '@/lib/ai/availability';
import { CaptureForm } from './capture-form';

// The form's AI controls and the always-available manual fields depend on this
// process's environment, so the page cannot be frozen at build time.
export const dynamic = 'force-dynamic';

export default function Home() {
  return <CaptureForm aiMode={resolveAiMode()} />;
}
