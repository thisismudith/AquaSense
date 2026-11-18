import { fireEvent, render, screen } from '@testing-library/react-native';

import { buildPath, LineChart } from '@/components/charts/LineChart';
import { ProgressRing } from '@/components/charts/ProgressRing';
import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { DropletLogo, Hero } from '@/components/common/Brand';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Chip, StatusPill } from '@/components/common/Pills';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { CameraPill, ConnectionPill, ParameterBadge, PermissionNotice, QualityPill } from '@/components/domain';
import { TextField } from '@/components/forms/TextField';
import { t } from '@/i18n';
import { resolveTheme, ThemeProvider } from '@/theme/ThemeProvider';
import { darkTheme, lightTheme } from '@/theme/tokens';
import { convertConcentration, formatConcentration, formatDateTime, relativeTime } from '@/utils/format';

jest.mock('@/services/permissions/permissions', () => ({ openAppSettings: jest.fn() }));

const wrap = (ui: React.ReactElement, pref: 'light' | 'dark' = 'light') => render(<ThemeProvider preference={pref}>{ui}</ThemeProvider>);

describe('theme (UI)', () => {
  it('light by default, dark when chosen, system follows OS', () => {
    expect(resolveTheme('light', 'dark')).toBe(lightTheme);
    expect(resolveTheme('dark', 'light')).toBe(darkTheme);
    expect(resolveTheme('system', 'dark')).toBe(darkTheme);
    expect(resolveTheme('system', null)).toBe(lightTheme);
  });
});

describe('components (UI)', () => {
  it('Button fires, and is inert while loading/disabled', () => {
    const fn = jest.fn();
    wrap(
      <>
        <Button label="Go" onPress={fn} />
        <Button label="Busy" onPress={fn} loading />
        <Button label="Off" onPress={fn} disabled />
      </>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    fireEvent.press(screen.getByRole('button', { name: 'Busy' }));
    fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('renders text, cards, rows, pills, chips, banners, states in light and dark', () => {
    for (const pref of ['light', 'dark'] as const) {
      const onChip = jest.fn();
      const onRetry = jest.fn();
      const r = wrap(
        <>
          <AppText variant="h1">Heading</AppText>
          <Card>
            <ListRow title="Row" subtitle="sub" value="1.0" icon="water" onPress={jest.fn()} />
          </Card>
          <StatusPill tone="success" label="OK" />
          <Chip label="Cr(VI)" selected={false} onPress={onChip} />
          <Banner tone="warning" title="Careful" message="msg" />
          <LoadingState />
          <EmptyState title="Nothing yet" />
          <ErrorState message="boom" onRetry={onRetry} />
          <Hero>
            <DropletLogo />
          </Hero>
        </>,
        pref,
      );
      expect(screen.getByRole('header')).toHaveTextContent('Heading');
      fireEvent.press(screen.getByRole('button', { name: 'Cr(VI)' }));
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
      expect(onChip).toHaveBeenCalled();
      expect(onRetry).toHaveBeenCalled();
      expect(screen.getByTestId('loading-state')).toBeTruthy();
      r.unmount();
    }
  });

  it('TextField shows error with alert role', () => {
    wrap(<TextField label="Sample name" value="" error="Required" onChangeText={jest.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.getByLabelText('Sample name')).toBeTruthy();
  });

  it('domain pills and badges', () => {
    wrap(
      <>
        <ParameterBadge parameter="cr6" />
        <QualityPill quality="retest_required" />
        <CameraPill status="unknown" raw="weird" />
        <ConnectionPill state="reconnecting" attempt={3} />
      </>,
    );
    expect(screen.getByText('Re-test needed')).toBeTruthy();
    expect(screen.getByText('Camera status: weird')).toBeTruthy();
    expect(screen.getByText('Reconnecting (attempt 3)…')).toBeTruthy();
  });

  it('PermissionNotice: explanation first, Settings path when blocked, hidden when granted', () => {
    const req = jest.fn();
    const r = wrap(<PermissionNotice kind="camera" outcome={null} onRequest={req} />);
    expect(screen.getByText(t('perm.camera.why'))).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Allow' }));
    expect(req).toHaveBeenCalled();
    r.rerender(
      <ThemeProvider preference="light">
        <PermissionNotice kind="camera" outcome="blocked" onRequest={req} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeTruthy();
    r.rerender(
      <ThemeProvider preference="light">
        <PermissionNotice kind="camera" outcome="granted" onRequest={req} />
      </ThemeProvider>,
    );
    expect(screen.queryByText(t('perm.camera.why'))).toBeNull();
  });

  it('ProgressRing clamps and exposes progress', () => {
    wrap(<ProgressRing progress={1.7} />);
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
  });

  it('LineChart handles too-few points', () => {
    wrap(<LineChart points={[{ x: 1, y: 1 }]} />);
    expect(screen.getByText('Not enough data to plot')).toBeTruthy();
  });
});

describe('helpers (UNIT)', () => {
  it('buildPath scales into the box, handles flat and empty series', () => {
    const r = buildPath([{ x: 0, y: 0 }, { x: 10, y: 5 }], 100, 50, 0);
    expect(r.d).toBe('M0.0,50.0 L100.0,0.0');
    expect(buildPath([], 100, 50).d).toBe('');
    const flat = buildPath([{ x: 0, y: 2 }, { x: 1, y: 2 }], 100, 50, 0);
    expect(flat.ys).toEqual([25, 25]);
  });

  it('concentration formatting never fabricates', () => {
    expect(formatConcentration(null, 'mg/L')).toBe('—');
    expect(formatConcentration(Number.NaN, 'mg/L')).toBe('—');
    expect(formatConcentration(0.0523, 'mg/L')).toBe('0.0523 mg/L');
    expect(formatConcentration(0.0523, 'µg/L')).toBe('52.30 µg/L');
    expect(formatConcentration(0.4, 'mg/L', false)).toBe('0.400');
    expect(convertConcentration(1, 'µg/L')).toBe(1000);
  });

  it('dates', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('garbage')).toBe('—');
    expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 min ago');
    expect(relativeTime(null)).toBe('never');
  });

  it('i18n interpolation and missing params', () => {
    expect(t('parameter.range', { min: 0.05, max: 1, unit: 'mg/L' })).toBe('Working range 0.05–1 mg/L');
    expect(t('ble.state.reconnecting')).toBe('Reconnecting (attempt {n})…');
  });
});
