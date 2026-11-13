import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LineEditor, rupeesToPaise } from './LineEditor';

afterEach(cleanup);

const value = { productName: 'Atta', quantity: 2, unit: 'kg', unitPricePaise: 4550 };

describe('LineEditor', () => {
  it('exposes labelled fields with current values', () => {
    render(
      <LineEditor
        value={value}
        index={1}
        units={['kg', 'l']}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    );
    expect((screen.getByLabelText('Product') as HTMLInputElement).value).toBe('Atta');
    expect((screen.getByLabelText('Quantity') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('Unit') as HTMLSelectElement).value).toBe('kg');
    expect((screen.getByLabelText('Price (₹)') as HTMLInputElement).value).toBe('45.50');
  });

  it('reports edits, with price as integer Paise', () => {
    const onChange = vi.fn();
    render(
      <LineEditor
        value={value}
        index={1}
        units={['kg', 'l']}
        onChange={onChange}
        onRemove={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Price (₹)'), { target: { value: '12.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, unitPricePaise: 1250 });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'l' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, unit: 'l' });
  });

  it('flags invalid price and calls onRemove', () => {
    const onRemove = vi.fn();
    render(
      <LineEditor value={value} index={2} units={['kg']} onChange={() => {}} onRemove={onRemove} />,
    );
    fireEvent.change(screen.getByLabelText('Price (₹)'), { target: { value: 'abc' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove line 2' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('rupeesToPaise parses exactly', () => {
    expect(rupeesToPaise('0.1')).toBe(10);
    expect(rupeesToPaise('45')).toBe(4500);
    expect(rupeesToPaise('1.234')).toBeNull();
    expect(rupeesToPaise('')).toBeNull();
  });
});
