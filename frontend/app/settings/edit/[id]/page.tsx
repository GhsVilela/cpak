import { demoProfiles } from '../../../../services/demo/demoData';
import Client from './Client';

export async function generateStaticParams() {
  return demoProfiles.map(profile => ({
    id: profile._id,
  }));
}

export default function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return <Client params={params} />;
}
