import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SyncSettings, type SyncSettingsProps } from './SyncSettings';

afterEach(cleanup);

const setup = (over: Partial<SyncSettingsProps> = {}) => {
  const props: SyncSettingsProps = {
    optedIn: false,
    signedIn: false,
    syncTranscripts: false,
    onOptInChange: vi.fn(),
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onSyncTranscriptsChange: vi.fn(),
    onExportData: vi.fn(),
    onClearData: vi.fn(),
    ...over,
  };
  render(<SyncSettings {...props} />);
  return props;
};

describe('SyncSettings', () => {
  it('not opted in: explains what syncs, hides sign-in, opt-in is explicit', () => {
    const p = setup();
    expect(screen.getByText(/Audio is never uploaded/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    const box = screen.getByLabelText('Turn on cloud sync') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(p.onOptInChange).toHaveBeenCalledWith(true);
  });

  it('opted in but signed out: sign-in form submits credentials', () => {
    const p = setup({ optedIn: true });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' a@b.co ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(p.onSignIn).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret12' });
    expect(screen.queryByLabelText('Sync transcripts')).toBeNull();
  });

  it('signed in: Sync transcripts is off by default and toggles via callback', () => {
    const p = setup({ optedIn: true, signedIn: true });
    const box = screen.getByLabelText('Sync transcripts') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(p.onSyncTranscriptsChange).toHaveBeenCalledWith(true);
  });

  it('export calls back; clear needs confirmation', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Export local data' }));
    expect(p.onExportData).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Clear local data' }));
    expect(p.onClearData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete local data' }));
    expect(p.onClearData).toHaveBeenCalledOnce();
  });
});
