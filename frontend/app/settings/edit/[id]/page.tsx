import { demoProfiles } from '../../../../services/demo/demoData';
import Client from './Client';

export async function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return demoProfiles.map(profile => ({
      id: profile._id,
    }));
  }
  return [];
}

export default function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return <Client params={params} />;
}
