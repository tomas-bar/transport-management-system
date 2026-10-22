import { Eye, LogIn } from 'lucide-react';
import { useApp } from '../context';
import { useConfirm } from './Feedback';
import { Button } from './ui';

interface Target {
  id: string;
  name: string;
  companyId?: string;
}

export function ActAsButton({ id, name, companyId }: Target) {
  const { previewUser, busy } = useApp();
  const confirm = useConfirm();

  async function start() {
    const accepted = await confirm(
      `Veiksmai bus išsaugoti ${name} vardu, pagal šio naudotojo teises. Galėsite grįžti į savo paskyrą.`,
      { title: 'Dirbti kaip naudotojas', confirmLabel: 'Pradėti darbą' },
    );
    if (accepted) previewUser(id, { companyId, mode: 'act' });
  }

  return <Button variant="secondary" disabled={busy} onClick={() => void start()}>
    <LogIn size={16} />Dirbti kaip
  </Button>;
}

export function UserPreviewActions(target: Target) {
  const { previewUser, busy } = useApp();
  return <div className="preview-actions">
    <Button variant="ghost" disabled={busy} onClick={() => previewUser(target.id, { companyId: target.companyId, mode: 'read' })}>
      <Eye size={16} />Peržiūrėti
    </Button>
    <ActAsButton {...target} />
  </div>;
}
