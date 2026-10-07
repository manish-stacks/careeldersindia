import { Image, Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { fixUrl } from '@/lib/api';
import { humanize } from '@/lib/format';
import { C, R, S } from '@/lib/theme';
import type { Measurements, Media, MedStatus, OverallStatus } from '@/lib/types';
import { OverallBadge } from './status';
import { Badge, Notice, T } from './ui';

export function vitalRows(m: Measurements = {}): [string, string][] {
  const r: [string, string][] = [];
  if (m.bp?.systolic) r.push(['Blood pressure', `${m.bp.systolic}/${m.bp.diastolic}`]);
  if (m.pulse) r.push(['Pulse', `${m.pulse} bpm`]);
  if (m.spo2) r.push(['Oxygen (SpO₂)', `${m.spo2}%`]);
  if (m.temperature?.value) r.push(['Temperature', `${m.temperature.value}°${m.temperature.unit || 'F'}`]);
  if (m.weight?.value) r.push(['Weight', `${m.weight.value} kg`]);
  if (m.bloodSugar?.value) r.push(['Blood sugar', `${m.bloodSugar.value} mg/dL`]);
  return r;
}

type Data = {
  measurements?: Measurements; symptoms?: string[]; symptomNotes?: string; medicationStatus?: MedStatus[]; mobility?: string;
  wellbeing?: Record<string, string | undefined>; notes?: string; overallStatus?: OverallStatus; urgent?: { reason: string; notes: string; recommendedEscalation: string };
  followUpRequired?: boolean; followUpNotes?: string; media?: Media[]; assistantName?: string;
  reports?: { templateId: string; name: string; kind: string; reportDate?: string; checked?: string[]; values?: { key: string; label: string; value: string }[] }[];
  servicesPerformed?: string[]; reportMode?: 'FORM' | 'IMAGE'; labReport?: { reportDate?: string; values: { key: string; label: string; value: string }[] };
};

/** What the family sees after a visit — plain language, measurements first. */
export function VisitSummary({ data }: { data: Data }) {
  const rows = vitalRows(data.measurements);
  const meds = data.medicationStatus || [];
  return (
    <View style={{ gap: S.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
        <OverallBadge status={data.overallStatus} />
        {data.assistantName ? <T v="small">Recorded by {data.assistantName}</T> : null}
      </View>

      {data.overallStatus === 'URGENT_ATTENTION' && data.urgent && (
        <Notice tone="danger" title={data.urgent.reason} body={`${data.urgent.notes}\nSuggested next step: ${humanize(data.urgent.recommendedEscalation)}`} />
      )}

      {rows.length > 0 && (
        <View style={styles.grid}>
          {rows.map(([k, v]) => (
            <View key={k} style={styles.tile}>
              <T v="small">{k}</T>
              <T v="title">{v}</T>
            </View>
          ))}
        </View>
      )}

      {data.reports?.map((r) =>
        r.kind === 'CHECKLIST' ? (
          r.checked?.length ? (
            <View key={r.templateId}>
              <T v="label" style={{ marginBottom: 6 }}>{r.name}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{r.checked.map((c) => <Badge key={c} label={c} tone="ok" />)}</View>
            </View>
          ) : null
        ) : r.values?.some((x) => x.value) ? (
          <View key={r.templateId}>
            <T v="label" style={{ marginBottom: 6 }}>{r.name}{r.reportDate ? ` · ${r.reportDate}` : ''}</T>
            {r.values.filter((x) => x.value).map((x) => (
              <View key={x.key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                <T v="small">{x.label}</T>
                <T weight="semibold">{x.value}</T>
              </View>
            ))}
          </View>
        ) : null
      )}

      {data.servicesPerformed?.length ? (
        <View>
          <T v="label" style={{ marginBottom: 6 }}>Services performed</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{data.servicesPerformed.map((s) => <Badge key={s} label={s} tone="ok" />)}</View>
        </View>
      ) : null}

      {data.labReport?.values?.some((r) => r.value) ? (
        <View>
          <T v="label" style={{ marginBottom: 6 }}>Blood haematology{data.labReport.reportDate ? ` · ${data.labReport.reportDate}` : ''}</T>
          {data.labReport.values.filter((r) => r.value).map((r) => (
            <View key={r.key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <T v="small">{r.label}</T>
              <T weight="semibold">{r.value}</T>
            </View>
          ))}
        </View>
      ) : null}
      {data.reportMode === 'IMAGE' ? <T v="small">Test report was uploaded as an image — see the photos below.</T> : null}

      {(data.symptoms?.length || data.symptomNotes) ? (
        <View>
          <T v="label" style={{ marginBottom: 6 }}>Symptoms mentioned</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{data.symptoms?.map((s) => <Badge key={s} label={s} />)}</View>
          {data.symptomNotes ? <T style={{ marginTop: 6 }}>{data.symptomNotes}</T> : null}
        </View>
      ) : null}

      {meds.length > 0 && (
        <View>
          <T v="label" style={{ marginBottom: 6 }}>Medicines</T>
          {meds.map((m, i) => (
            <View key={i} style={styles.medRow}>
              <T style={{ flex: 1 }}>
                {m.medicineName} <T v="small">· {humanize(m.slot)}</T>
              </T>
              <Badge label={humanize(m.status)} tone={m.status === 'TAKEN' ? 'ok' : m.status === 'MISSED' ? 'danger' : 'neutral'} />
            </View>
          ))}
        </View>
      )}

      {(data.mobility || Object.values(data.wellbeing || {}).some(Boolean)) && (
        <View style={{ gap: 4 }}>
          {data.mobility ? <T><T v="small">Moving around: </T>{humanize(data.mobility)}</T> : null}
          {Object.entries(data.wellbeing || {}).filter(([, v]) => v).map(([k, v]) => (
            <T key={k}><T v="small">{humanize(k)}: </T>{humanize(v)}</T>
          ))}
        </View>
      )}

      {data.notes ? (
        <View>
          <T v="label" style={{ marginBottom: 4 }}>Care assistant&apos;s notes</T>
          <T>{data.notes}</T>
        </View>
      ) : null}

      {data.followUpRequired ? <Notice tone="warn" title="Follow-up suggested" body={data.followUpNotes} /> : null}

      {!!data.media?.length && (
        <View>
          <T v="label" style={{ marginBottom: 6 }}>Photos</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
            {data.media.map((m) => (
              <Pressable key={m._id} accessibilityRole="imagebutton" accessibilityLabel={m.caption || humanize(m.type)} onPress={() => WebBrowser.openBrowserAsync(fixUrl(m.url)!)}>
                {m.mime.startsWith('image/') ? <Image source={{ uri: fixUrl(m.url) }} style={styles.photo} /> : <View style={[styles.photo, { alignItems: 'center', justifyContent: 'center' }]}><T v="small">PDF</T></View>}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <T v="caption">Recorded measurements and observations from a home visit. This is not a medical diagnosis. Please consult a doctor for medical advice.</T>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  tile: { width: '48.5%', backgroundColor: C.canvas, borderRadius: R.md, padding: S.md },
  medRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  photo: { width: 96, height: 96, borderRadius: R.md, backgroundColor: C.canvas, borderWidth: 1, borderColor: C.line },
});
