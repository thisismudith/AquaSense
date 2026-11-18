import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Alert } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { BackupService, type Backup, type RestoreReport } from '@/services/backup/BackupService';
import { useAppStore, useServices } from '@/store/appStore';
import { formatDateTime } from '@/utils/format';

/** Screen 40 — Backup and restore (A15). Local file; user chooses where to keep it via the share sheet. */
export default function BackupRestore() {
  const { backup, exporter, fs } = useServices();
  const touch = useAppStore((s) => s.touchData);
  const [busy, setBusy] = useState<'backup' | 'pick' | 'restore' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'warning' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);

  const create = async () => {
    setBusy('backup');
    setMsg(null);
    try {
      const b = await backup.createBackup();
      const uri = await exporter.writeBackup(JSON.stringify(b));
      const r = await exporter.share(uri, 'application/json', 'Save AquaSense backup');
      setMsg({ tone: r.ok ? 'success' : 'warning', text: `Backup created: ${b.data.results.length} results, ${b.data.samples.length} samples, ${b.photos.length} photos.${r.ok ? '' : ` Saved in app storage at ${uri}.`}` });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const pick = async () => {
    setBusy('pick');
    setMsg(null);
    setReport(null);
    setPending(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets[0]) return;
      const v = BackupService.validate(await fs.readText(res.assets[0].uri));
      if (!v.ok) setMsg({ tone: 'danger', text: `Cannot restore: ${v.detail}` });
      else setPending(v.backup);
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const restore = () => {
    if (!pending) return;
    Alert.alert('Restore backup?', 'Records from the backup are added. Existing records on this phone are never overwritten; differences are listed as conflicts.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: () => {
          setBusy('restore');
          void backup
            .restore(pending)
            .then((r) => {
              setReport(r);
              setPending(null);
              touch();
              setMsg({ tone: r.conflicts.length ? 'warning' : 'success', text: 'Restore finished.' });
            })
            .catch((e: unknown) => setMsg({ tone: 'danger', text: `Restore failed and was rolled back: ${e instanceof Error ? e.message : String(e)}` }))
            .finally(() => setBusy(null));
        },
      },
    ]);
  };

  return (
    <Screen title="Backup & restore" back testID="backup">
      {msg ? <Banner tone={msg.tone} message={msg.text} testID="backup-msg" /> : null}
      <Card>
        <AppText variant="title">Create backup</AppText>
        <AppText color="muted">Includes results, samples with photos, calibrations, reagents, device sync state and settings, in a versioned file.</AppText>
        <Button label="Create backup file" icon="cloud-download-outline" loading={busy === 'backup'} onPress={() => void create()} testID="backup-create" />
      </Card>
      <Card>
        <AppText variant="title">Restore</AppText>
        <AppText color="muted">Choose an AquaSense backup file. It is validated before anything is changed.</AppText>
        <Button label="Choose backup file" icon="folder-open-outline" variant="secondary" loading={busy === 'pick'} onPress={() => void pick()} testID="backup-pick" />
      </Card>
      {pending ? (
        <Card testID="backup-summary">
          <AppText variant="title">Backup from {formatDateTime(pending.createdAt)}</AppText>
          <ListRow title="Results" value={String(pending.data.results.length)} />
          <ListRow title="Samples" value={String(pending.data.samples.length)} />
          <ListRow title="Photos" value={String(pending.photos.length)} />
          <ListRow title="Calibrations" value={String(pending.data.calibrations.length)} />
          <ListRow title="Reagents" value={String(pending.data.reagents.length)} />
          <Button label="Restore these records" loading={busy === 'restore'} onPress={restore} testID="backup-restore" />
        </Card>
      ) : null}
      {report ? (
        <Card testID="backup-report">
          <AppText variant="title">Restore report</AppText>
          {Object.entries(report.inserted).map(([k, v]) => (
            <ListRow key={k} title={`Added ${k}`} value={String(v)} />
          ))}
          <ListRow title="Already present (identical)" value={String(report.skippedIdentical)} />
          <ListRow title="Conflicts (kept existing)" value={String(report.conflicts.length)} />
          {report.conflicts.slice(0, 20).map((c) => (
            <AppText key={`${c.table}-${c.id}`} variant="caption" color="warning">
              • {c.table}: {c.reason}
            </AppText>
          ))}
          {report.warnings.map((w) => (
            <AppText key={w} variant="caption" color="muted">
              • {w}
            </AppText>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
