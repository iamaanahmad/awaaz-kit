import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Onboarding } from './Onboarding';

afterEach(cleanup);

const setup = () => {
  const props = {
    onSelectDemoShop: vi.fn(),
    onCreateLocalShop: vi.fn(),
    onDownloadModel: vi.fn(),
    onContinueTyping: vi.fn(),
  };
  render(
    <Onboarding
      {...props}
      modelStatus={{ kind: 'missing' }}
      modelApproxSizeBytes={150 * 1024 * 1024}
    />,
  );
  return props;
};

describe('Onboarding', () => {
  it('explains local storage, labels demo as fictional, shows model status', () => {
    setup();
    expect(screen.getByText(/stored locally on this device/)).toBeTruthy();
    expect(screen.getByText(/fictional/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download model' })).toBeTruthy();
  });

  it('selects the Demo Shop', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Use Demo Shop' }));
    expect(p.onSelectDemoShop).toHaveBeenCalledOnce();
  });

  it('creates a local shop with a trimmed name', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('Shop name'), { target: { value: '  Sharma Store ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create shop' }));
    expect(p.onCreateLocalShop).toHaveBeenCalledWith('Sharma Store');
  });

  it('rejects a blank shop name', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('Shop name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create shop' }));
    expect(p.onCreateLocalShop).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Enter a shop name');
  });
});
